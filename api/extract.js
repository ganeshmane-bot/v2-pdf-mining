export const config = { api: { bodyParser: { sizeLimit: '20mb' } } }

const MAX_PAGES_PER_REQUEST = 4

const EMPTY_MEMORY = {
  brand_name: '',
  collection_name: '',
  subcategory: '',
  default_finish: '',
  default_base_material: '',
  special_features_common: '',
  applications_common: '',
  technical_data_common: '',
}

const PRODUCT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page_no: { type: 'integer' },
    sku: { type: 'string' },
    sku_source: { type: 'string' },
    name: { type: 'string' },
    brand_name: { type: 'string' },
    collection_name: { type: 'string' },
    category: { type: 'string' },
    subcategory: { type: 'string' },
    product_tagline: { type: 'string' },
    size: { type: 'string' },
    length_mm: { type: 'string' },
    width_mm: { type: 'string' },
    thickness_mm: { type: 'string' },
    finish: { type: 'string' },
    base_material: { type: 'string' },
    color: { type: 'string' },
    color_code: { type: 'string' },
    color_family: { type: 'string' },
    texture: { type: 'string' },
    look: { type: 'string' },
    pattern_type: { type: 'string' },
    application_area: { type: 'string' },
    placement: { type: 'string' },
    special_features: { type: 'string' },
    technical_data: { type: 'string' },
    notes: { type: 'string' },
    confidence_score: { type: 'number' },
    review_flag: { type: 'boolean' },
    review_reason: { type: 'string' },
  },
  required: [
    'page_no', 'sku', 'sku_source', 'name', 'brand_name', 'collection_name', 'category', 'subcategory',
    'product_tagline', 'size', 'length_mm', 'width_mm', 'thickness_mm', 'finish', 'base_material',
    'color', 'color_code', 'color_family', 'texture', 'look', 'pattern_type', 'application_area',
    'placement', 'special_features', 'technical_data', 'notes', 'confidence_score', 'review_flag',
    'review_reason',
  ],
}

const OUTPUT_SCHEMA = {
  name: 'pdf_catalog_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      page_analysis: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page_no: { type: 'integer' },
            page_type: { type: 'string' },
            has_product_image: { type: 'boolean' },
            reason: { type: 'string' },
          },
          required: ['page_no', 'page_type', 'has_product_image', 'reason'],
        },
      },
      memory_update: {
        type: 'object',
        additionalProperties: false,
        properties: {
          brand_name: { type: 'string' },
          collection_name: { type: 'string' },
          subcategory: { type: 'string' },
          default_finish: { type: 'string' },
          default_base_material: { type: 'string' },
          special_features_common: { type: 'string' },
          applications_common: { type: 'string' },
          technical_data_common: { type: 'string' },
        },
        required: [
          'brand_name', 'collection_name', 'subcategory', 'default_finish', 'default_base_material',
          'special_features_common', 'applications_common', 'technical_data_common',
        ],
      },
      products: {
        type: 'array',
        items: PRODUCT_SCHEMA,
      },
    },
    required: ['page_analysis', 'memory_update', 'products'],
  },
}

function compactText(text = '', limit = 2400) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizePipe(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(' | ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return normalizeText(value)
}

function normalizeMm(value) {
  const s = normalizeText(value)
  if (!s) return ''
  const match = s.match(/\d+(?:\.\d+)?/)
  return match ? String(Math.round(Number(match[0]))) : ''
}

function buildSize({ size, length_mm, width_mm, thickness_mm }) {
  const given = normalizeText(size)
  if (given) return given

  const l = normalizeMm(length_mm)
  const w = normalizeMm(width_mm)
  const t = normalizeMm(thickness_mm)

  if (l && w && t) return `${l} x ${w} x ${t} mm`
  if (l && w) return `${l} x ${w} mm`
  if (l) return `${l} mm`
  return ''
}

function slugPart(value, max = 8) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, max)
}

function deriveSku(product) {
  const existing = slugPart(product.sku, 18)
  if (existing) return existing

  const fromName = slugPart(product.name, 8)
  const length = normalizeMm(product.length_mm)
  const width = normalizeMm(product.width_mm)
  const sizeBits = `${length}${width}`.slice(0, 8)
  const pageBit = `P${String(product.page_no || '').padStart(2, '0')}`

  if (fromName && sizeBits) return `${fromName}-${sizeBits}`.slice(0, 18)
  if (fromName) return `${fromName}-${pageBit}`.slice(0, 18)
  if (sizeBits) return `${slugPart(product.category || 'PRD', 4)}-${sizeBits}-${pageBit}`.slice(0, 18)
  return `${slugPart(product.category || 'PRD', 4)}-${pageBit}`.slice(0, 18)
}

function mergeMemory(base = EMPTY_MEMORY, update = EMPTY_MEMORY) {
  const merged = { ...EMPTY_MEMORY, ...base }
  for (const key of Object.keys(EMPTY_MEMORY)) {
    const value = normalizePipe(update[key])
    if (value) merged[key] = value
  }
  return merged
}

function normalizeMemory(memory = {}) {
  return mergeMemory(EMPTY_MEMORY, memory)
}

function normalizeProduct(product = {}, memory = EMPTY_MEMORY, category = 'default') {
  const row = { ...product }

  row.page_no = Number(row.page_no || 0)
  row.category = normalizeText(row.category) || normalizeText(category)
  row.brand_name = normalizeText(row.brand_name) || memory.brand_name
  row.collection_name = normalizeText(row.collection_name) || memory.collection_name
  row.subcategory = normalizeText(row.subcategory) || memory.subcategory
  row.finish = normalizeText(row.finish) || memory.default_finish
  row.base_material = normalizeText(row.base_material) || memory.default_base_material
  row.special_features = normalizePipe(row.special_features) || memory.special_features_common
  row.application_area = normalizePipe(row.application_area) || memory.applications_common
  row.technical_data = normalizePipe(row.technical_data) || memory.technical_data_common

  row.name = normalizeText(row.name)
  row.product_tagline = normalizeText(row.product_tagline)
  row.size = buildSize(row)
  row.length_mm = normalizeMm(row.length_mm)
  row.width_mm = normalizeMm(row.width_mm)
  row.thickness_mm = normalizeMm(row.thickness_mm)
  row.color = normalizeText(row.color)
  row.color_code = normalizeText(row.color_code)
  row.color_family = normalizeText(row.color_family)
  row.texture = normalizeText(row.texture)
  row.look = normalizeText(row.look)
  row.pattern_type = normalizeText(row.pattern_type)
  row.placement = normalizeText(row.placement)
  row.notes = normalizePipe(row.notes)
  row.review_reason = normalizeText(row.review_reason)

  const printedSku = normalizeText(row.sku)
  row.sku = deriveSku(row)
  row.sku_source = printedSku ? 'printed_or_visible' : (normalizeText(row.sku_source) || 'generated_from_name_size_page')
  row.confidence_score = Number(row.confidence_score || 0)
  row.review_flag = Boolean(row.review_flag || !printedSku)

  if (!row.review_reason && row.review_flag) {
    row.review_reason = printedSku ? '' : 'Printed SKU not visible clearly; generated a short stable SKU from visible identifiers.'
  }

  return {
    page_no: row.page_no,
    sku: row.sku,
    sku_source: row.sku_source,
    name: row.name,
    brand_name: row.brand_name,
    collection_name: row.collection_name,
    category: row.category,
    subcategory: row.subcategory,
    product_tagline: row.product_tagline,
    size: row.size,
    length_mm: row.length_mm,
    width_mm: row.width_mm,
    thickness_mm: row.thickness_mm,
    finish: row.finish,
    base_material: row.base_material,
    color: row.color,
    color_code: row.color_code,
    color_family: row.color_family,
    texture: row.texture,
    look: row.look,
    pattern_type: row.pattern_type,
    application_area: row.application_area,
    placement: row.placement,
    special_features: row.special_features,
    technical_data: row.technical_data,
    notes: row.notes,
    confidence_score: Number.isFinite(row.confidence_score) ? row.confidence_score : 0,
    review_flag: row.review_flag,
    review_reason: row.review_reason,
  }
}

function buildMessages(category, pages, memory) {
  const intro = `You are extracting structured catalog data from a building-material PDF.

You must inspect BOTH the page image and the extracted text.

Critical rules:
1. First classify every page internally as product_page, common_page, or ignore.
2. Do NOT require a printed product code. If a page shows a named design, swatch, sample board, dimension callout, spec card, or obvious product visual, it can still produce a product row.
3. If SKU / product code is missing, create a very short stable SKU from the best visible identifiers in this order: printed code -> design name + size -> design name + page number.
4. Extract visual fields from the product image itself: color, approximate dominant color hex, color_family, texture, look, pattern_type.
5. Extract technical / marketing claims when visible, such as MR+, micro scratch resistance, application area, vertical/horizontal use, warranty, stain resistance, abrasion resistance, etc.
6. Parse dimensions into length_mm, width_mm, thickness_mm whenever possible.
7. special_features, application_area, and technical_data must be concise strings, using " | " separators when there are multiple points.
8. If a page is only a common information page, do not invent products; instead update memory_update.
9. Use the prior memory when a later product page omits shared details.
10. Return strict JSON only.`

  const content = [
    { type: 'text', text: intro },
    {
      type: 'text',
      text: `CATEGORY: ${normalizeText(category)}\n\nPRIOR MEMORY:\n${JSON.stringify(normalizeMemory(memory), null, 2)}`,
    },
  ]

  for (const page of pages) {
    content.push({
      type: 'text',
      text: `PAGE ${page.page_no}\nOCR/TEXT:\n${compactText(page.text) || '[no reliable embedded text]'}\n`,
    })

    if (page.image_data_url) {
      content.push({
        type: 'image_url',
        image_url: {
          url: page.image_data_url,
          detail: 'low',
        },
      })
    }
  }

  return [
    {
      role: 'system',
      content: 'Return only structured JSON that exactly matches the provided schema.',
    },
    {
      role: 'user',
      content,
    },
  ]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { category = 'default', pages = [], memory = {} } = req.body || {}
  if (!Array.isArray(pages) || !pages.length) {
    return res.status(400).json({ error: 'No pages provided' })
  }

  if (pages.length > MAX_PAGES_PER_REQUEST) {
    return res.status(400).json({ error: `Send at most ${MAX_PAGES_PER_REQUEST} pages per request.` })
  }

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' })

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: OUTPUT_SCHEMA,
        },
        messages: buildMessages(category, pages, memory),
      }),
    })

    const raw = await aiRes.text()

    if (!aiRes.ok) {
      let errorMessage = `OpenAI error ${aiRes.status}`
      try {
        errorMessage = JSON.parse(raw)?.error?.message || errorMessage
      } catch {}
      return res.status(500).json({ error: errorMessage })
    }

    let completion
    try {
      completion = JSON.parse(raw)
    } catch {
      return res.status(500).json({ error: `OpenAI returned invalid JSON: ${raw.slice(0, 300)}` })
    }

    const content = completion?.choices?.[0]?.message?.content
    if (!content) {
      return res.status(500).json({ error: 'OpenAI returned an empty response.' })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      return res.status(500).json({ error: `Could not parse model JSON: ${String(content).slice(0, 300)}` })
    }

    const mergedMemory = mergeMemory(memory, parsed.memory_update || {})
    const products = (parsed.products || []).map(product => normalizeProduct(product, mergedMemory, category))

    return res.status(200).json({
      products,
      count: products.length,
      page_analysis: parsed.page_analysis || [],
      memory: mergedMemory,
    })
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) })
  }
}

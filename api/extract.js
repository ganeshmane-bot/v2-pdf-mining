// api/extract.js
// Receives page texts from browser, calls OpenAI, returns product JSON.
// JS instead of Python: cold start ~200ms vs ~3s, fits Vercel free 10s limit.

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

// Column schema per category
const COLUMNS = {
  default:    ['page_no','product_code','product_name','size','material','finish','color_family','texture_type','collection','brand','serial_no','notes'],
  tiles:      ['page_no','product_code','product_name','size','finish','material','color_family','texture_type','collection','brand','thickness','notes'],
  laminates:  ['page_no','product_code','product_name','size','thickness','finish','material','color_family','texture_type','collection','brand','notes'],
  panels:     ['page_no','product_code','product_name','size','finish','material','color_family','texture_type','thickness','collection','brand','application','notes'],
  louvers:    ['page_no','product_code','product_name','size','profile','finish','material','color_family','collection','brand','application','notes'],
  wallpapers: ['page_no','product_code','product_name','size','finish','material','color_family','pattern_type','collection','brand','notes'],
  quartz:     ['page_no','product_code','product_name','size','finish','color_family','thickness','collection','brand','edge_profile','notes'],
}

function buildPrompt(category, columns, pages) {
  const colStr   = columns.join(', ')
  const pageText = pages.map(p => `\n\n--- PAGE ${p.page_no} ---\n${(p.text || '').slice(0, 3000)}`).join('')

  return `You are extracting product data from a building materials catalogue (${category}).
Analyse all pages below and return ONLY a JSON object with a "products" array.

Each product must have EXACTLY these fields (use "" for unknown values):
${colStr}

RULES:
1. Only include pages with actual product listings that have a product code.
2. SKIP: cover pages, index pages, room/lifestyle photos, brand story pages, any page without a product code.
3. product_code = exact code printed (e.g. LPR-514, TL-2201). Skip page if no code found.
4. size = full dimension string as printed (e.g. "2400 x 1200 MM").
5. If one page has multiple products, return one row per product.
6. Keep values concise — one line each.
7. Return ONLY valid JSON, no markdown, no explanation.

PAGE TEXTS:${pageText}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { category = 'default', pages = [] } = req.body || {}
  if (!pages.length) return res.status(400).json({ error: 'No pages provided' })

  const apiKey = process.env.OPENAI_API_KEY
  const model  = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' })

  const columns = COLUMNS[category.toLowerCase()] || COLUMNS.default

  // For large PDFs, only send first 25 pages to stay within timeout
  // User can re-run with page range if needed
  const pagesToSend = pages.slice(0, 25)

  try {
    const prompt = buildPrompt(category, columns, pagesToSend)

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature:     0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Return only valid JSON with a "products" array. No markdown.' },
          { role: 'user',   content: prompt },
        ],
      }),
    })

    const aiText = await aiRes.text()

    if (!aiRes.ok) {
      let errMsg = `OpenAI error ${aiRes.status}`
      try { errMsg = JSON.parse(aiText).error?.message || errMsg } catch {}
      return res.status(500).json({ error: errMsg })
    }

    let aiData
    try { aiData = JSON.parse(aiText) } catch {
      return res.status(500).json({ error: `OpenAI returned non-JSON: ${aiText.slice(0, 200)}` })
    }

    const content = aiData.choices?.[0]?.message?.content || ''
    let products = []
    try {
      const parsed = JSON.parse(content)
      products = parsed.products || []
    } catch {
      return res.status(500).json({ error: `Could not parse products from AI response: ${content.slice(0, 300)}` })
    }

    return res.status(200).json({
      products,
      count:      products.length,
      pages_sent: pagesToSend.length,
      total_pages: pages.length,
    })

  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) })
  }
}

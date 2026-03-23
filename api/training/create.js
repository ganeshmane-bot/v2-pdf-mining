function normalize(value) {
  return String(value || '').trim()
}

function normalizeName(value) {
  return normalize(value).toLowerCase().replace(/\s+/g, ' ')
}

function parseExpectedOutput(value) {
  const raw = normalize(value)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return { raw }
  }
}

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    category_name = '',
    subcategory = '',
    image_data_url = '',
    input_context = '',
    correction_text = '',
    expected_output = '',
  } = req.body || {}

  if (!normalize(category_name) || !normalize(correction_text)) {
    return res.status(400).json({ error: 'category_name and correction_text are required' })
  }

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase environment variables are not set.' })
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/training_examples`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        category_name: normalizeName(category_name),
        subcategory: normalizeName(subcategory),
        image_data_url: normalize(image_data_url),
        input_context: normalize(input_context),
        correction_text: normalize(correction_text),
        expected_output: parseExpectedOutput(expected_output),
      }),
    })

    const data = await r.json()
    if (!r.ok) {
      return res.status(500).json({ error: JSON.stringify(data).slice(0, 300) })
    }

    return res.status(200).json({ ok: true, example: Array.isArray(data) ? data[0] : data })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
}

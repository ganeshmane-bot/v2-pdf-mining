function normalize(value) {
  return String(value || '').trim()
}

function normalizeName(value) {
  return normalize(value).toLowerCase().replace(/\s+/g, ' ')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    job_id = null,
    category_name = '',
    subcategory = '',
    rating = 0,
    notes = '',
  } = req.body || {}

  const safeRating = Number(rating)
  if (!normalize(category_name) || !safeRating || safeRating < 1 || safeRating > 5) {
    return res.status(400).json({ error: 'category_name and rating 1..5 are required' })
  }

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase environment variables are not set.' })
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/job_feedback`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        job_id,
        category_name: normalizeName(category_name),
        subcategory: normalizeName(subcategory),
        rating: safeRating,
        notes: normalize(notes),
      }),
    })

    const data = await r.json()
    if (!r.ok) {
      return res.status(500).json({ error: JSON.stringify(data).slice(0, 300) })
    }

    return res.status(200).json({ ok: true, feedback: Array.isArray(data) ? data[0] : data })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
}

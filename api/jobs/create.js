// api/jobs/create.js — creates a job record in Supabase (no SDK)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { pdf_name, category_id } = req.body || {}
  if (!pdf_name || !category_id) return res.status(400).json({ error: 'Missing pdf_name or category_id' })

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  const r = await fetch(`${SB_URL}/rest/v1/jobs`, {
    method: 'POST',
    headers: {
      apikey:          SB_KEY,
      Authorization:   `Bearer ${SB_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'return=representation',
    },
    body: JSON.stringify({ pdf_name, category_id, status: 'processing' }),
  })

  const data = await r.json()
  if (!r.ok) return res.status(500).json({ error: JSON.stringify(data).slice(0, 200) })

  const job = Array.isArray(data) ? data[0] : data
  return res.status(200).json({ job_id: job.id })
}

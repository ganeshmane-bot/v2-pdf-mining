// api/jobs/complete.js — saves CSV output and marks job done
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { job_id, row_count, csv_output } = req.body || {}
  if (!job_id) return res.status(400).json({ error: 'Missing job_id' })

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  await fetch(`${SB_URL}/rest/v1/jobs?id=eq.${job_id}`, {
    method: 'PATCH',
    headers: {
      apikey:         SB_KEY,
      Authorization:  `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal',
    },
    body: JSON.stringify({
      status:       'done',
      row_count,
      csv_output,
      completed_at: new Date().toISOString(),
    }),
  })

  return res.status(200).json({ ok: true })
}

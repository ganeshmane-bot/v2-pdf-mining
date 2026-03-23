export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { job_id, status = 'cancelled', error = 'Stopped by user' } = req.body || {}
  if (!job_id) return res.status(400).json({ error: 'Missing job_id' })

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase environment variables are not set.' })
  }

  try {
    await fetch(`${SB_URL}/rest/v1/jobs?id=eq.${job_id}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        status,
        error,
        completed_at: new Date().toISOString(),
      }),
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
}

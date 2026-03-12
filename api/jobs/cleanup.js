const ONE_DAY_MS = 24 * 60 * 60 * 1000

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end()

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase environment variables are not set.' })
  }

  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString()

  try {
    const cleanupRes = await fetch(`${SB_URL}/rest/v1/jobs?created_at=lt.${encodeURIComponent(cutoff)}`, {
      method: 'DELETE',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'return=representation',
      },
    })

    const cleanupData = await cleanupRes.json().catch(() => [])
    if (!cleanupRes.ok) {
      return res.status(500).json({ error: JSON.stringify(cleanupData).slice(0, 300) })
    }

    return res.status(200).json({
      ok: true,
      deleted: Array.isArray(cleanupData) ? cleanupData.length : 0,
      cutoff,
    })
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) })
  }
}

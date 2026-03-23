const ONE_DAY_MS = 24 * 60 * 60 * 1000

export default async function handler(req, res) {
  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase environment variables are not set.' })
  }

  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString()
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/jobs?select=id,pdf_name,status,row_count,csv_output,created_at,completed_at,subcategory,categories(name)&created_at=gte.${encodeURIComponent(cutoff)}&order=created_at.desc&limit=100`,
      { headers }
    )

    const data = await r.json()
    if (!Array.isArray(data)) return res.status(200).json([])

    const flat = data.map(job => ({
      ...job,
      category_name: job.categories?.name || '',
      categories: undefined,
    }))

    return res.status(200).json(flat)
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) })
  }
}

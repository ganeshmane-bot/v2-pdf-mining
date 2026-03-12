// api/jobs/history.js — returns recent jobs with category name joined
export default async function handler(req, res) {
  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  const r = await fetch(
    `${SB_URL}/rest/v1/jobs?select=id,pdf_name,status,row_count,csv_output,created_at,categories(name)&order=created_at.desc&limit=20`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  )

  const data = await r.json()
  if (!Array.isArray(data)) return res.status(200).json([])

  // Flatten category name
  const flat = data.map(j => ({
    ...j,
    category_name: j.categories?.name || '',
    categories: undefined,
  }))

  return res.status(200).json(flat)
}

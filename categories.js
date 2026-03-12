// api/categories.js — no SDK, direct REST
export default async function handler(req, res) {
  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  const r = await fetch(`${SB_URL}/rest/v1/categories?order=name`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  })
  const data = await r.json()
  res.status(200).json(Array.isArray(data) ? data : [])
}

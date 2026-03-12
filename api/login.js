// api/auth/login.js — Supabase Auth via REST (no SDK, avoids FUNCTION_INVOCATION_FAILED)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const domain = email.split('@')[1]?.toLowerCase()
  if (!['materialdepot.com', 'materialdepot.in'].includes(domain)) {
    return res.status(403).json({ error: 'Access restricted to MaterialDepot employees only.' })
  }

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY

  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
    body:    JSON.stringify({ email, password }),
  })

  const data = await r.json()
  if (!r.ok) return res.status(401).json({ error: data.error_description || data.error || 'Login failed' })

  return res.status(200).json({
    session: {
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_in:    data.expires_in,
      token_type:    data.token_type,
    },
    user: data.user,
  })
}

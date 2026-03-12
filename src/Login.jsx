import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)

    const domain = email.split('@')[1]?.toLowerCase()
    if (!['materialdepot.com', 'materialdepot.in'].includes(domain)) {
      setError('Access restricted to MaterialDepot employees only.')
      setLoading(false); return
    }

    const res  = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return }

    await supabase.auth.setSession(data.session)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 380, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 40,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, color: '#0f1117',
          }}>M</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '0.02em' }}>Material Depot</div>
            <div style={{ fontSize: 12, color: 'var(--amber)', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>
              PDF MINER
            </div>
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, letterSpacing: '0.04em' }}>
              WORK EMAIL
            </label>
            <input className="inp" type="email" placeholder="you@materialdepot.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, letterSpacing: '0.04em' }}>
              PASSWORD
            </label>
            <input className="inp" type="password" placeholder="Enter password"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          {error && (
            <div style={{
              background: '#2d0a0a', border: '1px solid #7f1d1d', color: 'var(--red)',
              padding: '10px 14px', borderRadius: 8, fontSize: 13,
            }}>{error}</div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: '12px', marginTop: 4 }}>
            {loading
              ? <><span className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0f1117', borderRadius: '50%', display: 'inline-block' }} /> Signing in…</>
              : 'Sign In →'
            }
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
          Access restricted to MaterialDepot employees
        </p>
      </div>
    </div>
  )
}

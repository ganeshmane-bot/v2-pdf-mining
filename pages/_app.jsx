import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../src/lib/supabase.js'
import '../src/index.css'

const PUBLIC_ROUTES = new Set(['/login'])

function LoadingScreen() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spin" style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--amber)', borderRadius: '50%' }} />
    </div>
  )
}

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined || !router.isReady) return

    const isPublic = PUBLIC_ROUTES.has(router.pathname)
    if (!session && !isPublic) router.replace('/login')
    if (session && router.pathname === '/login') router.replace('/')
  }, [router, session])

  if (session === undefined) return <LoadingScreen />

  const isPublic = PUBLIC_ROUTES.has(router.pathname)
  if (!session && !isPublic) return <LoadingScreen />
  if (session && router.pathname === '/login') return <LoadingScreen />

  return <Component {...pageProps} session={session} />
}

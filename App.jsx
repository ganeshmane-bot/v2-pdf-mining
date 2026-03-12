import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import Login     from './pages/Login.jsx'
import Workspace from './pages/Workspace.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div className="spin" style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:'var(--amber)', borderRadius:'50%' }} />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
        <Route path="/*"     element={ session ? <Workspace session={session} /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}

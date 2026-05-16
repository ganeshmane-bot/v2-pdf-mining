import { useState } from 'react'
import { supabase } from '../src/lib/supabase.js'
import Workspace from '../components/Workspace.jsx'
import ImageExtractor from '../components/ImageExtractor.jsx'

export default function Home({ session }) {
  const [tool, setTool] = useState(null)

  if (tool === 'scraping') return <Workspace session={session} onBack={() => setTool(null)} />
  if (tool === 'extractor') return <ImageExtractor session={session} onBack={() => setTool(null)} />

  const email = session?.user?.email || ''
  const initials = email.split('@')[0].slice(0, 2).toUpperCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{
        height: 52,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#0f1117',
          }}>M</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Material Depot</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>/ PDF Miner</span>
        </div>

        <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()} style={{ fontSize: 13 }}>
          {initials} · {email.split('@')[0]} · Sign out
        </button>
      </header>

      <div style={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
      }}>
        <div style={{ width: '100%', maxWidth: 640 }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8 }}>
              Choose a tool
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              Select what you want to do with your PDF
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ToolCard
              icon="⚡"
              title="PDF Scraping"
              description="Extract structured product data from catalogues. Returns SKU, dimensions, colors, and specs as a CSV."
              onClick={() => setTool('scraping')}
            />
            <ToolCard
              icon="🖼"
              title="Image Extractor"
              description="Pull original embedded images from PDFs. Returns full-quality JPG/PNG objects as a ZIP."
              onClick={() => setTool('extractor')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolCard({ icon, title, description, onClick }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hovered ? 'var(--amber)' : 'var(--border)'}`,
        borderRadius: 16,
        padding: '28px 24px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        width: '100%',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>{description}</div>
    </button>
  )
}

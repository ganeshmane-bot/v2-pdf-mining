// Workspace.jsx — 3-step flow:
// 1. Upload PDF + pick category → click Extract
// 2. Browser extracts all text with pdf.js → sends to /api/extract
// 3. Show results table + download CSV button + save history

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

// ── Load pdf.js once ──────────────────────────────────────────
async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = PDFJS; s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER
  return window.pdfjsLib
}

// ── Extract all text from PDF ─────────────────────────────────
async function extractPdfText(file) {
  const pdfjs   = await loadPdfJs()
  const buffer  = await file.arrayBuffer()
  const pdfDoc  = await pdfjs.getDocument({ data: buffer }).promise
  const n       = pdfDoc.numPages
  const pages   = []

  for (let i = 1; i <= n; i++) {
    const page    = await pdfDoc.getPage(i)
    const content = await page.getTextContent()
    const text    = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim()
    if (text.length > 20) {      // skip blank pages
      pages.push({ page_no: i, text: text.slice(0, 4000) })   // cap per page
    }
  }
  return { pages, total: n }
}

// ── Convert JSON rows → CSV string ───────────────────────────
function rowsToCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape  = v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n')
}

// ── Download helper ───────────────────────────────────────────
function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Category colours ──────────────────────────────────────────
const CAT_COLORS = {
  tiles: '#f59e0b', laminates: '#10b981', panels: '#3b82f6',
  louvers: '#8b5cf6', wallpapers: '#ec4899', quartz: '#f97316',
}

// ══════════════════════════════════════════════════════════════
export default function Workspace({ session }) {
  const [categories,  setCategories]  = useState([])
  const [history,     setHistory]     = useState([])    // past jobs
  const [file,        setFile]        = useState(null)
  const [categoryId,  setCategoryId]  = useState('')
  const [categoryName, setCatName]    = useState('')
  const [dragging,    setDragging]    = useState(false)

  // Processing state
  const [step,       setStep]       = useState('idle')  // idle | processing | done | error
  const [statusMsg,  setStatusMsg]  = useState('')
  const [rows,       setRows]       = useState([])
  const [csvStr,     setCsvStr]     = useState('')
  const [jobId,      setJobId]      = useState(null)
  const [error,      setError]      = useState('')

  // Table view state
  const [page,       setPage]       = useState(0)
  const ROW_PER_PAGE = 20

  const email    = session?.user?.email || ''
  const initials = email.split('@')[0].slice(0, 2).toUpperCase()

  // ── Load categories + history ─────────────────────────────
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCategories(d) })
      .catch(() => {})

    fetch('/api/jobs/history')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setHistory(d) })
      .catch(() => {})
  }, [])

  // ── File drop ────────────────────────────────────────────
  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') { setFile(f); setStep('idle'); setError('') }
    else setError('Please drop a PDF file.')
  }, [])

  // ── Main extract flow ─────────────────────────────────────
  async function runExtraction() {
    if (!file || !categoryId) return
    setStep('processing'); setError(''); setRows([]); setCsvStr('')

    try {
      // Step 1 — create job record in Supabase
      setStatusMsg('Creating job…')
      const createRes = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_name: file.name, category_id: categoryId }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error || 'Failed to create job')
      const jid = createData.job_id
      setJobId(jid)

      // Step 2 — extract text with pdf.js
      setStatusMsg('Reading PDF pages…')
      const { pages, total } = await extractPdfText(file)
      setStatusMsg(`Extracted text from ${pages.length}/${total} pages. Sending to AI…`)

      // Step 3 — call OpenAI via /api/extract
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id:    jid,
          pdf_name:  file.name,
          category:  categoryName,
          pages,
        }),
      })

      const extractText = await extractRes.text()
      let extractData
      try { extractData = JSON.parse(extractText) }
      catch { throw new Error(`Bad response from AI: ${extractText.slice(0, 200)}`) }

      if (!extractRes.ok) throw new Error(extractData.error || 'Extraction failed')

      const extracted = extractData.products || []
      if (!extracted.length) throw new Error('No products found in this PDF.')

      const csv = rowsToCsv(extracted)

      // Step 4 — save result to Supabase
      setStatusMsg('Saving results…')
      await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jid, row_count: extracted.length, csv_output: csv }),
      }).catch(() => {})   // non-critical

      setRows(extracted)
      setCsvStr(csv)
      setPage(0)
      setStep('done')
      setStatusMsg(`Done — ${extracted.length} products extracted`)

      // Refresh history
      fetch('/api/jobs/history').then(r => r.json()).then(d => { if (Array.isArray(d)) setHistory(d) }).catch(() => {})

    } catch (err) {
      setError(err.message)
      setStep('error')
    }
  }

  async function logout() { await supabase.auth.signOut() }

  // ── Derived table data ────────────────────────────────────
  const columns    = rows.length ? Object.keys(rows[0]) : []
  const totalPages = Math.ceil(rows.length / ROW_PER_PAGE)
  const pageRows   = rows.slice(page * ROW_PER_PAGE, (page + 1) * ROW_PER_PAGE)

  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── TOPBAR ──────────────────────────────────────── */}
      <header style={{
        height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 16,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: 'var(--amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#0f1117',
          }}>M</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Material Depot</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>/ PDF Miner</span>
        </div>
        <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 13 }}>
          {initials} · {email.split('@')[0]} · Sign out
        </button>
      </header>

      {/* ── MAIN ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── UPLOAD CARD ─────────────────────────────── */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 28,
          }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Extract Product Data from PDF</div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => !file && document.getElementById('pdf-inp').click()}
                style={{
                  flex: '1 1 300px', minHeight: 130,
                  border: `2px dashed ${dragging ? 'var(--amber)' : file ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius: 12, background: dragging ? '#1e1a0a' : file ? '#0a1a12' : 'var(--bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: file ? 'default' : 'pointer', transition: 'all 0.15s',
                  padding: 20,
                }}
              >
                <input id="pdf-inp" type="file" accept=".pdf" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setStep('idle'); setError('') } }} />

                {file ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
                    <span style={{ fontSize: 32 }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                    <span style={{ color: 'var(--green)', fontSize: 18 }}>✓</span>
                    <button className="btn btn-ghost" onClick={e => { e.stopPropagation(); setFile(null); setStep('idle') }}
                      style={{ fontSize: 18, padding: '4px 8px' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Drop PDF here or click to browse</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Building materials catalogues only</div>
                  </div>
                )}
              </div>

              {/* Category + controls */}
              <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.04em' }}>
                    PRODUCT CATEGORY
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {categories.map(c => {
                      const color = CAT_COLORS[c.name] || 'var(--amber)'
                      const sel   = categoryId === c.id
                      return (
                        <button key={c.id} onClick={() => { setCategoryId(c.id); setCatName(c.name) }}
                          style={{
                            padding: '7px 14px', borderRadius: 8, border: `1px solid ${sel ? color : 'var(--border)'}`,
                            background: sel ? color + '22' : 'transparent',
                            color: sel ? color : 'var(--muted)',
                            fontWeight: 600, fontSize: 13, textTransform: 'capitalize',
                            cursor: 'pointer', transition: 'all 0.12s',
                          }}>
                          {c.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={runExtraction}
                  disabled={!file || !categoryId || step === 'processing'}
                  style={{ padding: '13px 24px', fontSize: 15, fontWeight: 700, marginTop: 'auto' }}
                >
                  {step === 'processing'
                    ? <><span className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0f1117', borderRadius: '50%', display: 'inline-block' }} /> Extracting…</>
                    : '⚡ Extract Data'
                  }
                </button>
              </div>
            </div>

            {/* Status / error bar */}
            {(step === 'processing' || step === 'error' || step === 'done') && (
              <div style={{
                marginTop: 18, padding: '12px 16px', borderRadius: 10,
                background: step === 'error' ? '#2d0a0a' : step === 'done' ? '#0a1a0f' : 'var(--bg)',
                border: `1px solid ${step === 'error' ? '#7f1d1d' : step === 'done' ? '#14532d' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 10,
                fontFamily: 'var(--mono)', fontSize: 13,
                color: step === 'error' ? 'var(--red)' : step === 'done' ? 'var(--green)' : 'var(--amber)',
              }}>
                {step === 'processing' && (
                  <span className="spin" style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--amber)', borderRadius: '50%', flexShrink: 0, display: 'inline-block' }} />
                )}
                {step === 'error'  && '✗ '}
                {step === 'done'   && '✓ '}
                {step === 'error' ? error : statusMsg}
              </div>
            )}
          </div>

          {/* ── RESULTS TABLE ───────────────────────────── */}
          {step === 'done' && rows.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>

              {/* Table header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '18px 24px', borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{rows.length} products extracted</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    from {file?.name} · {categoryName}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => downloadCsv(csvStr, `${file.name.replace('.pdf', '')}_${categoryName}.csv`)}
                >
                  ↓ Download CSV
                </button>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {columns.map(col => (
                        <th key={col} style={{
                          padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                          fontSize: 11, letterSpacing: '0.05em', color: 'var(--muted)',
                          textTransform: 'uppercase', whiteSpace: 'nowrap',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {columns.map(col => (
                          <td key={col} style={{
                            padding: '10px 16px', color: col === 'product_code' ? 'var(--amber)' : 'var(--text)',
                            fontFamily: col === 'product_code' ? 'var(--mono)' : 'inherit',
                            fontWeight: col === 'product_code' ? 600 : 400,
                            whiteSpace: 'nowrap', maxWidth: 220,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {row[col] || <span style={{ color: 'var(--border)' }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 24px', borderTop: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Showing {page * ROW_PER_PAGE + 1}–{Math.min((page + 1) * ROW_PER_PAGE, rows.length)} of {rows.length}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0} style={{ padding: '6px 14px', fontSize: 13 }}>← Prev</button>
                    <button className="btn btn-outline" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page === totalPages - 1} style={{ padding: '6px 14px', fontSize: 13 }}>Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY ─────────────────────────────────── */}
          {history.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>
                Recent Extractions
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['PDF', 'Category', 'Products', 'Date', 'CSV'].map(h => (
                      <th key={h} style={{
                        padding: '10px 20px', textAlign: 'left', fontWeight: 600,
                        fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase',
                        letterSpacing: '0.04em', borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(job => (
                    <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 20px', fontFamily: 'var(--mono)', fontSize: 12 }}>{job.pdf_name}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: (CAT_COLORS[job.category_name] || 'var(--amber)') + '22',
                          color: CAT_COLORS[job.category_name] || 'var(--amber)',
                          textTransform: 'capitalize',
                        }}>{job.category_name || '—'}</span>
                      </td>
                      <td style={{ padding: '12px 20px', color: 'var(--amber)', fontWeight: 600 }}>
                        {job.row_count || 0}
                      </td>
                      <td style={{ padding: '12px 20px', color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        {job.csv_output ? (
                          <button className="btn btn-outline"
                            onClick={() => downloadCsv(job.csv_output, `${job.pdf_name.replace('.pdf', '')}.csv`)}
                            style={{ padding: '5px 12px', fontSize: 12 }}>↓ CSV</button>
                        ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

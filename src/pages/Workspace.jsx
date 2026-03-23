import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
const ONE_MINUTE = 60 * 1000
const CHUNK_SIZE = 4

const CAT_COLORS = {
  tiles: '#f59e0b',
  laminates: '#10b981',
  panels: '#3b82f6',
  louvers: '#8b5cf6',
  wallpapers: '#ec4899',
  quartz: '#f97316',
  custom: '#94a3b8',
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib

  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = PDFJS
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER
  return window.pdfjsLib
}

async function renderPageToDataUrl(page, maxWidth = 1100, quality = 0.68) {
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(1.6, maxWidth / Math.max(baseViewport.width, 1))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })

  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))

  await page.render({ canvasContext: ctx, viewport }).promise
  const dataUrl = canvas.toDataURL('image/jpeg', quality)

  canvas.width = 0
  canvas.height = 0
  return dataUrl
}

async function extractPdfPages(file, onProgress, shouldStop) {
  const pdfjs = await loadPdfJs()
  const buffer = await file.arrayBuffer()
  const pdfDoc = await pdfjs.getDocument({ data: buffer }).promise
  const total = pdfDoc.numPages
  const pages = []

  for (let i = 1; i <= total; i++) {
    if (shouldStop?.()) throw new Error('Extraction stopped by user.')

    const page = await pdfDoc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim()
    const image_data_url = await renderPageToDataUrl(page)

    pages.push({
      page_no: i,
      text: text.slice(0, 3500),
      image_data_url,
    })

    onProgress?.(i, total)
    page.cleanup()
  }

  return { pages, total }
}

function rowsToCsv(rows) {
  if (!rows.length) return ''

  const headers = Object.keys(rows[0])

  const normalizeCell = value => {
    if (Array.isArray(value)) return value.join(' | ')
    if (value && typeof value === 'object') return JSON.stringify(value)
    return String(value ?? '')
  }

  const escape = value => {
    const s = normalizeCell(value)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => escape(row[header])).join(',')),
  ].join('\n')
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export default function Workspace({ session }) {
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)
  const stopRequestedRef = useRef(false)

  const [categories, setCategories] = useState([])
  const [history, setHistory] = useState([])
  const [file, setFile] = useState(null)

  const [categoryId, setCategoryId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [customCategoryMode, setCustomCategoryMode] = useState(false)
  const [customCategoryName, setCustomCategoryName] = useState('')
  const [subcategory, setSubcategory] = useState('')

  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [rows, setRows] = useState([])
  const [csvStr, setCsvStr] = useState('')
  const [jobId, setJobId] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)

  const [rating, setRating] = useState(0)
  const [ratingNotes, setRatingNotes] = useState('')
  const [ratingSaved, setRatingSaved] = useState(false)
  const [ratingError, setRatingError] = useState('')

  const ROW_PER_PAGE = 20
  const email = session?.user?.email || ''
  const initials = email.split('@')[0].slice(0, 2).toUpperCase()

  const activeCategoryName = useMemo(() => {
    const value = customCategoryMode ? customCategoryName : categoryName
    return normalizeName(value)
  }, [customCategoryMode, customCategoryName, categoryName])

  const canRun = Boolean(file) && Boolean(activeCategoryName) && step !== 'processing'

  const loadHistory = useCallback(() => {
    fetch('/api/jobs/history')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setHistory(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCategories(data) })
      .catch(() => {})

    loadHistory()
    const interval = setInterval(loadHistory, ONE_MINUTE)
    return () => clearInterval(interval)
  }, [loadHistory])

  const onDrop = useCallback(event => {
    event.preventDefault()
    setDragging(false)

    const dropped = event.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf') {
      setFile(dropped)
      setStep('idle')
      setError('')
      setRows([])
      setCsvStr('')
      setRating(0)
      setRatingNotes('')
      setRatingSaved(false)
    } else {
      setError('Please upload a PDF file only.')
    }
  }, [])

  async function stopExtraction() {
    stopRequestedRef.current = true
    abortRef.current?.abort()

    if (jobId) {
      await fetch('/api/jobs/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, status: 'cancelled', error: 'Stopped by user' }),
      }).catch(() => {})
    }

    setStep('idle')
    setStatusMsg('Extraction stopped.')
    loadHistory()
  }

  async function runExtraction() {
    if (!canRun) return

    stopRequestedRef.current = false
    setStep('processing')
    setError('')
    setRows([])
    setCsvStr('')
    setPage(0)
    setRating(0)
    setRatingNotes('')
    setRatingSaved(false)
    setRatingError('')
    setJobId(null)

    try {
      setStatusMsg('Creating extraction job…')
      let jid = null

      try {
        const createRes = await fetch('/api/jobs/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdf_name: file.name,
            category_id: customCategoryMode ? null : categoryId,
            custom_category_name: customCategoryMode ? customCategoryName : '',
            subcategory,
          }),
        })

        const createText = await createRes.text()
        let createData = {}
        try { createData = JSON.parse(createText) } catch {}

        if (createRes.ok && createData.job_id) {
          jid = createData.job_id
          setJobId(jid)
        }
      } catch {}

      setStatusMsg('Reading PDF pages, images, and embedded text…')
      const { pages } = await extractPdfPages(
        file,
        (current, total) => setStatusMsg(`Preparing page ${current} of ${total}…`),
        () => stopRequestedRef.current
      )

      if (stopRequestedRef.current) throw new Error('Extraction stopped by user.')

      let memory = {}
      const extracted = []
      const totalChunks = Math.ceil(pages.length / CHUNK_SIZE)

      for (let start = 0; start < pages.length; start += CHUNK_SIZE) {
        if (stopRequestedRef.current) throw new Error('Extraction stopped by user.')

        const chunk = pages.slice(start, start + CHUNK_SIZE)
        const batchNo = Math.floor(start / CHUNK_SIZE) + 1

        setStatusMsg(`AI analyzing pages ${chunk[0].page_no}-${chunk[chunk.length - 1].page_no} (batch ${batchNo}/${totalChunks})…`)

        const controller = new AbortController()
        abortRef.current = controller

        const extractRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            category: activeCategoryName,
            subcategory,
            pages: chunk,
            memory,
          }),
        })

        const extractText = await extractRes.text()
        let extractData = {}
        try {
          extractData = JSON.parse(extractText)
        } catch {
          throw new Error(`Server error in batch ${batchNo}: ${extractText.slice(0, 300)}`)
        }

        if (!extractRes.ok) {
          throw new Error(extractData.error || `Extraction failed in batch ${batchNo}`)
        }

        if (extractData.memory) memory = extractData.memory
        if (Array.isArray(extractData.products)) extracted.push(...extractData.products)
      }

      abortRef.current = null

      if (!extracted.length) {
        throw new Error('No products found — add a training example for this catalog layout if needed.')
      }

      extracted.sort((a, b) => {
        const pageDiff = Number(a.page_no || 0) - Number(b.page_no || 0)
        if (pageDiff !== 0) return pageDiff
        return String(a.sku || '').localeCompare(String(b.sku || ''))
      })

      const csv = rowsToCsv(extracted)

      setStatusMsg('Saving extraction history…')
      if (jid) {
        await fetch('/api/jobs/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jid, row_count: extracted.length, csv_output: csv }),
        }).catch(() => {})
      }

      setRows(extracted)
      setCsvStr(csv)
      setStep('done')
      setStatusMsg(`Done — ${extracted.length} products extracted`)
      loadHistory()
    } catch (err) {
      const message = String(err?.message || err)

      if (stopRequestedRef.current || message.includes('aborted') || message.includes('stopped by user')) {
        setStep('idle')
        setStatusMsg('Extraction stopped.')
        return
      }

      setError(message)
      setStep('error')

      if (jobId) {
        await fetch('/api/jobs/fail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, status: 'failed', error: message }),
        }).catch(() => {})
      }
    } finally {
      abortRef.current = null
    }
  }

  async function submitRating() {
    if (!rows.length || !activeCategoryName || !rating) {
      setRatingError('Choose a rating first.')
      return
    }

    setRatingError('')

    try {
      const r = await fetch('/api/training/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          category_name: activeCategoryName,
          subcategory,
          rating,
          notes: ratingNotes,
        }),
      })

      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Could not save rating')

      setRatingSaved(true)
    } catch (err) {
      setRatingError(String(err?.message || err))
    }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const columns = rows.length ? Object.keys(rows[0]) : []
  const totalPages = Math.ceil(rows.length / ROW_PER_PAGE)
  const pageRows = rows.slice(page * ROW_PER_PAGE, (page + 1) * ROW_PER_PAGE)

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
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'var(--amber)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 14,
            color: '#0f1117',
          }}>M</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Material Depot</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>/ PDF Miner</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-ghost" to="/" style={{ color: 'var(--text)' }}>Workspace</Link>
          <Link className="btn btn-ghost" to="/training">Training</Link>
        </div>

        <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 13 }}>
          {initials} · {email.split('@')[0]} · Sign out
        </button>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Extract Product Data from PDF</div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div
                onDragOver={event => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: '2 1 560px',
                  minHeight: 190,
                  borderRadius: 18,
                  border: `2px dashed ${dragging || file ? 'var(--green)' : 'var(--border)'}`,
                  background: dragging || file ? 'rgba(16,185,129,0.12)' : 'var(--bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  cursor: 'pointer',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={event => {
                    const selected = event.target.files?.[0]
                    if (selected) {
                      setFile(selected)
                      setStep('idle')
                      setError('')
                    }
                  }}
                />

                {file ? (
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                      <div style={{ fontSize: 42 }}>📄</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                        <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13 }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--green)', fontSize: 20 }}>✓</span>
                      <button
                        className="btn btn-ghost"
                        onClick={event => {
                          event.stopPropagation()
                          setFile(null)
                          setRows([])
                          setCsvStr('')
                          setStep('idle')
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Drop PDF here or click to browse</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Image-based catalogues and text PDFs are both supported.</div>
                  </div>
                )}
              </div>

              <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.04em' }}>
                    PRODUCT CATEGORY
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {categories.map(category => {
                      const color = CAT_COLORS[category.name] || 'var(--amber)'
                      const selected = !customCategoryMode && categoryId === category.id
                      return (
                        <button
                          key={category.id}
                          onClick={() => {
                            setCustomCategoryMode(false)
                            setCustomCategoryName('')
                            setCategoryId(category.id)
                            setCategoryName(category.name)
                          }}
                          style={{
                            padding: '7px 14px',
                            borderRadius: 8,
                            border: `1px solid ${selected ? color : 'var(--border)'}`,
                            background: selected ? `${color}22` : 'transparent',
                            color: selected ? color : 'var(--muted)',
                            fontWeight: 600,
                            fontSize: 13,
                            textTransform: 'capitalize',
                            cursor: 'pointer',
                          }}
                        >
                          {category.name}
                        </button>
                      )
                    })}

                    <button
                      onClick={() => {
                        setCustomCategoryMode(true)
                        setCategoryId('')
                        setCategoryName('')
                      }}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 8,
                        border: `1px solid ${customCategoryMode ? CAT_COLORS.custom : 'var(--border)'}`,
                        background: customCategoryMode ? `${CAT_COLORS.custom}22` : 'transparent',
                        color: customCategoryMode ? CAT_COLORS.custom : 'var(--muted)',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Custom category
                    </button>
                  </div>
                </div>

                {customCategoryMode && (
                  <input
                    className="inp"
                    placeholder="Write your own category"
                    value={customCategoryName}
                    onChange={event => setCustomCategoryName(event.target.value)}
                  />
                )}

                <input
                  className="inp"
                  placeholder="Optional subcategory"
                  value={subcategory}
                  onChange={event => setSubcategory(event.target.value)}
                />

                <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
                  <button
                    className="btn btn-primary"
                    onClick={runExtraction}
                    disabled={!canRun}
                    style={{ flex: 1, padding: '13px 24px', fontSize: 15, fontWeight: 700 }}
                  >
                    {step === 'processing'
                      ? <><span className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0f1117', borderRadius: '50%', display: 'inline-block' }} /> Extracting…</>
                      : '⚡ Extract Data'
                    }
                  </button>

                  {step === 'processing' && (
                    <button className="btn btn-outline" onClick={stopExtraction} style={{ padding: '13px 18px', fontWeight: 700 }}>
                      Stop
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(step === 'processing' || step === 'error' || step === 'done' || statusMsg) && (
              <div style={{
                marginTop: 18,
                padding: '12px 16px',
                borderRadius: 10,
                background: step === 'error' ? '#2d0a0a' : step === 'done' ? '#0a1a0f' : 'var(--bg)',
                border: `1px solid ${step === 'error' ? '#7f1d1d' : step === 'done' ? '#14532d' : 'var(--border)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--mono)',
                fontSize: 13,
                color: step === 'error' ? 'var(--red)' : step === 'done' ? 'var(--green)' : 'var(--amber)',
              }}>
                {step === 'processing' && <span className="spin" style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--amber)', borderRadius: '50%', display: 'inline-block' }} />}
                {step === 'error' && '✗ '}
                {step === 'done' && '✓ '}
                {step === 'error' ? error : statusMsg}
              </div>
            )}
          </div>

          {step === 'done' && rows.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{rows.length} products extracted</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    from {file?.name} · {activeCategoryName}{subcategory ? ` · ${normalizeName(subcategory)}` : ''}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => downloadCsv(csvStr, `${file.name.replace('.pdf', '')}_${activeCategoryName}.csv`)}>
                  ↓ Download CSV
                </button>
              </div>

              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Rate this extraction</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      className="btn btn-outline"
                      onClick={() => setRating(value)}
                      style={{
                        padding: '8px 12px',
                        borderColor: rating === value ? 'var(--amber)' : 'var(--border)',
                        color: rating === value ? 'var(--amber)' : 'var(--text)',
                      }}
                    >
                      {'★'.repeat(value)}
                    </button>
                  ))}
                </div>

                <textarea
                  className="inp"
                  rows={3}
                  placeholder="Optional note. Example: missed flooring size on pages without printed code, or got the color family wrong."
                  value={ratingNotes}
                  onChange={e => setRatingNotes(e.target.value)}
                  style={{ resize: 'vertical', marginBottom: 10 }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn btn-primary" onClick={submitRating} disabled={ratingSaved || !rating}>
                    {ratingSaved ? 'Rating saved' : 'Save rating'}
                  </button>
                  <Link className="btn btn-outline" to="/training">Open Training Page</Link>
                  {ratingError ? <span style={{ color: 'var(--red)', fontSize: 13 }}>{ratingError}</span> : null}
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {columns.map(column => (
                        <th key={column} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, letterSpacing: '0.05em', color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                          {column.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, index) => (
                      <tr key={`${row.sku || 'row'}-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                        {columns.map(column => (
                          <td key={column} style={{ padding: '10px 16px', whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', color: column === 'sku' ? 'var(--amber)' : 'var(--text)', fontFamily: column === 'sku' ? 'var(--mono)' : 'inherit', fontWeight: column === 'sku' ? 600 : 400 }}>
                            {row[column] || <span style={{ color: 'var(--border)' }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Showing {page * ROW_PER_PAGE + 1}–{Math.min((page + 1) * ROW_PER_PAGE, rows.length)} of {rows.length}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0} style={{ padding: '6px 14px', fontSize: 13 }}>← Prev</button>
                    <button className="btn btn-outline" onClick={() => setPage(value => Math.min(totalPages - 1, value + 1))} disabled={page === totalPages - 1} style={{ padding: '6px 14px', fontSize: 13 }}>Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Extractions</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Last 24 hours</div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['PDF', 'Category', 'Products', 'Date', 'CSV'].map(header => (
                      <th key={header} style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(job => (
                    <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 20px', fontFamily: 'var(--mono)', fontSize: 12 }}>{job.pdf_name}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: `${CAT_COLORS[job.category_name] || 'var(--amber)'}22`,
                          color: CAT_COLORS[job.category_name] || 'var(--amber)',
                          textTransform: 'capitalize',
                        }}>
                          {job.category_name || '—'}
                        </span>
                        {job.subcategory ? <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 12 }}>{job.subcategory}</span> : null}
                      </td>
                      <td style={{ padding: '12px 20px', color: 'var(--amber)', fontWeight: 600 }}>{job.row_count || 0}</td>
                      <td style={{ padding: '12px 20px', color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--mono)' }}>{new Date(job.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '12px 20px' }}>
                        {job.csv_output
                          ? <button className="btn btn-outline" onClick={() => downloadCsv(job.csv_output, `${job.pdf_name.replace('.pdf', '')}.csv`)} style={{ padding: '5px 12px', fontSize: 12 }}>↓ CSV</button>
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
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

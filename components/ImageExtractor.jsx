import { useCallback, useRef, useState } from 'react'
import { supabase } from '../src/lib/supabase.js'

export default function ImageExtractor({ session, onBack }) {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')
  const [downloadInfo, setDownloadInfo] = useState(null)

  const email = session?.user?.email || ''
  const initials = email.split('@')[0].slice(0, 2).toUpperCase()

  const canRun = Boolean(file) && step !== 'processing'

  const onDrop = useCallback(event => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf') {
      setFile(dropped)
      setStep('idle')
      setError('')
      setDownloadInfo(null)
    } else {
      setError('Please upload a PDF file only.')
    }
  }, [])

  async function runExtraction() {
    if (!canRun) return

    setStep('processing')
    setError('')
    setDownloadInfo(null)
    setStatusMsg('Uploading PDF…')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mode', 'embedded')
      formData.append('min_width', '50')
      formData.append('min_height', '50')
      formData.append('dedupe', 'true')

      setStatusMsg('Extracting embedded images…')

      const response = await fetch('/api/extract-images', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Extraction failed.')
      }

      const blob = await response.blob()
      const zipUrl = URL.createObjectURL(blob)

      const disposition = response.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || `${file.name.replace('.pdf', '')}_extracted_images.zip`

      const a = document.createElement('a')
      a.href = zipUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()

      setDownloadInfo({ zipUrl, filename })
      setStep('done')
      setStatusMsg('Done — ZIP downloaded')
    } catch (err) {
      setError(err.message || 'Extraction failed.')
      setStep('error')
    }
  }

  function reDownload() {
    if (!downloadInfo) return
    const a = document.createElement('a')
    a.href = downloadInfo.zipUrl
    a.download = downloadInfo.filename
    a.click()
  }

  async function logout() {
    await supabase.auth.signOut()
  }

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
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>/ Image Extractor</span>
        </div>

        <button className="btn btn-ghost" onClick={onBack} style={{ fontSize: 13 }}>← Tools</button>

        <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 13 }}>
          {initials} · {email.split('@')[0]} · Sign out
        </button>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Extract Embedded Images from PDF</div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {/* Upload area */}
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
                      setDownloadInfo(null)
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
                          setStep('idle')
                          setDownloadInfo(null)
                        }}
                      >✕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Drop PDF here or click to browse</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Extracts original embedded images — JPG, PNG, WebP. No re-encoding.</div>
                  </div>
                )}
              </div>

              {/* Right panel */}
              <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'flex-end' }}>
                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 18px',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, letterSpacing: '0.04em' }}>EXTRACTION MODE</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--amber)', marginBottom: 4 }}>Embedded Images</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Pulls original image objects stored inside the PDF. Full quality, no re-encoding.
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={runExtraction}
                  disabled={!canRun}
                  style={{ padding: '13px 24px', fontSize: 15, fontWeight: 700 }}
                >
                  {step === 'processing'
                    ? (
                      <>
                        <span className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0f1117', borderRadius: '50%', display: 'inline-block' }} />
                        {' '}Extracting…
                      </>
                    )
                    : '⚡ Extract Images'
                  }
                </button>
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
                {step === 'processing' && (
                  <span className="spin" style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--amber)', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                )}
                {step === 'error' && '✗ '}
                {step === 'done' && '✓ '}
                {step === 'error' ? error : statusMsg}
              </div>
            )}
          </div>

          {step === 'done' && downloadInfo && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>ZIP ready</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                  {downloadInfo.filename}
                </div>
              </div>
              <button className="btn btn-primary" onClick={reDownload}>↓ Download ZIP</button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

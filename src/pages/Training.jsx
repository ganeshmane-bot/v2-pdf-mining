import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const CAT_COLORS = {
  tiles: '#f59e0b',
  laminates: '#10b981',
  panels: '#3b82f6',
  louvers: '#8b5cf6',
  wallpapers: '#ec4899',
  quartz: '#f97316',
  custom: '#94a3b8',
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

async function fileToCompressedDataUrl(file, maxSide = 1400, quality = 0.72) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  canvas.width = 0
  canvas.height = 0
  bitmap.close?.()
  return dataUrl
}

export default function Training({ session }) {
  const fileInputRef = useRef(null)

  const [categories, setCategories] = useState([])
  const [examples, setExamples] = useState([])
  const [ratings, setRatings] = useState([])

  const [categoryId, setCategoryId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [customCategoryMode, setCustomCategoryMode] = useState(false)
  const [customCategoryName, setCustomCategoryName] = useState('')
  const [subcategory, setSubcategory] = useState('')

  const [imageDataUrl, setImageDataUrl] = useState('')
  const [inputContext, setInputContext] = useState('')
  const [correctionText, setCorrectionText] = useState('')
  const [expectedOutput, setExpectedOutput] = useState('')

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const email = session?.user?.email || ''
  const initials = email.split('@')[0].slice(0, 2).toUpperCase()

  const activeCategoryName = useMemo(() => {
    return customCategoryMode ? normalizeName(customCategoryName) : normalizeName(categoryName)
  }, [customCategoryMode, customCategoryName, categoryName])

  async function loadAll(targetCategory = '') {
    const query = targetCategory ? `?category_name=${encodeURIComponent(targetCategory)}` : ''
    const r = await fetch(`/api/training/list${query}`)
    const data = await r.json().catch(() => ({ examples: [], ratings: [] }))
    setExamples(Array.isArray(data.examples) ? data.examples : [])
    setRatings(Array.isArray(data.ratings) ? data.ratings : [])
  }

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCategories(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadAll(activeCategoryName).catch(() => {})
  }, [activeCategoryName])

  async function handleImageFromFile(file) {
    try {
      const dataUrl = await fileToCompressedDataUrl(file)
      setImageDataUrl(dataUrl)
      setError('')
    } catch (err) {
      setError(String(err?.message || err))
    }
  }

  async function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || [])
    const imageItem = items.find(item => item.type.startsWith('image/'))
    if (!imageItem) return
    const file = imageItem.getAsFile()
    if (!file) return
    event.preventDefault()
    await handleImageFromFile(file)
  }

  async function submitTrainingExample() {
    if (!activeCategoryName || !correctionText.trim()) {
      setError('Category and correction text are required.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const r = await fetch('/api/training/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_name: activeCategoryName,
          subcategory,
          image_data_url: imageDataUrl,
          input_context: inputContext,
          correction_text: correctionText,
          expected_output: expectedOutput,
        }),
      })

      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Could not save training example')

      setMessage('Training example saved. Future extractions in this category will use it.')
      setInputContext('')
      setCorrectionText('')
      setExpectedOutput('')
      setImageDataUrl('')
      await loadAll(activeCategoryName)
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
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
            width: 30, height: 30, borderRadius: 8, background: 'var(--amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#0f1117',
          }}>M</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Material Depot</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>/ Training</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-ghost" to="/">Workspace</Link>
          <Link className="btn btn-ghost" to="/training" style={{ color: 'var(--text)' }}>Training</Link>
        </div>

        <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 13 }}>
          {initials} · {email.split('@')[0]} · Sign out
        </button>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Train the extraction agent</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 22 }}>
              Paste a screenshot, explain the correction, and optionally paste the corrected output row or rule.
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.04em' }}>
                CATEGORY
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              {customCategoryMode && (
                <input
                  className="inp"
                  placeholder="Write your own category"
                  value={customCategoryName}
                  onChange={e => setCustomCategoryName(e.target.value)}
                />
              )}

              <input
                className="inp"
                placeholder="Optional subcategory"
                value={subcategory}
                onChange={e => setSubcategory(e.target.value)}
              />
            </div>

            <div
              onPaste={handlePaste}
              onClick={() => fileInputRef.current?.click()}
              style={{
                minHeight: 180,
                borderRadius: 14,
                border: '2px dashed var(--border)',
                background: 'var(--bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 18,
                cursor: 'pointer',
                marginBottom: 16,
                overflow: 'hidden',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (file) await handleImageFromFile(file)
                }}
              />

              {imageDataUrl ? (
                <img src={imageDataUrl} alt="Training example" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 10 }} />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>🖼️</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Paste screenshot here or click to upload</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    This screenshot is stored as a training example for future extractions.
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <textarea
                className="inp"
                rows={4}
                placeholder="What was wrong? Example: On flooring pages without printed code, use design name + visible size to generate a short SKU. Color family should be warm grey, not white."
                value={inputContext}
                onChange={e => setInputContext(e.target.value)}
                style={{ resize: 'vertical' }}
              />

              <textarea
                className="inp"
                rows={5}
                placeholder="Correction text (required). Example: If the page has a large board image and a design label like Caldera, extract it as a product even without a printed code."
                value={correctionText}
                onChange={e => setCorrectionText(e.target.value)}
                style={{ resize: 'vertical' }}
              />

              <textarea
                className="inp"
                rows={6}
                placeholder='Optional corrected output JSON or rule text. Example: {"sku":"CALD-1811220","name":"Caldera","length_mm":"1220","width_mm":"181","subcategory":"flooring","color_family":"warm grey"}'
                value={expectedOutput}
                onChange={e => setExpectedOutput(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            {(message || error) && (
              <div style={{
                marginTop: 14,
                padding: '12px 14px',
                borderRadius: 10,
                background: error ? '#2d0a0a' : '#0a1a0f',
                border: `1px solid ${error ? '#7f1d1d' : '#14532d'}`,
                color: error ? 'var(--red)' : 'var(--green)',
                fontFamily: 'var(--mono)',
                fontSize: 13,
              }}>
                {error || message}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={submitTrainingExample} disabled={saving || !activeCategoryName}>
                {saving ? 'Saving…' : 'Save training example'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Recent training examples</div>
              <div style={{ maxHeight: 620, overflow: 'auto' }}>
                {examples.length ? examples.map(example => (
                  <div key={example.id} style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: example.image_data_url ? '180px 1fr' : '1fr', gap: 16 }}>
                    {example.image_data_url && (
                      <img src={example.image_data_url} alt="example" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)' }} />
                    )}

                    <div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        <span style={{ padding: '3px 8px', borderRadius: 999, background: '#ffffff12', fontSize: 12, textTransform: 'capitalize' }}>{example.category_name}</span>
                        {example.subcategory ? (
                          <span style={{ padding: '3px 8px', borderRadius: 999, background: '#ffffff12', fontSize: 12 }}>{example.subcategory}</span>
                        ) : null}
                      </div>

                      {example.input_context ? (
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{example.input_context}</div>
                      ) : null}

                      <div style={{ fontSize: 14, lineHeight: 1.55 }}>{example.correction_text}</div>

                      {example.expected_output ? (
                        <pre style={{
                          marginTop: 10,
                          padding: 12,
                          borderRadius: 10,
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          overflow: 'auto',
                          fontSize: 12,
                          color: 'var(--muted)',
                        }}>
                          {JSON.stringify(example.expected_output, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: 24, color: 'var(--muted)' }}>No training examples yet.</div>
                )}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Recent extraction ratings</div>
              <div style={{ maxHeight: 620, overflow: 'auto' }}>
                {ratings.length ? ratings.map(item => (
                  <div key={item.id} style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{'★'.repeat(item.rating)}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>{item.category_name}</span>
                      {item.subcategory ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {item.subcategory}</span> : null}
                    </div>
                    <div style={{ fontSize: 13, color: item.notes ? 'var(--text)' : 'var(--muted)' }}>{item.notes || 'No note added.'}</div>
                  </div>
                )) : (
                  <div style={{ padding: 24, color: 'var(--muted)' }}>No ratings yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

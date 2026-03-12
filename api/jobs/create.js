export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { pdf_name, category_id, custom_category_name } = req.body || {}
  if (!pdf_name) return res.status(400).json({ error: 'Missing pdf_name' })

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase environment variables are not set.' })
  }

  const normalizeName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')

  let finalCategoryId = category_id || null
  let finalCategoryName = ''

  try {
    const customName = normalizeName(custom_category_name)

    if (!finalCategoryId && !customName) {
      return res.status(400).json({ error: 'Missing category_id or custom_category_name' })
    }

    if (customName) {
      const categoryRes = await fetch(`${SB_URL}/rest/v1/categories?on_conflict=name&select=id,name`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([{ name: customName }]),
      })

      const categoryData = await categoryRes.json()
      if (!categoryRes.ok) {
        return res.status(500).json({ error: JSON.stringify(categoryData).slice(0, 300) })
      }

      const category = Array.isArray(categoryData) ? categoryData[0] : categoryData
      finalCategoryId = category?.id
      finalCategoryName = category?.name || customName
    }

    const jobRes = await fetch(`${SB_URL}/rest/v1/jobs`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        pdf_name,
        category_id: finalCategoryId,
        status: 'processing',
      }),
    })

    const jobData = await jobRes.json()
    if (!jobRes.ok) {
      return res.status(500).json({ error: JSON.stringify(jobData).slice(0, 300) })
    }

    const job = Array.isArray(jobData) ? jobData[0] : jobData
    return res.status(200).json({
      job_id: job.id,
      category_id: finalCategoryId,
      category_name: finalCategoryName,
    })
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) })
  }
}

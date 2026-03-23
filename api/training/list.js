function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export default async function handler(req, res) {
  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase environment variables are not set.' })
  }

  const categoryName = normalizeName(req.query.category_name || '')
  const exampleFilter = categoryName ? `&category_name=eq.${encodeURIComponent(categoryName)}` : ''
  const feedbackFilter = categoryName ? `&category_name=eq.${encodeURIComponent(categoryName)}` : ''

  try {
    const [examplesRes, ratingsRes] = await Promise.all([
      fetch(
        `${SB_URL}/rest/v1/training_examples?select=id,category_name,subcategory,image_data_url,input_context,correction_text,expected_output,rating_score,usage_count,created_at&order=created_at.desc&limit=30${exampleFilter}`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      ),
      fetch(
        `${SB_URL}/rest/v1/job_feedback?select=id,job_id,category_name,subcategory,rating,notes,created_at&order=created_at.desc&limit=30${feedbackFilter}`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      ),
    ])

    const examples = await examplesRes.json().catch(() => [])
    const ratings = await ratingsRes.json().catch(() => [])

    return res.status(200).json({
      examples: Array.isArray(examples) ? examples : [],
      ratings: Array.isArray(ratings) ? ratings : [],
    })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
}

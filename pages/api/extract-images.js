export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const baseUrl = process.env.IMAGE_EXTRACTOR_URL || 'http://localhost:8000'

  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks)

  let response
  try {
    response = await fetch(`${baseUrl}/extract-images`, {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] },
      body,
    })
  } catch {
    return res.status(503).json({
      error: 'Image extractor service is not running. Start it with start.bat inside the image-extractor-api folder.',
    })
  }

  if (!response.ok) {
    const text = await response.text()
    let detail = text
    try { detail = JSON.parse(text).detail } catch {}
    return res.status(response.status).json({ error: detail || 'Extraction failed.' })
  }

  res.setHeader('Content-Type', 'application/zip')
  const disposition = response.headers.get('content-disposition') || 'attachment; filename="extracted_images.zip"'
  res.setHeader('Content-Disposition', disposition)

  const buffer = await response.arrayBuffer()
  res.end(Buffer.from(buffer))
}

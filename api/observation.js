export default async function handler(req, res) {
  const { notation, skip, limit } = req.query

  const url = `https://environment.data.gov.uk/water-quality/sampling-point/${notation}/observation?` +
    `skip=${skip || 0}&limit=${limit || 250}`

  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'application/ld+json',
        'API-Version': '1'
      }
    })

    const text = await response.text()
    const data = JSON.parse(text)

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json(data)

  } catch (err) {
    console.error('Error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
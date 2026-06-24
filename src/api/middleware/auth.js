// Valida que el header x-api-key coincida con la clave configurada en .env
function apiKey(req, res, next) {
  const clave = req.headers['x-api-key']
  if (!clave || clave !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: 'API key inválida o ausente' })
  }
  next()
}

module.exports = { apiKey }

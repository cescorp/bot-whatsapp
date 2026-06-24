const jwt = require('jsonwebtoken')

function verificarJWT(req, res, next) {
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' })
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRETO)
    next()
  } catch {
    res.status(401).json({ ok: false, error: 'Token inválido o expirado' })
  }
}

module.exports = { verificarJWT }

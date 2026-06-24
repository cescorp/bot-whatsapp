const { Router } = require('express')
const { estaConectado } = require('../../whatsapp')

const router = Router()

// GET /estado — health check del bot y la API
router.get('/', (req, res) => {
  res.json({
    ok:         true,
    whatsapp:   estaConectado() ? 'conectado' : 'desconectado',
    timestamp:  new Date().toISOString(),
  })
})

module.exports = router

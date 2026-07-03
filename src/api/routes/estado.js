const { Router } = require('express')
const { estaConectado, cuentas } = require('../../whatsapp')
const { obtenerCuentasActivas }  = require('../../db')

const router = Router()

// GET /estado — estado de conexión de todas las cuentas activas
router.get('/', async (req, res) => {
  try {
    const activas  = await obtenerCuentasActivas()
    const detalle  = activas.map(c => ({
      id:        c.id,
      nombre:    c.nombre,
      numero:    c.numero,
      conectado: estaConectado(c.id),
    }))
    const todasConectadas = detalle.every(c => c.conectado)

    res.json({
      ok:        true,
      whatsapp:  todasConectadas ? 'conectado' : 'desconectado',
      cuentas:   detalle,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

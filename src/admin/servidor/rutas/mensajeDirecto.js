const { Router } = require('express')
const { pool }   = require('../../../db')
const { enviarMensaje, estaConectado } = require('../../../whatsapp')

const router = Router()

router.post('/', async (req, res) => {
  const { destino, texto, cuenta_id = 1, contacto_id = null } = req.body

  if (!destino || !texto) {
    return res.status(400).json({ ok: false, error: 'destino y texto son obligatorios' })
  }

  try {
    const { rows: cuentaRows } = await pool.query(
      `SELECT wts_cuenta_nombre FROM wts_cuenta WHERE wts_cuenta_id = $1 AND wts_cuenta_estado = 1`,
      [cuenta_id]
    )
    if (!cuentaRows.length) {
      return res.status(400).json({ ok: false, error: `Cuenta ${cuenta_id} no existe o está inactiva` })
    }

    if (!estaConectado(cuenta_id)) {
      return res.status(503).json({ ok: false, error: `Cuenta ${cuenta_id} no está conectada a WhatsApp` })
    }

    await enviarMensaje(cuenta_id, destino, texto)

    const { rows } = await pool.query(`
      INSERT INTO wts_mensaje (
        wts_contacto_id, wts_mensaje_tipo, wts_mensaje_origen,
        wts_mensaje_destino, wts_mensaje_texto,
        wts_mensaje_fecha_programada, wts_mensaje_fecha_envio,
        wts_mensaje_estado, wts_mensaje_prioridad, wts_mensaje_intentos,
        wts_cuenta_id, user_crea, fecha_crea
      ) VALUES ($1, 1, 2, $2, $3, NOW(), NOW(), 2, 5, 1, $4, $5, NOW())
      RETURNING wts_mensaje_id AS id
    `, [contacto_id, destino, texto, cuenta_id, req.usuario.email])

    res.json({ ok: true, id: rows[0].id, cuenta_id, destino })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

const { Router } = require('express')
const { pool }   = require('../../db')
const { estaConectado } = require('../../whatsapp')

const router = Router()

// POST /mensajes — crea un mensaje puntual en la cola
// Body: { contacto_id, destino, texto, fecha_programada, prioridad?, plantilla_id?, cuenta_id? }
router.post('/', async (req, res) => {
  const { contacto_id, destino, texto, fecha_programada, prioridad = 5, plantilla_id, cuenta_id = 1 } = req.body

  if (!contacto_id || !destino || !fecha_programada) {
    return res.status(400).json({ ok: false, error: 'contacto_id, destino y fecha_programada son obligatorios' })
  }

  try {
    // Validar que la cuenta existe y está activa
    const { rows: cuentaRows } = await pool.query(
      `SELECT wts_cuenta_nombre FROM wts_cuenta WHERE wts_cuenta_id = $1 AND wts_cuenta_estado = 1`,
      [cuenta_id]
    )
    if (!cuentaRows.length) {
      return res.status(400).json({ ok: false, error: `Cuenta ${cuenta_id} no existe o está inactiva` })
    }

    const { rows } = await pool.query(`
      INSERT INTO wts_mensaje (
        wts_contacto_id, wts_mensaje_tipo, wts_mensaje_origen,
        wts_mensaje_destino, wts_mensaje_texto, wts_plantilla_id,
        wts_mensaje_fecha_programada, wts_mensaje_estado,
        wts_mensaje_prioridad, wts_mensaje_intentos,
        wts_cuenta_id, user_crea, fecha_crea
      ) VALUES ($1, 1, 3, $2, $3, $4, $5, 1, $6, 0, $7, 'API', NOW())
      RETURNING wts_mensaje_id AS id
    `, [contacto_id, destino, texto || null, plantilla_id || null, fecha_programada, prioridad, cuenta_id])

    res.status(201).json({
      ok:       true,
      id:       rows[0].id,
      cuenta_id,
      whatsapp: estaConectado(cuenta_id) ? 'conectado' : 'desconectado',
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /mensajes/:id — consulta estado de un mensaje
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.wts_mensaje_id               AS id,
        m.wts_mensaje_destino          AS destino,
        m.wts_mensaje_texto            AS texto,
        m.wts_mensaje_estado           AS estado,
        m.wts_mensaje_fecha_programada AS fecha_programada,
        m.wts_mensaje_fecha_envio      AS fecha_envio,
        m.wts_mensaje_intentos         AS intentos,
        m.wts_mensaje_ultimo_error     AS ultimo_error
      FROM wts_mensaje m
      WHERE m.wts_mensaje_id = $1
    `, [req.params.id])

    if (!rows.length) return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' })
    res.json({ ok: true, mensaje: rows[0] })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

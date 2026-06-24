const { Router } = require('express')
const { pool }   = require('../../db')

const router = Router()

// POST /calendario — crea un evento con sus alertas
// El trigger de la BD genera los mensajes automáticamente.
// Body: {
//   contacto_id, titulo, descripcion?,
//   fecha_evento,       — ISO string: "2026-07-01T09:00:00"
//   plantilla_id?,
//   alertas: [          — al menos una
//     { tipo, valor, prioridad? }
//     tipo: 1=días antes | 2=horas antes | 3=minutos antes | 4=hora fija (HH:MM)
//   ]
// }
router.post('/', async (req, res) => {
  const { contacto_id, titulo, descripcion, fecha_evento, plantilla_id, alertas } = req.body

  if (!contacto_id || !titulo || !fecha_evento) {
    return res.status(400).json({ ok: false, error: 'contacto_id, titulo y fecha_evento son obligatorios' })
  }
  if (!Array.isArray(alertas) || alertas.length === 0) {
    return res.status(400).json({ ok: false, error: 'Se requiere al menos una alerta' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Crear el evento
    const { rows } = await client.query(`
      INSERT INTO wts_calendario (
        wts_contacto_id, wts_plantilla_id, wts_calendario_titulo,
        wts_calendario_descripcion, wts_calendario_fecha_evento,
        wts_calendario_estado, user_crea, fecha_crea
      ) VALUES ($1, $2, $3, $4, $5, 1, 'API', NOW())
      RETURNING wts_calendario_id AS id
    `, [contacto_id, plantilla_id || null, titulo, descripcion || null, fecha_evento])

    const calendario_id = rows[0].id

    // 2. Insertar alertas — el trigger wts_calendario_alerta_ai genera los mensajes
    for (const alerta of alertas) {
      if (!alerta.tipo || !alerta.valor) continue
      await client.query(`
        INSERT INTO wts_calendario_alerta (
          wts_calendario_id, wts_calendario_alerta_tipo,
          wts_calendario_alerta_valor, wts_calendario_alerta_descripcion,
          wts_calendario_alerta_prioridad, wts_calendario_alerta_estado,
          user_crea, fecha_crea
        ) VALUES ($1, $2, $3, $4, $5, 1, 'API', NOW())
      `, [
        calendario_id,
        alerta.tipo,
        String(alerta.valor),
        alerta.descripcion || null,
        alerta.prioridad || 5,
      ])
    }

    await client.query('COMMIT')
    res.status(201).json({ ok: true, calendario_id })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router

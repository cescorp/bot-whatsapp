const { Router } = require('express')
const { pool }   = require('../../db')

const router = Router()

// GET /plantillas — lista plantillas activas
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        wts_plantilla_id     AS id,
        wts_plantilla_nombre AS nombre,
        wts_plantilla_texto  AS texto,
        wts_plantilla_tipo   AS tipo
      FROM wts_plantilla
      WHERE wts_plantilla_estado = 1
      ORDER BY wts_plantilla_nombre
    `)
    res.json({ ok: true, total: rows.length, plantillas: rows })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /plantillas — crea una nueva plantilla
// Body: { nombre, texto, tipo? }
// Variables disponibles en texto: {{nombre}}, {{celular}}, {{mensaje}}, {{titulo}}, {{fecha_evento}}
router.post('/', async (req, res) => {
  const { nombre, texto, tipo = 1 } = req.body

  if (!nombre || !texto) {
    return res.status(400).json({ ok: false, error: 'nombre y texto son obligatorios' })
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO wts_plantilla (
        wts_plantilla_nombre, wts_plantilla_texto,
        wts_plantilla_tipo, wts_plantilla_estado,
        user_crea, fecha_crea
      ) VALUES ($1, $2, $3, 1, 'API', NOW())
      RETURNING wts_plantilla_id AS id
    `, [nombre, texto, tipo])

    res.status(201).json({ ok: true, id: rows[0].id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

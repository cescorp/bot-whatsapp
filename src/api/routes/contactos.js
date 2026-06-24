const { Router } = require('express')
const { pool }   = require('../../db')

const router = Router()

// GET /contactos — lista contactos activos
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        wts_contacto_id             AS id,
        wts_contacto_nombres        AS nombres,
        wts_contacto_apellidos      AS apellidos,
        wts_contacto_celular_principal AS celular,
        wts_contacto_correo         AS correo,
        wts_contacto_permite_whatsapp  AS permite_whatsapp,
        wts_contacto_estado         AS estado
      FROM wts_contacto
      WHERE wts_contacto_estado = 1
      ORDER BY wts_contacto_nombres
    `)
    res.json({ ok: true, total: rows.length, contactos: rows })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /contactos — crea un nuevo contacto
// Body: { nombres, apellidos, celular, correo?, permite_whatsapp? }
router.post('/', async (req, res) => {
  const { nombres, apellidos, celular, correo, permite_whatsapp = 1 } = req.body

  if (!nombres || !celular) {
    return res.status(400).json({ ok: false, error: 'nombres y celular son obligatorios' })
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO wts_contacto (
        wts_contacto_tipo, wts_contacto_nombres, wts_contacto_apellidos,
        wts_contacto_celular_principal, wts_contacto_correo,
        wts_contacto_permite_whatsapp, wts_contacto_estado,
        user_crea, fecha_crea
      ) VALUES (1, $1, $2, $3, $4, $5, 1, 'API', NOW())
      RETURNING wts_contacto_id AS id
    `, [nombres, apellidos || '', celular, correo || null, permite_whatsapp])

    res.status(201).json({ ok: true, id: rows[0].id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

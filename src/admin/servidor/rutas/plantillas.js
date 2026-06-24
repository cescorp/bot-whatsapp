const { Router } = require('express')
const { pool }   = require('../../../db')

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wts_plantilla_id     AS id,
             wts_plantilla_nombre AS nombre,
             wts_plantilla_texto  AS texto,
             wts_plantilla_estado AS estado,
             user_crea, fecha_crea
      FROM   wts_plantilla
      ORDER BY wts_plantilla_nombre
    `)
    res.json({ ok: true, datos: rows })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wts_plantilla_id AS id, wts_plantilla_nombre AS nombre,
             wts_plantilla_texto AS texto, wts_plantilla_estado AS estado
      FROM wts_plantilla WHERE wts_plantilla_id = $1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' })
    res.json({ ok: true, dato: rows[0] })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/', async (req, res) => {
  const { nombre, texto } = req.body || {}
  if (!nombre || !texto) return res.status(400).json({ ok: false, error: 'nombre y texto requeridos' })
  try {
    const { rows } = await pool.query(`
      INSERT INTO wts_plantilla (wts_plantilla_nombre, wts_plantilla_texto, wts_plantilla_estado, user_crea, fecha_crea)
      VALUES ($1,$2,1,$3,NOW()) RETURNING wts_plantilla_id AS id
    `, [nombre, texto, req.usuario.email])
    res.status(201).json({ ok: true, id: rows[0].id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  const { nombre, texto, estado } = req.body || {}
  try {
    await pool.query(`
      UPDATE wts_plantilla
      SET wts_plantilla_nombre = COALESCE($2, wts_plantilla_nombre),
          wts_plantilla_texto  = COALESCE($3, wts_plantilla_texto),
          wts_plantilla_estado = COALESCE($4, wts_plantilla_estado),
          user_modifica=$5, fecha_modifica=NOW()
      WHERE wts_plantilla_id=$1
    `, [req.params.id, nombre||null, texto||null, estado!=null?estado:null, req.usuario.email])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`
      UPDATE wts_plantilla SET wts_plantilla_estado=0, user_modifica=$2, fecha_modifica=NOW()
      WHERE wts_plantilla_id=$1
    `, [req.params.id, req.usuario.email])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

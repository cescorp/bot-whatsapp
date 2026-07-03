const { Router } = require('express')
const { pool }   = require('../../../db')

const router = Router()

// GET /admin/api/mensajes?cuenta_id=&estado=&desde=&hasta=&page=&limit=
router.get('/', async (req, res) => {
  const { cuenta_id, estado, desde, hasta, page = 1, limit = 50 } = req.query
  const conds = []
  const vals  = []

  if (cuenta_id) { vals.push(parseInt(cuenta_id)); conds.push(`COALESCE(m.wts_cuenta_id,1) = $${vals.length}`) }
  if (estado)    { vals.push(estado);  conds.push(`m.wts_mensaje_estado = $${vals.length}`) }
  if (desde)     { vals.push(desde);   conds.push(`m.wts_mensaje_fecha_programada >= $${vals.length}`) }
  if (hasta)     { vals.push(hasta);   conds.push(`m.wts_mensaje_fecha_programada <= $${vals.length}`) }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
  const offset = (parseInt(page) - 1) * parseInt(limit)
  vals.push(parseInt(limit), offset)

  try {
    const { rows } = await pool.query(`
      SELECT m.wts_mensaje_id          AS id,
             m.wts_mensaje_estado      AS estado,
             m.wts_mensaje_destino     AS destino,
             m.wts_mensaje_texto       AS texto,
             m.wts_mensaje_fecha_programada AS fecha_programada,
             m.wts_mensaje_fecha_envio      AS fecha_envio,
             m.wts_mensaje_intentos    AS intentos,
             m.wts_mensaje_ultimo_error AS ultimo_error,
             m.wts_mensaje_prioridad   AS prioridad,
             concat(c.wts_contacto_nombres,' ',c.wts_contacto_apellidos) AS contacto,
             p.wts_plantilla_nombre    AS plantilla,
             ct.wts_cuenta_nombre      AS cuenta,
             m.fecha_crea
      FROM   wts_mensaje m
      LEFT  JOIN wts_contacto c  ON c.wts_contacto_id  = m.wts_contacto_id
      LEFT  JOIN wts_plantilla p ON p.wts_plantilla_id = m.wts_plantilla_id
      LEFT  JOIN wts_cuenta ct   ON ct.wts_cuenta_id   = m.wts_cuenta_id
      ${where}
      ORDER BY m.wts_mensaje_fecha_programada DESC, m.wts_mensaje_id DESC
      LIMIT $${vals.length - 1} OFFSET $${vals.length}
    `, vals)

    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*) AS total FROM wts_mensaje m ${where}`,
      vals.slice(0, -2)
    )

    res.json({ ok: true, total: parseInt(total), datos: rows })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /admin/api/mensajes/:id — detalle con log
router.get('/:id', async (req, res) => {
  try {
    const [{ rows: [msg] }, { rows: log }] = await Promise.all([
      pool.query(`
        SELECT m.*, concat(c.wts_contacto_nombres,' ',c.wts_contacto_apellidos) AS contacto,
               p.wts_plantilla_nombre AS plantilla
        FROM wts_mensaje m
        INNER JOIN wts_contacto c ON c.wts_contacto_id = m.wts_contacto_id
        LEFT  JOIN wts_plantilla p ON p.wts_plantilla_id = m.wts_plantilla_id
        WHERE m.wts_mensaje_id = $1
      `, [req.params.id]),
      pool.query(`
        SELECT * FROM wts_mensaje_log WHERE wts_mensaje_id=$1 ORDER BY fecha_crea
      `, [req.params.id]),
    ])
    if (!msg) return res.status(404).json({ ok: false, error: 'No encontrado' })
    res.json({ ok: true, mensaje: msg, log })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /admin/api/mensajes — crea mensaje programado desde el panel
router.post('/', async (req, res) => {
  const { contacto_id, destino, texto, fecha_programada, cuenta_id = 1 } = req.body
  if (!destino || !texto || !fecha_programada) {
    return res.status(400).json({ ok: false, error: 'destino, texto y fecha_programada son obligatorios' })
  }
  try {
    const { rows } = await pool.query(`
      INSERT INTO wts_mensaje (
        wts_contacto_id, wts_mensaje_tipo, wts_mensaje_origen,
        wts_mensaje_destino, wts_mensaje_texto,
        wts_mensaje_fecha_programada, wts_mensaje_estado,
        wts_mensaje_prioridad, wts_mensaje_intentos,
        wts_cuenta_id, user_crea, fecha_crea
      ) VALUES ($1, 1, 2, $2, $3, $4, 1, 5, 0, $5, $6, NOW())
      RETURNING wts_mensaje_id AS id
    `, [contacto_id || null, destino, texto, fecha_programada, cuenta_id, req.usuario.email])
    res.status(201).json({ ok: true, id: rows[0].id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// PUT /admin/api/mensajes/:id/reenviar — pone estado=1 para que el bot reintente
router.put('/:id/reenviar', async (req, res) => {
  try {
    await pool.query(`
      UPDATE wts_mensaje
      SET wts_mensaje_estado=1, wts_mensaje_intentos=0, wts_mensaje_ultimo_error=NULL,
          user_modifica=$2, fecha_modifica=NOW()
      WHERE wts_mensaje_id=$1
    `, [req.params.id, req.usuario.email])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

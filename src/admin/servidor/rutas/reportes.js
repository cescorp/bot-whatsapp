const { Router } = require('express')
const { pool }   = require('../../../db')

const router = Router()

// GET /admin/api/reportes?desde=&hasta=
router.get('/', async (req, res) => {
  const desde = req.query.desde || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const hasta = req.query.hasta || new Date().toISOString().slice(0, 10)

  try {
    const [porDia, porEstado, porPlantilla, topContactos] = await Promise.all([
      pool.query(`
        SELECT TO_CHAR(wts_mensaje_fecha_programada::DATE,'DD/MM') AS dia,
               COUNT(*) AS total,
               SUM(CASE WHEN wts_mensaje_estado=3 THEN 1 ELSE 0 END) AS enviados,
               SUM(CASE WHEN wts_mensaje_estado=4 THEN 1 ELSE 0 END) AS errores
        FROM wts_mensaje
        WHERE wts_mensaje_fecha_programada::DATE BETWEEN $1 AND $2
        GROUP BY wts_mensaje_fecha_programada::DATE
        ORDER BY wts_mensaje_fecha_programada::DATE
      `, [desde, hasta]),

      pool.query(`
        SELECT wts_mensaje_estado AS estado, COUNT(*) AS cantidad
        FROM wts_mensaje
        WHERE wts_mensaje_fecha_programada::DATE BETWEEN $1 AND $2
        GROUP BY wts_mensaje_estado
      `, [desde, hasta]),

      pool.query(`
        SELECT COALESCE(p.wts_plantilla_nombre,'Sin plantilla') AS plantilla,
               COUNT(*) AS cantidad
        FROM wts_mensaje m
        LEFT JOIN wts_plantilla p ON p.wts_plantilla_id = m.wts_plantilla_id
        WHERE m.wts_mensaje_fecha_programada::DATE BETWEEN $1 AND $2
        GROUP BY p.wts_plantilla_nombre
        ORDER BY cantidad DESC
        LIMIT 10
      `, [desde, hasta]),

      pool.query(`
        SELECT concat(c.wts_contacto_nombres,' ',c.wts_contacto_apellidos) AS contacto,
               COUNT(*) AS mensajes
        FROM wts_mensaje m
        INNER JOIN wts_contacto c ON c.wts_contacto_id = m.wts_contacto_id
        WHERE m.wts_mensaje_fecha_programada::DATE BETWEEN $1 AND $2
          AND m.wts_mensaje_estado = 3
        GROUP BY c.wts_contacto_id
        ORDER BY mensajes DESC
        LIMIT 10
      `, [desde, hasta]),
    ])

    res.json({
      ok: true,
      periodo: { desde, hasta },
      porDia:        porDia.rows,
      porEstado:     porEstado.rows,
      porPlantilla:  porPlantilla.rows,
      topContactos:  topContactos.rows,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

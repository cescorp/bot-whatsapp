const { Router } = require('express')
const { pool }   = require('../../../db')

const router = Router()

// GET /admin/api/dashboard — tarjetas de resumen y datos de gráficas
router.get('/', async (req, res) => {
  try {
    const [totales, porEstado, ultimos7, conexion] = await Promise.all([
      // Tarjetas resumen
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM wts_mensaje)                                   AS total_mensajes,
          (SELECT COUNT(*) FROM wts_mensaje WHERE wts_mensaje_estado = 3)      AS enviados,
          (SELECT COUNT(*) FROM wts_mensaje WHERE wts_mensaje_estado = 4)      AS errores,
          (SELECT COUNT(*) FROM wts_mensaje WHERE wts_mensaje_estado = 1)      AS pendientes,
          (SELECT COUNT(*) FROM wts_contacto WHERE wts_contacto_estado = 1)    AS contactos,
          (SELECT COUNT(*) FROM wts_plantilla WHERE wts_plantilla_estado = 1)  AS plantillas,
          (SELECT COUNT(*) FROM wts_calendario WHERE wts_calendario_estado = 1) AS eventos
      `),
      // Donut por estado
      pool.query(`
        SELECT wts_mensaje_estado AS estado, COUNT(*) AS cantidad
        FROM   wts_mensaje
        GROUP BY wts_mensaje_estado
        ORDER BY wts_mensaje_estado
      `),
      // Enviados por día (últimos 7 días)
      pool.query(`
        SELECT TO_CHAR(wts_mensaje_fecha_envio::DATE, 'DD/MM') AS dia,
               COUNT(*) AS cantidad
        FROM   wts_mensaje
        WHERE  wts_mensaje_estado = 3
          AND  wts_mensaje_fecha_envio >= NOW() - INTERVAL '7 days'
        GROUP BY wts_mensaje_fecha_envio::DATE
        ORDER BY wts_mensaje_fecha_envio::DATE
      `),
      // Estado WhatsApp (desde wts_configuracion o simplemente ok)
      pool.query(`SELECT NOW() AS ahora`),
    ])

    res.json({
      ok: true,
      tarjetas: totales.rows[0],
      porEstado: porEstado.rows,
      ultimos7:  ultimos7.rows,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

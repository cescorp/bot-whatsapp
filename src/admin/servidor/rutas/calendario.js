const { Router } = require('express')
const { pool }   = require('../../../db')
const { logError } = require('../logger-errores')

const router = Router()

// ── Generar mensajes para un evento (reemplaza trigger) ───────────────────────
async function generarMensajes(calendarioId, client) {
  const { rows: [cal] } = await client.query(`
    SELECT c.*, ct.wts_contacto_celular_principal AS celular_contacto,
           g.wts_grupo_jid
    FROM   wts_calendario c
    LEFT JOIN wts_contacto ct ON ct.wts_contacto_id = c.wts_contacto_id
    LEFT JOIN wts_grupo    g  ON g.wts_grupo_id     = c.wts_grupo_id
    WHERE  c.wts_calendario_id = $1
  `, [calendarioId])

  if (!cal || cal.wts_calendario_estado !== 1) return

  // Resolver destino
  let destino = null, contacto_id = null
  if (cal.wts_contacto_id && cal.celular_contacto) {
    destino     = cal.celular_contacto
    contacto_id = cal.wts_contacto_id
  } else if (cal.wts_grupo_id && cal.wts_grupo_jid) {
    destino = cal.wts_grupo_jid
  } else if (cal.wts_calendario_destino_libre) {
    destino = cal.wts_calendario_destino_libre
  }
  if (!destino) return

  const { rows: alertas } = await client.query(`
    SELECT * FROM wts_calendario_alerta
    WHERE  wts_calendario_id = $1 AND wts_calendario_alerta_estado = 1
    ORDER BY wts_calendario_alerta_id
  `, [calendarioId])

  if (!alertas.length) return

  // Cancelar mensajes pendientes anteriores
  await client.query(`
    UPDATE wts_mensaje SET wts_mensaje_estado = 5, user_modifica = 'SISTEMA', fecha_modifica = NOW()
    WHERE  wts_calendario_id = $1 AND wts_mensaje_estado NOT IN (3, 5)
  `, [calendarioId])

  const texto       = cal.wts_calendario_mensaje_texto || `Recordatorio: ${cal.wts_calendario_titulo}`
  const repeticion  = parseInt(cal.wts_calendario_repeticion) || 0
  const repFinStr   = cal.wts_calendario_repeticion_fin
  const repFin      = repFinStr ? new Date(repFinStr) : null

  // Construir lista de fechas de evento según repetición
  const fechas = []
  let fechaActual = new Date(cal.wts_calendario_fecha_evento)

  fechas.push(new Date(fechaActual))

  if (repeticion > 0 && repFin) {
    while (true) {
      let siguiente = new Date(fechaActual)
      if      (repeticion === 1) siguiente.setDate(siguiente.getDate() + 1)       // diario
      else if (repeticion === 2) siguiente.setDate(siguiente.getDate() + 7)       // semanal
      else if (repeticion === 3) siguiente.setMonth(siguiente.getMonth() + 1)     // mensual

      if (siguiente > repFin) break
      fechas.push(new Date(siguiente))
      fechaActual = siguiente
    }
  }

  // Generar mensajes para cada fecha × cada alerta
  for (const fechaEvento of fechas) {
    for (const a of alertas) {
      let fechaProg = new Date(fechaEvento)
      const tipo  = a.wts_calendario_alerta_tipo
      const valor = a.wts_calendario_alerta_valor

      if      (tipo === 1) fechaProg = new Date(fechaEvento.getTime() - parseInt(valor) * 86400000)
      else if (tipo === 2) fechaProg = new Date(fechaEvento.getTime() - parseInt(valor) * 3600000)
      else if (tipo === 3) fechaProg = new Date(fechaEvento.getTime() - parseInt(valor) * 60000)
      else if (tipo === 4) {
        const [h, m] = valor.split(':')
        fechaProg = new Date(fechaEvento)
        fechaProg.setHours(parseInt(h), parseInt(m || 0), 0, 0)
      } else if (tipo === 0) {
        fechaProg = new Date(fechaEvento)
      } else {
        continue
      }

      await client.query(`
        INSERT INTO wts_mensaje
          (wts_contacto_id, wts_calendario_id, wts_calendario_alerta_id,
           wts_mensaje_tipo, wts_mensaje_origen,
           wts_mensaje_destino, wts_mensaje_texto,
           wts_mensaje_fecha_programada, wts_mensaje_estado,
           wts_mensaje_prioridad, wts_mensaje_intentos,
           wts_cuenta_id, user_crea)
        VALUES ($1,$2,$3, 2,2, $4,$5, $6, 1, $7, 0, $8, 'SISTEMA')
      `, [contacto_id, calendarioId, a.wts_calendario_alerta_id,
          destino, texto, fechaProg,
          a.wts_calendario_alerta_prioridad || 2,
          cal.wts_cuenta_id || 1])
    }
  }
}

// ── GET / — eventos del mes (year + month en query) ─────────────────────────
router.get('/', async (req, res) => {
  try {
    const year  = parseInt(req.query.year)  || new Date().getFullYear()
    const month = parseInt(req.query.month) || new Date().getMonth() + 1
    const { rows } = await pool.query(`
      SELECT c.wts_calendario_id            AS id,
             c.wts_calendario_titulo        AS titulo,
             c.wts_calendario_descripcion   AS descripcion,
             c.wts_calendario_fecha_evento  AS fecha_evento,
             c.wts_calendario_estado        AS estado,
             c.wts_contacto_id              AS contacto_id,
             c.wts_grupo_id                 AS grupo_id,
             c.wts_calendario_destino_libre AS destino_libre,
             c.wts_calendario_mensaje_texto AS mensaje_texto,
             c.wts_calendario_repeticion    AS repeticion,
             c.wts_calendario_repeticion_fin AS repeticion_fin,
             c.wts_plantilla_id             AS plantilla_id,
             CONCAT(ct.wts_contacto_nombres,' ',ct.wts_contacto_apellidos) AS contacto_nombre,
             ct.wts_contacto_celular_principal AS contacto_celular,
             g.wts_grupo_nombre             AS grupo_nombre,
             p.wts_plantilla_nombre         AS plantilla_nombre,
             COUNT(m.wts_mensaje_id)        AS total_mensajes,
             SUM(CASE WHEN m.wts_mensaje_estado=3 THEN 1 ELSE 0 END) AS enviados,
             SUM(CASE WHEN m.wts_mensaje_estado=4 THEN 1 ELSE 0 END) AS errores,
             SUM(CASE WHEN m.wts_mensaje_estado=1 THEN 1 ELSE 0 END) AS pendientes
      FROM   wts_calendario c
      LEFT JOIN wts_contacto ct ON ct.wts_contacto_id = c.wts_contacto_id
      LEFT JOIN wts_grupo    g  ON g.wts_grupo_id     = c.wts_grupo_id
      LEFT JOIN wts_plantilla p ON p.wts_plantilla_id = c.wts_plantilla_id
      LEFT JOIN wts_mensaje   m ON m.wts_calendario_id = c.wts_calendario_id
      WHERE  c.wts_calendario_estado <> 2
        AND  EXTRACT(YEAR  FROM c.wts_calendario_fecha_evento) = $1
        AND  EXTRACT(MONTH FROM c.wts_calendario_fecha_evento) = $2
      GROUP BY c.wts_calendario_id, ct.wts_contacto_nombres, ct.wts_contacto_apellidos,
               ct.wts_contacto_celular_principal, g.wts_grupo_nombre, p.wts_plantilla_nombre
      ORDER BY c.wts_calendario_fecha_evento
    `, [year, month])
    res.json({ ok: true, datos: rows })
  } catch (err) {
    logError('GET /admin/api/calendario', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /:id — detalle con alertas ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows: [cal] } = await pool.query(`
      SELECT c.*,
             TO_CHAR(c.wts_calendario_fecha_evento, 'YYYY-MM-DD"T"HH24:MI') AS fecha_local,
             CONCAT(ct.wts_contacto_nombres,' ',ct.wts_contacto_apellidos) AS contacto_nombre,
             ct.wts_contacto_celular_principal AS contacto_celular,
             g.wts_grupo_nombre,
             p.wts_plantilla_nombre, p.wts_plantilla_texto
      FROM   wts_calendario c
      LEFT JOIN wts_contacto ct ON ct.wts_contacto_id = c.wts_contacto_id
      LEFT JOIN wts_grupo    g  ON g.wts_grupo_id     = c.wts_grupo_id
      LEFT JOIN wts_plantilla p ON p.wts_plantilla_id = c.wts_plantilla_id
      WHERE  c.wts_calendario_id = $1
    `, [req.params.id])
    if (!cal) return res.status(404).json({ ok: false, error: 'No encontrado' })

    const { rows: alertas } = await pool.query(`
      SELECT wts_calendario_alerta_id AS id,
             wts_calendario_alerta_tipo AS tipo,
             wts_calendario_alerta_valor AS valor,
             wts_calendario_alerta_descripcion AS descripcion,
             wts_calendario_alerta_prioridad AS prioridad,
             wts_calendario_alerta_estado AS estado
      FROM   wts_calendario_alerta
      WHERE  wts_calendario_id = $1
      ORDER BY wts_calendario_alerta_id
    `, [req.params.id])

    res.json({ ok: true, dato: cal, alertas })
  } catch (err) {
    logError('GET /admin/api/calendario/:id', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /:id/mensajes ────────────────────────────────────────────────────────
router.get('/:id/mensajes', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.wts_mensaje_id AS id, m.wts_mensaje_estado AS estado,
             m.wts_mensaje_destino AS destino,
             m.wts_mensaje_fecha_programada AS fecha_programada,
             m.wts_mensaje_fecha_envio AS fecha_envio,
             CONCAT(c.wts_contacto_nombres,' ',c.wts_contacto_apellidos) AS contacto,
             g.wts_grupo_nombre AS grupo_nombre,
             a.wts_calendario_alerta_descripcion AS alerta_desc
      FROM   wts_mensaje m
      LEFT JOIN wts_contacto          c ON c.wts_contacto_id             = m.wts_contacto_id
      LEFT JOIN wts_grupo             g ON g.wts_grupo_jid               = m.wts_mensaje_destino
      LEFT JOIN wts_calendario_alerta a ON a.wts_calendario_alerta_id    = m.wts_calendario_alerta_id
      WHERE  m.wts_calendario_id = $1
      ORDER BY m.wts_mensaje_fecha_programada
    `, [req.params.id])
    res.json({ ok: true, datos: rows })
  } catch (err) {
    logError('GET /admin/api/calendario/:id/mensajes', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST / — crear evento + alertas ─────────────────────────────────────────
router.post('/', async (req, res) => {
  const { titulo, descripcion, fecha_evento, contacto_id, grupo_id,
          destino_libre, plantilla_id, mensaje_texto, repeticion,
          repeticion_fin, alertas, cuenta_id } = req.body || {}

  if (!titulo)       return res.status(400).json({ ok: false, error: 'titulo es requerido' })
  if (!fecha_evento) return res.status(400).json({ ok: false, error: 'fecha_evento es requerido' })
  if (!contacto_id && !grupo_id && !destino_libre)
    return res.status(400).json({ ok: false, error: 'Debe indicar contacto, grupo o número destino' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [{ id }] } = await client.query(`
      INSERT INTO wts_calendario
        (wts_contacto_id, wts_grupo_id, wts_calendario_destino_libre,
         wts_plantilla_id, wts_calendario_titulo, wts_calendario_descripcion,
         wts_calendario_fecha_evento, wts_calendario_estado,
         wts_calendario_mensaje_texto, wts_calendario_repeticion,
         wts_calendario_repeticion_fin, wts_cuenta_id, user_crea, fecha_crea)
      VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12,NOW())
      RETURNING wts_calendario_id AS id
    `, [contacto_id||null, grupo_id||null, destino_libre||null,
        plantilla_id||null, titulo, descripcion||null, fecha_evento,
        mensaje_texto||null, repeticion||0, repeticion_fin||null,
        cuenta_id||1, req.usuario.email])

    if (Array.isArray(alertas)) {
      for (const a of alertas) {
        await client.query(`
          INSERT INTO wts_calendario_alerta
            (wts_calendario_id, wts_calendario_alerta_tipo, wts_calendario_alerta_valor,
             wts_calendario_alerta_descripcion, wts_calendario_alerta_prioridad,
             wts_calendario_alerta_estado, user_crea, fecha_crea)
          VALUES ($1,$2,$3,$4,$5,1,$6,NOW())
        `, [id, a.tipo, a.valor, a.descripcion||null, a.prioridad||2, req.usuario.email])
      }
    }

    await generarMensajes(id, client)

    await client.query('COMMIT')
    res.status(201).json({ ok: true, id })
  } catch (err) {
    await client.query('ROLLBACK')
    logError('POST /admin/api/calendario', err)
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    client.release()
  }
})

// ── PUT /:id — actualizar evento ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { titulo, descripcion, fecha_evento, contacto_id, grupo_id,
          destino_libre, plantilla_id, mensaje_texto, repeticion,
          repeticion_fin, alertas, estado, cuenta_id } = req.body || {}

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Leer estado actual para comparar (fecha como string local, sin conversión de zona horaria)
    const { rows: [actual] } = await client.query(`
      SELECT TO_CHAR(wts_calendario_fecha_evento, 'YYYY-MM-DD"T"HH24:MI') AS fecha_local
      FROM wts_calendario WHERE wts_calendario_id = $1
    `, [req.params.id])
    if (!actual) {
      await client.query('ROLLBACK')
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
    }

    const { rows: alertasActuales } = await client.query(`
      SELECT wts_calendario_alerta_tipo      AS tipo,
             wts_calendario_alerta_valor     AS valor,
             wts_calendario_alerta_prioridad AS prioridad
      FROM wts_calendario_alerta
      WHERE wts_calendario_id = $1 AND wts_calendario_alerta_estado = 1
      ORDER BY wts_calendario_alerta_tipo, wts_calendario_alerta_valor
    `, [req.params.id])

    // Comparar fecha como strings para evitar desfases de zona horaria
    const fechaCambio = !!fecha_evento &&
      actual.fecha_local !== fecha_evento.slice(0, 16)

    // Detectar si las alertas cambiaron
    const normalizar = arr => [...arr].map(a => ({
      tipo: parseInt(a.tipo), valor: String(a.valor), prioridad: parseInt(a.prioridad || 2)
    })).sort((a, b) => a.tipo - b.tipo || a.valor.localeCompare(b.valor))

    const alertasCambiaron = Array.isArray(alertas) &&
      JSON.stringify(normalizar(alertas)) !== JSON.stringify(normalizar(alertasActuales))

    // Actualizar el evento
    await client.query(`
      UPDATE wts_calendario SET
        wts_contacto_id              = $2,
        wts_grupo_id                 = $3,
        wts_calendario_destino_libre = $4,
        wts_plantilla_id             = $5,
        wts_calendario_titulo        = COALESCE($6, wts_calendario_titulo),
        wts_calendario_descripcion   = $7,
        wts_calendario_fecha_evento  = COALESCE($8, wts_calendario_fecha_evento),
        wts_calendario_mensaje_texto = $9,
        wts_calendario_repeticion    = COALESCE($10, wts_calendario_repeticion),
        wts_calendario_repeticion_fin= $11,
        wts_calendario_estado        = COALESCE($12, wts_calendario_estado),
        wts_cuenta_id                = COALESCE($14, wts_cuenta_id),
        user_modifica = $13, fecha_modifica = NOW()
      WHERE wts_calendario_id = $1
    `, [req.params.id,
        contacto_id||null, grupo_id||null, destino_libre||null,
        plantilla_id||null, titulo||null, descripcion||null,
        fecha_evento||null, mensaje_texto||null,
        repeticion!=null ? repeticion : null, repeticion_fin||null,
        estado!=null ? estado : null,
        req.usuario.email, cuenta_id||null])

    if (Array.isArray(alertas) && alertasCambiaron) {
      // Reemplazar alertas
      await client.query(
        'UPDATE wts_mensaje SET wts_calendario_alerta_id = NULL WHERE wts_calendario_id = $1',
        [req.params.id])
      await client.query(
        'DELETE FROM wts_calendario_alerta WHERE wts_calendario_id = $1',
        [req.params.id])
      for (const a of alertas) {
        await client.query(`
          INSERT INTO wts_calendario_alerta
            (wts_calendario_id, wts_calendario_alerta_tipo, wts_calendario_alerta_valor,
             wts_calendario_alerta_descripcion, wts_calendario_alerta_prioridad,
             wts_calendario_alerta_estado, user_crea, fecha_crea)
          VALUES ($1,$2,$3,$4,$5,1,$6,NOW())
        `, [req.params.id, a.tipo, a.valor, a.descripcion||null, a.prioridad||2, req.usuario.email])
      }
    }

    // Regenerar mensajes si cambió fecha, alertas o repetición
    if (fechaCambio || alertasCambiaron) {
      await generarMensajes(parseInt(req.params.id), client)
    }

    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    logError('PUT /admin/api/calendario/:id', err)
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    client.release()
  }
})

// ── DELETE /:id — cancelar evento ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`
      UPDATE wts_calendario SET wts_calendario_estado=2, user_modifica=$2, fecha_modifica=NOW()
      WHERE wts_calendario_id=$1
    `, [req.params.id, req.usuario.email])
    await pool.query(`
      UPDATE wts_mensaje SET wts_mensaje_estado=5, user_modifica='SISTEMA', fecha_modifica=NOW()
      WHERE wts_calendario_id=$1 AND wts_mensaje_estado NOT IN (3,5)
    `, [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    logError('DELETE /admin/api/calendario/:id', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
})


// Lee un parámetro de wts_configuracion.
// Si no existe o está inactivo, devuelve el valor por defecto.
async function obtenerConfig(clave, defecto) {
  const { rows } = await pool.query(`
    SELECT wts_configuracion_valor
    FROM   wts_configuracion
    WHERE  wts_configuracion_clave  = $1
      AND  wts_configuracion_estado = 1
  `, [clave])
  return rows.length ? rows[0].wts_configuracion_valor : defecto
}

// Resuelve el texto final del mensaje.
// Si hay plantilla: la plantilla ES la estructura; reemplaza variables con datos reales.
// Si la plantilla no incluye {{mensaje}}, el campo wts_mensaje_texto no aparece en el envío.
// Si no hay plantilla: usa wts_mensaje_texto o un saludo con el nombre como fallback.
function resolverTexto(plantillaTexto, fila) {
  if (!plantillaTexto) {
    return fila.mensaje?.trim() || `Hola ${fila.nombre?.trim() || ''}`
  }

  const fechaFormateada = fila.fecha_evento
    ? new Date(fila.fecha_evento).toLocaleString('es-EC', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : ''

  return plantillaTexto
    .replace(/\{\{nombre\}\}/g,       fila.nombre       || '')
    .replace(/\{\{celular\}\}/g,      fila.celular       || '')
    .replace(/\{\{mensaje\}\}/g,      fila.mensaje       || '')
    .replace(/\{\{titulo\}\}/g,       fila.titulo        || '')
    .replace(/\{\{fecha_evento\}\}/g, fechaFormateada)
}

// Consulta mensajes pendientes dentro de la ventana de tiempo configurada en BD.
// Hace JOIN con plantilla (si existe) y calendario para tener todas las variables disponibles.
async function obtenerPendientes(cuentaId = 1) {
  const ventana = await obtenerConfig('VENTANA_MINUTOS', process.env.VENTANA_MINUTOS || '15')
  const client  = await pool.connect()

  try {
  await client.query("SET timezone = 'America/Guayaquil'")
  const { rows: [tzRow] } = await client.query("SELECT NOW() AS ahora")
  console.log(`Fecha Hora DB en bot: ${tzRow.ahora} | Rango Envio: ${ventana}`)
  const { rows } = await client.query(`
    SELECT
      m.wts_mensaje_id                AS id,
      m.wts_mensaje_estado            AS estado,
      m.wts_mensaje_destino           AS celular,
      m.wts_mensaje_texto             AS mensaje,
      m.wts_cuenta_id                 AS cuenta_id,
      p.wts_plantilla_texto           AS plantilla_texto,
      concat(c.wts_contacto_nombres, ' ', c.wts_contacto_apellidos) AS nombre,
      cal.wts_calendario_titulo       AS titulo,
      cal.wts_calendario_fecha_evento AS fecha_evento
    FROM public.wts_mensaje m
    LEFT JOIN public.wts_contacto c
        ON c.wts_contacto_id = m.wts_contacto_id
    LEFT JOIN public.wts_plantilla p
        ON p.wts_plantilla_id    = m.wts_plantilla_id
       AND p.wts_plantilla_estado = 1
    LEFT JOIN public.wts_calendario cal
        ON cal.wts_calendario_id = m.wts_calendario_id
    WHERE m.wts_mensaje_estado = 1
      AND COALESCE(m.wts_cuenta_id, 1) = $2
      AND m.wts_mensaje_fecha_programada
          BETWEEN NOW() - ($1 || ' minutes')::INTERVAL AND NOW()
      AND (
        m.wts_contacto_id IS NULL
        OR (c.wts_contacto_permite_whatsapp = 1 AND c.wts_contacto_estado = 1)
      )
    ORDER BY m.wts_mensaje_prioridad        DESC,
             m.wts_mensaje_fecha_programada ASC,
             m.wts_mensaje_id              ASC
  `, [ventana, cuentaId])

  return rows.map(fila => ({
    ...fila,
    textoFinal: resolverTexto(fila.plantilla_texto, fila),
  }))
  } finally {
    client.release()
  }
}

// Registra un cambio de estado en el log de auditoría.
async function registrarLog(id, estadoAnterior, estadoNuevo, descripcion) {
  await pool.query(`
    INSERT INTO wts_mensaje_log (
      wts_mensaje_id,
      wts_mensaje_log_estado_anterior,
      wts_mensaje_log_estado_nuevo,
      wts_mensaje_log_descripcion,
      wts_mensaje_log_fecha,
      user_crea,
      fecha_crea
    ) VALUES ($1, $2, $3, $4, NOW(), 'BOT_WHATSAPP', NOW())
  `, [id, estadoAnterior, estadoNuevo, descripcion])
}

async function marcarEnviado(id) {
  await pool.query(`
    UPDATE wts_mensaje
    SET wts_mensaje_estado      = 3,
        wts_mensaje_fecha_envio = NOW(),
        user_modifica           = 'BOT_WHATSAPP',
        fecha_modifica          = NOW()
    WHERE wts_mensaje_id = $1
  `, [id])
  await registrarLog(id, 1, 3, 'Mensaje enviado correctamente')
}

async function marcarError(id, error) {
  const detalle = error?.message || String(error)
  await pool.query(`
    UPDATE wts_mensaje
    SET wts_mensaje_estado       = 4,
        wts_mensaje_intentos     = wts_mensaje_intentos + 1,
        wts_mensaje_ultimo_error = $2,
        user_modifica            = 'BOT_WHATSAPP',
        fecha_modifica           = NOW()
    WHERE wts_mensaje_id = $1
  `, [id, detalle])
  await registrarLog(id, 1, 4, `Error: ${detalle}`)
}

async function obtenerCuentasActivas() {
  const { rows } = await pool.query(`
    SELECT wts_cuenta_id AS id, wts_cuenta_nombre AS nombre, wts_cuenta_numero AS numero
    FROM wts_cuenta
    WHERE wts_cuenta_estado = 1
    ORDER BY wts_cuenta_id
  `)
  return rows
}

async function guardarMensajeRecibido(cuentaId, { jid, nombre, texto, esGrupo, esYo, marcadoLeido, fechaMensaje }) {
  await pool.query(`
    INSERT INTO wts_mensaje_recibido (
      wts_cuenta_id,
      wts_mensaje_recibido_jid,
      wts_mensaje_recibido_nombre,
      wts_mensaje_recibido_texto,
      wts_mensaje_recibido_es_grupo,
      wts_mensaje_recibido_yo,
      wts_mensaje_recibido_leido,
      wts_mensaje_recibido_fecha,
      user_crea,
      fecha_crea
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BOT_WHATSAPP', NOW())
  `, [
    cuentaId,
    jid,
    nombre       || null,
    texto        || null,
    esGrupo      ? 1 : 0,
    esYo         ? 1 : 0,
    marcadoLeido ? 1 : 0,
    fechaMensaje || new Date(),
  ])
}

module.exports = { pool, obtenerPendientes, marcarEnviado, marcarError, obtenerConfig, obtenerCuentasActivas, guardarMensajeRecibido }

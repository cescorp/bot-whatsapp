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

// ── Watchdog de lectura (estado por cuenta, ver Activar_Consola_Comando.md) ──

async function obtenerEstadoWatchdog(cuentaId) {
  const { rows } = await pool.query(`
    SELECT wts_cuenta_watchdog_activo             AS activo,
           wts_cuenta_watchdog_ultimo_ping         AS ultimo_ping,
           wts_cuenta_watchdog_ultima_confirmacion AS ultima_confirmacion,
           wts_cuenta_watchdog_alerta_enviada      AS alerta_enviada
    FROM wts_cuenta
    WHERE wts_cuenta_id = $1
  `, [cuentaId])
  return rows[0] || null
}

async function actualizarPingWatchdog(cuentaId) {
  await pool.query(`
    UPDATE wts_cuenta
    SET wts_cuenta_watchdog_ultimo_ping    = NOW(),
        wts_cuenta_watchdog_alerta_enviada = 0
    WHERE wts_cuenta_id = $1
  `, [cuentaId])
}

async function confirmarWatchdog(cuentaId) {
  await pool.query(`
    UPDATE wts_cuenta
    SET wts_cuenta_watchdog_ultima_confirmacion = NOW()
    WHERE wts_cuenta_id = $1
  `, [cuentaId])
}

async function marcarAlertaWatchdogEnviada(cuentaId) {
  await pool.query(`
    UPDATE wts_cuenta
    SET wts_cuenta_watchdog_alerta_enviada = 1
    WHERE wts_cuenta_id = $1
  `, [cuentaId])
}

// ── Consola de comandos (ver Activar_Consola_Comando.md) ──────────────────

async function obtenerConsolaActiva(cuentaId) {
  const { rows } = await pool.query(`
    SELECT wts_cuenta_consola_activo AS consola_activo
    FROM wts_cuenta
    WHERE wts_cuenta_id = $1
  `, [cuentaId])
  return rows[0]?.consola_activo === 1
}

// Busca el primer comando activo (de la cuenta o global) cuyos campos clave
// coincidan con alguna de las claves presentes en el mensaje ya parseado.
async function buscarComando(cuentaId, campos) {
  const { rows } = await pool.query(`
    SELECT wts_comando_id           AS id,
           wts_comando_nombre       AS nombre,
           wts_comando_tipo         AS tipo,
           wts_comando_campos_clave AS campos_clave,
           wts_comando_config       AS config,
           wts_comando_respuesta    AS respuesta
    FROM wts_comando
    WHERE wts_comando_estado = 1
      AND (wts_comando_cuenta_id IS NULL OR wts_comando_cuenta_id = $1)
    ORDER BY wts_comando_id
  `, [cuentaId])

  const clavesMensaje = Object.keys(campos)
  return rows.find(c => c.campos_clave.some(clave => clavesMensaje.includes(clave))) || null
}

// Genera los wts_mensaje de un evento de calendario — reemplaza al trigger viejo de BD
// (trg_wts_calendario_alerta_ai/au/ad), que no soporta repetición y quedó en conflicto
// con esta función (el trigger, al disparar DEFERRED en el COMMIT, cancelaba y
// reemplazaba lo que esta función generaba). Único punto de generación de mensajes de
// calendario en todo el sistema — lo usan el panel admin, la API externa y los comandos.
// Requiere `client` con una transacción abierta (BEGIN ya ejecutado por el llamador).
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

  const texto      = cal.wts_calendario_mensaje_texto || `Recordatorio: ${cal.wts_calendario_titulo}`
  const repeticion = parseInt(cal.wts_calendario_repeticion) || 0
  const repFinStr  = cal.wts_calendario_repeticion_fin
  const repFin     = repFinStr ? new Date(repFinStr) : null

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

// Crea un evento de calendario (y su alerta, si aplica) en una sola transacción.
// El destino es el propio número de la cuenta (destino_libre) — el recordatorio
// vuelve al mismo chat "Yo" que lo creó. Genera el wts_mensaje con generarMensajes().
async function crearRecordatorioDesdeComando({ cuentaId, titulo, mensajeTexto, fechaEvento, alerta }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: cuentaRows } = await client.query(
      `SELECT wts_cuenta_numero AS numero FROM wts_cuenta WHERE wts_cuenta_id = $1`, [cuentaId]
    )
    const destinoLibre = cuentaRows[0]?.numero
    if (!destinoLibre) throw new Error(`Cuenta ${cuentaId} sin numero registrado`)

    const { rows } = await client.query(`
      INSERT INTO wts_calendario (
        wts_calendario_titulo, wts_calendario_mensaje_texto,
        wts_calendario_fecha_evento, wts_calendario_destino_libre,
        wts_calendario_estado, user_crea, fecha_crea
      ) VALUES ($1, $2, $3, $4, 1, 'BOT_WHATSAPP', NOW())
      RETURNING wts_calendario_id AS id
    `, [titulo, mensajeTexto || null, fechaEvento, destinoLibre])

    const calendarioId = rows[0].id

    if (alerta) {
      await client.query(`
        INSERT INTO wts_calendario_alerta (
          wts_calendario_id, wts_calendario_alerta_tipo,
          wts_calendario_alerta_valor, wts_calendario_alerta_prioridad,
          wts_calendario_alerta_estado, user_crea, fecha_crea
        ) VALUES ($1, $2, $3, 5, 1, 'BOT_WHATSAPP', NOW())
      `, [calendarioId, alerta.tipo, String(alerta.valor)])
    }

    await generarMensajes(calendarioId, client)

    await client.query('COMMIT')
    return calendarioId
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Traza de mensajes que salen del número (los escribas tú desde el celular, o el bot).
// Es independiente de wts_mensaje_recibido — no incluye el chat "Yo" (ese ya se guarda
// como recibido con wts_mensaje_recibido_yo = 1).
async function guardarMensajeEnviado(cuentaId, { jid, nombre, texto, esGrupo, origen, fechaMensaje }) {
  await pool.query(`
    INSERT INTO wts_mensaje_enviado (
      wts_cuenta_id,
      wts_mensaje_enviado_jid,
      wts_mensaje_enviado_nombre,
      wts_mensaje_enviado_texto,
      wts_mensaje_enviado_es_grupo,
      wts_mensaje_enviado_origen,
      wts_mensaje_enviado_fecha,
      user_crea,
      fecha_crea
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'BOT_WHATSAPP', NOW())
  `, [
    cuentaId,
    jid,
    nombre  || null,
    texto   || null,
    esGrupo ? 1 : 0,
    origen  || 1,
    fechaMensaje || new Date(),
  ])
}

module.exports = {
  pool, obtenerPendientes, marcarEnviado, marcarError, obtenerConfig, obtenerCuentasActivas, guardarMensajeRecibido,
  obtenerEstadoWatchdog, actualizarPingWatchdog, confirmarWatchdog, marcarAlertaWatchdogEnviada,
  obtenerConsolaActiva, buscarComando, crearRecordatorioDesdeComando, guardarMensajeEnviado, generarMensajes,
}

require('dotenv').config()
const { iniciarBot, iniciarCuenta, enviarMensaje, listarGrupos, estaConectado, cuentas } = require('./whatsapp')
const { pool, obtenerPendientes, marcarEnviado, marcarError, obtenerConfig, obtenerCuentasActivas } = require('./db')
const { iniciarAPI } = require('./api/server')
const { enviarAlertaDesconexion } = require('./mailer')
const logger = require('./logger')

// Contador de ciclos sin conexión por cuenta  Map<cuentaId, number>
const ciclosSinConexion = new Map()

async function procesarPendientes() {
  // Obtener cuentas activas desde BD
  let cuentasActivas
  try {
    cuentasActivas = await obtenerCuentasActivas()
  } catch (err) {
    logger.error({ err }, 'Error leyendo cuentas activas')
    return
  }

  // Leer umbral de alerta (compartido para todas las cuentas)
  const { rows: umbralRows } = await pool.query(
    `SELECT sis_parametros_valor FROM sis_parametros WHERE sis_parametros_nombre = 'ALERTA_DESCONEXION_CICLOS'`
  ).catch(() => ({ rows: [] }))
  const umbral = parseInt(umbralRows[0]?.sis_parametros_valor ?? '3')

  for (const cuenta of cuentasActivas) {
    const { id: cuentaId, nombre } = cuenta

    if (!estaConectado(cuentaId)) {
      const ciclos = (ciclosSinConexion.get(cuentaId) ?? 0) + 1
      ciclosSinConexion.set(cuentaId, ciclos)
      logger.warn(`[Cuenta ${cuentaId} — ${nombre}] Sin conexión — ciclo ${ciclos}`)

      if (ciclos >= umbral) {
        await enviarAlertaDesconexion(nombre)
        ciclosSinConexion.set(cuentaId, 0)
      }
      continue
    }

    ciclosSinConexion.set(cuentaId, 0)

    let pendientes
    try {
      pendientes = await obtenerPendientes(cuentaId)
    } catch (err) {
      logger.error({ err, cuentaId }, 'Error consultando la BD')
      continue
    }

    if (pendientes.length === 0) {
      logger.info(`[Cuenta ${cuentaId}] Sin mensajes pendientes`)
      continue
    }

    logger.info(`[Cuenta ${cuentaId}] Procesando ${pendientes.length} mensaje(s)`)

    for (const fila of pendientes) {
      try {
        await enviarMensaje(cuentaId, fila.celular, fila.textoFinal)
        await marcarEnviado(fila.id)
        logger.info({ id: fila.id, celular: fila.celular, cuentaId }, 'Enviado OK')
      } catch (err) {
        await marcarError(fila.id, err)
        logger.error({ id: fila.id, err, cuentaId }, 'Error al enviar')
      }
    }
  }
}

async function scheduler() {
  await procesarPendientes()

  const minutos = parseInt(
    await obtenerConfig('INTERVALO_MINUTOS', process.env.INTERVALO_MINUTOS || '1')
  )
  logger.info(`Próximo ciclo en ${minutos} minuto(s)`)
  setTimeout(scheduler, minutos * 60 * 1000)
}

async function main() {
  if (process.argv.includes('--listar-grupos')) {
    await iniciarBot()
    await new Promise(resolve => setTimeout(resolve, 6000))
    await listarGrupos(1)
    process.exit(0)
  }

  iniciarAPI()

  // Iniciar todas las cuentas activas en BD
  const cuentasActivas = await obtenerCuentasActivas()
  for (const { id, nombre } of cuentasActivas) {
    await iniciarCuenta(id, nombre)
  }

  await new Promise(resolve => setTimeout(resolve, 5000))
  scheduler()
}

main()

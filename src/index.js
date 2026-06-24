require('dotenv').config()
const { iniciarBot, enviarMensaje, listarGrupos, estaConectado } = require('./whatsapp')
const { obtenerPendientes, marcarEnviado, marcarError, obtenerConfig } = require('./db')
const { iniciarAPI } = require('./api/server')
const logger = require('./logger')

async function procesarPendientes() {
  if (!estaConectado()) {
    logger.warn('WhatsApp no conectado — omitiendo ciclo')
    return
  }

  let pendientes
  try {
    pendientes = await obtenerPendientes()
  } catch (err) {
    logger.error({ err }, 'Error consultando la BD')
    return
  }

  if (pendientes.length === 0) {
    logger.info('Sin mensajes pendientes')
    return
  }

  logger.info(`Procesando ${pendientes.length} mensaje(s)`)

  for (const fila of pendientes) {
    try {
      await enviarMensaje(fila.celular, fila.textoFinal)
      await marcarEnviado(fila.id)
      logger.info({ id: fila.id, celular: fila.celular }, 'Enviado OK')
    } catch (err) {
      await marcarError(fila.id, err)
      logger.error({ id: fila.id, err }, 'Error al enviar')
    }
  }
}

// Scheduler dinámico: lee INTERVALO_MINUTOS desde BD en cada ciclo.
// Cambiar el valor en wts_configuracion se aplica en el siguiente ciclo sin reiniciar.
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
    await listarGrupos()
    process.exit(0)
  }

  iniciarAPI()
  await iniciarBot()
  await new Promise(resolve => setTimeout(resolve, 5000))
  scheduler()
}

main()

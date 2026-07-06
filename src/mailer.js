const nodemailer = require('nodemailer')
const { pool }   = require('./db')
const logger     = require('./logger')

async function obtenerParametro(nombre) {
  const { rows } = await pool.query(
    `SELECT sis_parametros_valor FROM sis_parametros WHERE sis_parametros_nombre = $1`,
    [nombre]
  )
  return rows[0]?.sis_parametros_valor ?? null
}

async function enviarAlertaDesconexion(nombreCuenta = 'Principal') {
  try {
    const habilitado   = await obtenerParametro('ALERTA_EMAIL_HABILITADO')
    if (habilitado !== '1') return

    const destinatario = await obtenerParametro('ALERTA_EMAIL_DESTINATARIO')
    if (!destinatario) {
      logger.warn('ALERTA_EMAIL_DESTINATARIO no configurado — no se envía correo')
      return
    }

    const transporter = nodemailer.createTransport({
      host:   process.env.MAIL_HOST,
      port:   parseInt(process.env.MAIL_PORT || '587'),
      secure: process.env.MAIL_PORT === '465',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    })

    const ahora = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })

    await transporter.sendMail({
      from:    `"${process.env.MAIL_FROM_NAME || 'Bot WhatsApp'}" <${process.env.MAIL_USER}>`,
      to:      destinatario,
      subject: '⚠️ Bot WhatsApp — Sesión desconectada',
      text: [
        `Se detectó que la cuenta "${nombreCuenta}" lleva varios ciclos sin conexión.`,
        ``,
        `Fecha y hora: ${ahora}`,
        ``,
        `Acciones recomendadas:`,
        `  1. Abre el panel admin y escanea el QR en /admin`,
        `  2. Verifica que el contenedor Docker esté corriendo`,
        `  3. Revisa los logs: docker logs bot-whatsapp`,
      ].join('\n'),
    })

    logger.info({ destinatario }, 'Alerta de desconexión enviada por correo')
  } catch (err) {
    logger.error({ err }, 'Error al enviar alerta de desconexión por correo')
  }
}

async function enviarAlertaWatchdog(nombreCuenta, minutosSinConfirmar) {
  try {
    const habilitado   = await obtenerParametro('ALERTA_EMAIL_HABILITADO')
    if (habilitado !== '1') return

    const destinatario = await obtenerParametro('ALERTA_EMAIL_DESTINATARIO')
    if (!destinatario) {
      logger.warn('ALERTA_EMAIL_DESTINATARIO no configurado — no se envía correo')
      return
    }

    const transporter = nodemailer.createTransport({
      host:   process.env.MAIL_HOST,
      port:   parseInt(process.env.MAIL_PORT || '587'),
      secure: process.env.MAIL_PORT === '465',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    })

    const ahora = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })

    await transporter.sendMail({
      from:    `"${process.env.MAIL_FROM_NAME || 'Bot WhatsApp'}" <${process.env.MAIL_USER}>`,
      to:      destinatario,
      subject: '⚠️ Bot WhatsApp — Lectura de mensajes sin confirmar',
      text: [
        `La cuenta "${nombreCuenta}" no ha podido confirmar la lectura de mensajes desde hace ${minutosSinConfirmar} minutos.`,
        ``,
        `Fecha y hora: ${ahora}`,
        ``,
        `Esto puede indicar que Baileys dejó de procesar mensajes entrantes aunque la cuenta siga "conectada".`,
        `Ver manual_tecnico.md (seccion 6) y Activar_Consola_Comando.md.`,
        ``,
        `Acciones recomendadas:`,
        `  1. Revisa los logs: docker logs bot-whatsapp`,
        `  2. Si el problema persiste, reinicia el bot: docker compose restart`,
      ].join('\n'),
    })

    logger.info({ destinatario, nombreCuenta }, 'Alerta de watchdog enviada por correo')
  } catch (err) {
    logger.error({ err }, 'Error al enviar alerta de watchdog por correo')
  }
}

module.exports = { enviarAlertaDesconexion, enviarAlertaWatchdog }

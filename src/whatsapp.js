const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const QRCode = require('qrcode')
const pino   = require('pino')
const path   = require('path')
const fs     = require('fs')
const logger = require('./logger')
const { obtenerConfig, guardarMensajeRecibido, confirmarWatchdog, obtenerConsolaActiva, guardarMensajeEnviado } = require('./db')
const { procesarComando } = require('./comandos')

const AUTH_BASE   = path.join(__dirname, 'auth')
const GRUPOS_FILE = path.join('/app', 'grupos.txt')

// Map<cuentaId, { sock, conectado, nombre }>
const cuentas = new Map()

function authDir(cuentaId) {
  return path.join(AUTH_BASE, `cuenta-${cuentaId}`)
}

function qrFile(cuentaId) {
  return path.join(authDir(cuentaId), 'qr.png')
}

async function iniciarCuenta(cuentaId, nombre) {
  const dir = authDir(cuentaId)
  fs.mkdirSync(dir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(dir)
  const { version }          = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth:   state,
    logger: pino({ level: 'info' }),
    printQRInTerminal: false,
    getMessage: async () => ({ conversation: '' }),
  })

  // idsBot: ids de mensajes enviados por enviarMensaje() (bot), para distinguirlos
  // de los que tú escribes directo desde el celular cuando llega su eco
  cuentas.set(cuentaId, { sock, conectado: false, nombre, idsBot: new Set() })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      QRCode.toFile(qrFile(cuentaId), qr, { width: 400 }, (err) => {
        if (err) logger.error({ err, cuentaId }, 'Error generando qr.png')
        else logger.info(`[Cuenta ${cuentaId}] QR guardado en: ${qrFile(cuentaId)}`)
      })
    }

    if (connection === 'open') {
      cuentas.get(cuentaId).conectado = true
      logger.info(`[Cuenta ${cuentaId} — ${nombre}] WhatsApp conectado`)
    }

    if (connection === 'close') {
      cuentas.get(cuentaId).conectado = false
      const codigo     = lastDisconnect?.error?.output?.statusCode
      const reconectar = codigo !== DisconnectReason.loggedOut

      logger.warn({ codigo, cuentaId }, reconectar
        ? `[Cuenta ${cuentaId}] Desconectado — reconectando...`
        : `[Cuenta ${cuentaId}] Sesión cerrada — escanea QR de nuevo`)

      if (reconectar) setTimeout(() => iniciarCuenta(cuentaId, nombre), 5000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    logger.info({ type, count: messages.length, cuentaId }, 'messages.upsert recibido')

    // El eco de un mensaje que el propio bot envía al chat "Yo" (ping del watchdog,
    // respuestas de comandos, recordatorios) llega con type 'append', no 'notify' —
    // por eso la confirmación del watchdog se revisa ANTES del filtro de tipo de abajo.
    const me        = sock.authState.creds.me
    const propioJid = me?.id  ? jidNormalizedUser(me.id)  : null
    const propioLid = me?.lid ? jidNormalizedUser(me.lid) : null

    for (const message of messages) {
      const jid = message.key.remoteJid
      const esSelfChat = jid === propioJid || (propioLid && jid === propioLid)

      if (esSelfChat) {
        const textoRapido = message.message?.conversation || message.message?.extendedTextMessage?.text
        if (textoRapido?.startsWith('PING_WATCHDOG_')) {
          await confirmarWatchdog(cuentaId).catch(err => logger.error({ err, cuentaId }, 'Error confirmando watchdog'))
        }
        continue
      }

      // Traza completa de WhatsApp — mensajes que salen del número hacia otros
      // chats/grupos (los escribas tú desde el celular, o el bot). El chat "Yo"
      // ya se guarda aparte como recibido (wts_mensaje_recibido_yo = 1).
      if (message.key.fromMe && message.message && jid !== 'status@broadcast') {
        const idsBot   = cuentas.get(cuentaId)?.idsBot
        const esDelBot = idsBot?.has(message.key.id) ?? false
        if (esDelBot) idsBot.delete(message.key.id)   // limpieza, ya cumplió su propósito

        const texto =
          message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          message.message.imageMessage?.caption ||
          message.message.videoMessage?.caption ||
          null

        await guardarMensajeEnviado(cuentaId, {
          jid,
          nombre: message.pushName || null,
          texto,
          esGrupo: jid.endsWith('@g.us'),
          origen: esDelBot ? 2 : 1,   // 1=Celular (tú), 2=Bot (scheduler/API/panel)
          fechaMensaje: message.messageTimestamp ? new Date(Number(message.messageTimestamp) * 1000) : new Date(),
        }).catch(err => logger.error({ err, cuentaId }, 'Error guardando mensaje enviado'))
      }
    }

    if (type !== 'notify') return

    const leer = await obtenerConfig('LEER_MENSAJES', 'NO')
    if (leer !== 'SI') return

    const marcarLeido = await obtenerConfig('LEER_MENSAJES_MARCAR_LEIDO', 'NO')

    for (const message of messages) {
      try {
        const jid = message.key.remoteJid

        // Propio número/LID de la sesión — se recalcula porque Baileys los va
        // completando después de conectar (creds.me.lid llega tras el primer mensaje)
        const me = sock.authState.creds.me
        const propioJid = me?.id  ? jidNormalizedUser(me.id)  : null
        const propioLid = me?.lid ? jidNormalizedUser(me.lid) : null
        const esSelfChat = jid === propioJid || (propioLid && jid === propioLid)

        // Se ignoran los ecos de mensajes salientes, excepto el chat "Yo" (self-chat)
        if (message.key.fromMe && !esSelfChat) continue
        if (jid === 'status@broadcast') continue
        if (!message.message)   continue

        const texto =
          message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          message.message.imageMessage?.caption ||
          message.message.videoMessage?.caption ||
          null

        // Nota: la confirmación del PING_WATCHDOG_ ya se maneja arriba, antes del
        // filtro de 'type', porque ese eco llega como 'append' y nunca llegaría aquí.

        // Consola de comandos — solo en el chat "Yo" y si está activa para esta cuenta
        if (esSelfChat && texto && await obtenerConsolaActiva(cuentaId)) {
          const respuesta = await procesarComando(cuentaId, texto)
          if (respuesta) {
            await sock.sendMessage(jid, { text: respuesta })
            logger.info({ cuentaId }, 'Comando ejecutado desde consola Yo')
            continue
          }
        }

        const nombre = message.pushName || null
        const esGrupo    = jid.endsWith('@g.us')
        const fechaMensaje = message.messageTimestamp
          ? new Date(Number(message.messageTimestamp) * 1000)
          : new Date()

        await guardarMensajeRecibido(cuentaId, {
          jid, nombre, texto, esGrupo,
          esYo: esSelfChat,
          marcadoLeido: marcarLeido === 'SI',
          fechaMensaje,
        })

        logger.info({ jid, cuentaId, esGrupo, esSelfChat }, 'Mensaje recibido guardado')

        if (marcarLeido === 'SI') {
          await sock.readMessages([message.key])
        }
      } catch (err) {
        logger.error({ err, cuentaId }, 'Error procesando mensaje recibido')
      }
    }
  })
}

// Mantiene compatibilidad con el arranque original (cuenta 1 = Principal)
async function iniciarBot() {
  await iniciarCuenta(1, 'Principal')
}

async function enviarMensaje(cuentaId, destino, texto) {
  const cuenta = cuentas.get(cuentaId)
  if (!cuenta?.conectado) throw new Error(`Cuenta ${cuentaId} no conectada`)

  const jid = destino.includes('@')
    ? destino
    : destino.replace(/\D/g, '') + '@s.whatsapp.net'

  // Verificar que el número existe en WhatsApp antes de enviar
  // Esto fuerza el intercambio de claves Signal y evita "Esperando el mensaje"
  if (jid.endsWith('@s.whatsapp.net')) {
    const [result] = await cuenta.sock.onWhatsApp(jid)
    if (!result?.exists) throw new Error(`El número ${jid} no está registrado en WhatsApp`)
  }

  const enviado = await cuenta.sock.sendMessage(jid, { text: texto })
  if (enviado?.key?.id) cuenta.idsBot.add(enviado.key.id)
}

async function listarGrupos(cuentaId = 1) {
  const cuenta = cuentas.get(cuentaId)
  if (!cuenta?.conectado) throw new Error(`Cuenta ${cuentaId} no conectada`)

  const grupos = await cuenta.sock.groupFetchAllParticipating()
  const lista  = Object.values(grupos).map(g => ({ id: g.id, nombre: g.subject }))
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre))

  const fecha     = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const lineas    = lista.map(g => `${g.nombre.padEnd(40)} ${g.id}`)
  const contenido = [
    `Actualizado: ${fecha}`,
    `Total: ${lista.length} grupo(s)`,
    '─'.repeat(60),
    ...lineas,
  ].join('\n')

  fs.writeFileSync(GRUPOS_FILE, contenido, 'utf8')
  logger.info(`grupos.txt actualizado con ${lista.length} grupo(s)`)

  return lista
}

function estaConectado(cuentaId = 1) {
  return cuentas.get(cuentaId)?.conectado ?? false
}

module.exports = { iniciarBot, iniciarCuenta, enviarMensaje, listarGrupos, estaConectado, cuentas }

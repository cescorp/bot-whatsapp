const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys')
const qrcode        = require('qrcode-terminal')
const QRCode        = require('qrcode')
const pino          = require('pino')
const path          = require('path')
const fs            = require('fs')
const logger        = require('./logger')

const AUTH_DIR    = path.join(__dirname, 'auth')
const GRUPOS_FILE = path.join('/app', 'grupos.txt')
const QR_FILE     = path.join(AUTH_DIR, 'qr.png')
let   sock     = null
let   conectado = false

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version }          = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth:   state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      // Guarda el QR como imagen PNG en src/auth/qr.png (accesible desde Windows)
      QRCode.toFile(QR_FILE, qr, { width: 400 }, (err) => {
        if (err) logger.error({ err }, 'Error generando qr.png')
        else logger.info(`QR guardado en: ${QR_FILE} — ábrelo en Windows para escanearlo`)
      })
    }

    if (connection === 'open') {
      conectado = true
      logger.info('WhatsApp conectado')
    }

    if (connection === 'close') {
      conectado = false
      const codigo = lastDisconnect?.error?.output?.statusCode
      const reconectar = codigo !== DisconnectReason.loggedOut

      logger.warn({ codigo }, reconectar
        ? 'Desconectado — reconectando...'
        : 'Sesión cerrada — escanea QR de nuevo')

      if (reconectar) setTimeout(iniciarBot, 5000)
    }
  })
}

async function enviarMensaje(destino, texto) {
  // Si ya tiene sufijo (@s.whatsapp.net o @g.us) lo usa directo
  // Si no, asume número personal y agrega @s.whatsapp.net
  const jid = destino.includes('@')
    ? destino
    : destino.replace(/\D/g, '') + '@s.whatsapp.net'

  await sock.sendMessage(jid, { text: texto })
}

async function listarGrupos() {
  const grupos = await sock.groupFetchAllParticipating()
  const lista  = Object.values(grupos).map(g => ({
    id:     g.id,
    nombre: g.subject,
  }))
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

function estaConectado() {
  return conectado
}

module.exports = { iniciarBot, enviarMensaje, listarGrupos, estaConectado }

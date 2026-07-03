const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const QRCode = require('qrcode')
const pino   = require('pino')
const path   = require('path')
const fs     = require('fs')
const logger = require('./logger')

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
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  })

  cuentas.set(cuentaId, { sock, conectado: false, nombre })

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

  await cuenta.sock.sendMessage(jid, { text: texto })
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

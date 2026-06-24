const fs   = require('fs')
const path = require('path')

const LOG_DIR = path.join('/app', 'log_errores')

function logError(contexto, err) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
    const fecha   = new Date().toISOString().slice(0, 10)
    const archivo = path.join(LOG_DIR, `error_${fecha}.log`)
    const ts      = new Date().toISOString()
    const detalle = err?.stack || String(err)
    fs.appendFileSync(archivo, `[${ts}] ${contexto}\n${detalle}\n${'─'.repeat(60)}\n`, 'utf8')
  } catch (_) {
    // si falla el log no interrumpimos la respuesta
  }
}

module.exports = { logError }

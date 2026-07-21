const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn, spawnSync, execFile } = require('child_process')
const { URL } = require('url')

// Carga simple de variables desde .env (mismo directorio), sin dependencias externas
function cargarEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return
  const contenido = fs.readFileSync(envPath, 'utf8')
  for (const linea of contenido.split(/\r?\n/)) {
    const m = linea.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
cargarEnv()

const PUERTO = process.env.VPN_AGENT_PORT || 5905
const TOKEN = process.env.VPN_AGENT_TOKEN
const PS1_WATCHDOG = 'C:\\VPNA.ps1'
const PS1_ONCE = path.join(__dirname, 'vpn-once.ps1')
const VPN_NOMBRE = 'NORTE' // debe coincidir con $VpnName dentro de VPNA.ps1 / vpn-once.ps1
const PROCESOS_FILE = path.join(__dirname, 'procesos.json')

if (!TOKEN) {
  console.error('Falta VPN_AGENT_TOKEN en scripts/agentes-host/.env — el agente no arranca sin token')
  process.exit(1)
}

// ── Catálogo de procesos que el agente sabe manejar — whitelist fija, nunca
// comandos arbitrarios recibidos por HTTP. Agregar más entradas acá para nuevos
// tipos de acciones de host (no solo VPN).
const DEFINICIONES = {
  vpn: {
    // modo=consola: watchdog perpetuo (C:\VPNA.ps1, bucle infinito) en ventana visible.
    // No se espera a que termine — nunca termina solo, hay que "terminar"lo a mano.
    iniciarPersistente() {
      return spawn('powershell.exe', [
        '-ExecutionPolicy', 'Bypass', '-NoProfile', '-WindowStyle', 'Normal', '-File', PS1_WATCHDOG
      ], {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      })
    },
    // modo=sinconsola: un solo intento (vpn-once.ps1) — sí se espera el resultado real.
    conectarUnaVez(callback) {
      execFile('powershell.exe', [
        '-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', PS1_ONCE
      ], { cwd: __dirname, timeout: 20000, windowsHide: true }, callback)
    },
    // Matar el watchdog no desconecta la VPN (rasdial vive a nivel del SO, no del
    // proceso que la disparó) — sin esto "terminar" dejaría la VPN conectada y sin nadie
    // vigilándola.
    alTerminar() {
      spawnSync('rasdial', [VPN_NOMBRE, '/disconnect'])
    }
  }
}

// ── Registro de procesos persistentes vivos — varios a la vez, por nombre ─────
// (solo aplica al modo consola; el modo sinconsola no deja nada corriendo)
function leerProcesos() {
  if (!fs.existsSync(PROCESOS_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(PROCESOS_FILE, 'utf8')) } catch { return {} }
}
function guardarProcesos(obj) {
  fs.writeFileSync(PROCESOS_FILE, JSON.stringify(obj, null, 2))
}
function procesoActivo(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}
function estadoProceso(nombre) {
  const procesos = leerProcesos()
  const info = procesos[nombre]
  if (!info) return null
  if (!procesoActivo(info.pid)) {
    delete procesos[nombre]
    guardarProcesos(procesos)
    return null
  }
  return info
}
function registrarProceso(nombre, pid, modo) {
  const procesos = leerProcesos()
  procesos[nombre] = { pid, modo, iniciado: new Date().toISOString() }
  guardarProcesos(procesos)
}
function borrarProceso(nombre) {
  const procesos = leerProcesos()
  delete procesos[nombre]
  guardarProcesos(procesos)
}

function responder(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

http.createServer((req, res) => {
  if (req.headers['x-agent-token'] !== TOKEN) {
    return responder(res, 401, { ok: false, mensaje: 'token invalido' })
  }

  const { pathname, searchParams } = new URL(req.url, `http://localhost:${PUERTO}`)
  const nombre = searchParams.get('nombre')
  const definicion = nombre && DEFINICIONES[nombre]

  if (req.method === 'POST' && pathname === '/proceso/iniciar') {
    if (!definicion) return responder(res, 400, { ok: false, mensaje: `proceso "${nombre}" desconocido` })
    const modo = searchParams.get('modo') === 'consola' ? 'consola' : 'sinconsola'

    if (modo === 'sinconsola') {
      // Espera el resultado real — no queda nada corriendo de fondo, no hay PID que rastrear.
      definicion.conectarUnaVez((err, stdout, stderr) => {
        if (err) return responder(res, 200, { ok: false, mensaje: `error: ${(stdout || stderr || err.message).toString().trim()}` })
        return responder(res, 200, { ok: true, mensaje: (stdout || '').toString().trim() || 'VPN conectada' })
      })
      return
    }

    // modo=consola: fire-and-forget, queda corriendo para siempre hasta "terminar".
    const existente = estadoProceso(nombre)
    if (existente) return responder(res, 200, { ok: false, mensaje: `"${nombre}" ya en ejecución (PID ${existente.pid})` })
    try {
      const child = definicion.iniciarPersistente()
      child.on('error', (err) => console.log(`[${nombre}] error de spawn: ${err.message}`))
      child.unref()
      registrarProceso(nombre, child.pid, modo)
      return responder(res, 200, { ok: true, mensaje: `"${nombre}" iniciado en modo consola (PID ${child.pid})` })
    } catch (err) {
      return responder(res, 200, { ok: false, mensaje: `error: ${err.message}` })
    }
  }

  if (req.method === 'GET' && pathname === '/proceso/estado') {
    if (!definicion) return responder(res, 400, { ok: false, mensaje: `proceso "${nombre}" desconocido` })
    const info = estadoProceso(nombre)
    return responder(res, 200, info
      ? { ok: true, corriendo: true, pid: info.pid, modo: info.modo, iniciado: info.iniciado }
      : { ok: true, corriendo: false })
  }

  if (req.method === 'POST' && pathname === '/proceso/terminar') {
    if (!definicion) return responder(res, 400, { ok: false, mensaje: `proceso "${nombre}" desconocido` })
    const info = estadoProceso(nombre)
    if (!info) return responder(res, 200, { ok: false, mensaje: `"${nombre}" no está en ejecución` })
    try { process.kill(info.pid) } catch { /* puede que ya no exista */ }
    if (definicion.alTerminar) definicion.alTerminar()
    borrarProceso(nombre)
    return responder(res, 200, { ok: true, mensaje: `"${nombre}" (PID ${info.pid}) terminado` })
  }

  res.writeHead(404)
  res.end()
}).listen(PUERTO, () => console.log(`Agente de host escuchando en :${PUERTO}`))

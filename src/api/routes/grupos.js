const { Router } = require('express')
const { listarGrupos, estaConectado } = require('../../whatsapp')
const path = require('path')
const fs   = require('fs')

const router     = Router()
const GRUPOS_FILE = path.join('/app', 'grupos.txt')

// GET /grupos — devuelve lista de grupos WhatsApp
// Si el bot está conectado refresca el archivo primero.
// Si no está conectado devuelve el último archivo guardado.
router.get('/', async (req, res) => {
  try {
    if (estaConectado()) {
      await listarGrupos()
    }

    if (!fs.existsSync(GRUPOS_FILE)) {
      return res.status(503).json({ ok: false, error: 'Bot desconectado y sin caché de grupos' })
    }

    const contenido = fs.readFileSync(GRUPOS_FILE, 'utf8')
    const lineas    = contenido.split('\n').slice(3) // salta encabezado

    const grupos = lineas
      .filter(l => l.trim())
      .map(l => {
        const partes = l.trim().split(/\s+/)
        const id     = partes[partes.length - 1]
        const nombre = partes.slice(0, -1).join(' ').trim()
        return { nombre, id }
      })

    res.json({ ok: true, total: grupos.length, grupos })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

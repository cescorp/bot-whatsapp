const express      = require('express')
const path         = require('path')
const { verificarJWT } = require('./middleware/jwt')
const { logError } = require('./logger-errores')

const router = express.Router()
const NM = path.join(__dirname, '../../../node_modules')

// Archivos estáticos del panel (HTML, CSS, JS propios)
router.use(express.static(path.join(__dirname, '..')))

// AdminLTE dist (CSS + JS compilados)
router.use('/adminlte', express.static(path.join(NM, 'admin-lte/dist')))

// Plugins mapeados desde node_modules individuales
router.use('/plugins/jquery',                    express.static(path.join(NM, 'jquery/dist')))
router.use('/plugins/popper',                    express.static(path.join(NM, 'popper.js/dist/umd')))
router.use('/plugins/bootstrap/js',              express.static(path.join(NM, 'bootstrap/dist/js')))
router.use('/plugins/bootstrap/css',             express.static(path.join(NM, 'bootstrap/dist/css')))
router.use('/plugins/chart.js',                  express.static(path.join(NM, 'chart.js/dist')))
router.use('/plugins/datatables',                express.static(path.join(NM, 'datatables.net/js')))
router.use('/plugins/datatables-bs4/js',         express.static(path.join(NM, 'datatables.net-bs4/js')))
router.use('/plugins/datatables-bs4/css',        express.static(path.join(NM, 'datatables.net-bs4/css')))
router.use('/plugins/fontawesome-free/css',      express.static(path.join(NM, '@fortawesome/fontawesome-free/css')))
router.use('/plugins/fontawesome-free/webfonts', express.static(path.join(NM, '@fortawesome/fontawesome-free/webfonts')))

// Body parsing para las rutas API (5mb para soportar importación de contactos)
router.use('/api', express.json({ limit: '5mb' }))

// Endpoint para registrar errores del frontend en el log de archivos
router.post('/api/log-error', (req, res) => {
  const { contexto, mensaje } = req.body || {}
  if (contexto && mensaje) logError(`[FRONTEND] ${contexto}`, new Error(mensaje))
  res.json({ ok: true })
})

// Rutas API del admin
router.use('/api/auth',       require('./rutas/auth'))
router.use('/api/dashboard',  verificarJWT, require('./rutas/dashboard'))
router.use('/api/contactos',  verificarJWT, require('./rutas/contactos'))
router.use('/api/mensajes',   verificarJWT, require('./rutas/mensajes'))
router.use('/api/plantillas', verificarJWT, require('./rutas/plantillas'))
router.use('/api/calendario', verificarJWT, require('./rutas/calendario'))
router.use('/api/reportes',   verificarJWT, require('./rutas/reportes'))
router.use('/api/grupos',     verificarJWT, require('./rutas/grupos'))
router.use('/api/cuentas',         verificarJWT, require('./rutas/cuentas'))
router.use('/api/mensaje-directo', verificarJWT, require('./rutas/mensajeDirecto'))

router.get('/', (req, res) => res.sendFile(path.join(__dirname, '../login.html')))

module.exports = router

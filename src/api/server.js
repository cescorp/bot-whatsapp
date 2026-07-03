const express  = require('express')
const path     = require('path')
const logger   = require('../logger')
const { apiKey } = require('./middleware/auth')

const app = express()
app.use(express.json())

// Panel administrativo
app.use('/admin', require('../admin/servidor/index'))

// Rutas — todas protegidas con API key
app.use('/estado',     apiKey, require('./routes/estado'))
app.use('/mensajes',   apiKey, require('./routes/mensajes'))
app.use('/contactos',  apiKey, require('./routes/contactos'))
app.use('/plantillas', apiKey, require('./routes/plantillas'))
app.use('/calendario', apiKey, require('./routes/calendario'))
app.use('/grupos',          apiKey, require('./routes/grupos'))
app.use('/mensaje-directo', apiKey, require('./routes/mensajeDirecto'))

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Ruta ${req.method} ${req.path} no existe` })
})

function iniciarAPI() {
  const puerto = parseInt(process.env.PORT) || 3000
  app.listen(puerto, '0.0.0.0', () => {
    logger.info(`API REST escuchando en puerto ${puerto}`)
  })
}

module.exports = { iniciarAPI }

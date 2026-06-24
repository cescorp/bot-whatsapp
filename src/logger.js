const pino = require('pino')

module.exports = pino({
  level: 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 1 },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

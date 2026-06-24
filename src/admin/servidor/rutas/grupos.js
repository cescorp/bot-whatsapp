const { Router }    = require('express')
const { pool }      = require('../../../db')
const { listarGrupos, estaConectado } = require('../../../whatsapp')
const { logError }  = require('../logger-errores')

const router = Router()

async function sincronizar() {
  const lista = await listarGrupos()
  await pool.query('UPDATE wts_grupo SET wts_grupo_estado = 0')
  for (const g of lista) {
    await pool.query(`
      INSERT INTO wts_grupo (wts_grupo_jid, wts_grupo_nombre, wts_grupo_estado, fecha_crea)
      VALUES ($1, $2, 1, NOW())
      ON CONFLICT (wts_grupo_jid) DO UPDATE
        SET wts_grupo_nombre = $2, wts_grupo_estado = 1, fecha_modifica = NOW()
    `, [g.id, g.nombre])
  }
  return lista.length
}

// GET / — sincroniza si bot conectado, devuelve grupos activos de BD
router.get('/', async (req, res) => {
  try {
    if (estaConectado()) await sincronizar()
    const { rows } = await pool.query(`
      SELECT wts_grupo_id AS id, wts_grupo_jid AS jid, wts_grupo_nombre AS nombre
      FROM wts_grupo WHERE wts_grupo_estado = 1 ORDER BY wts_grupo_nombre
    `)
    res.json({ ok: true, datos: rows })
  } catch (err) {
    logError('GET /admin/api/grupos', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /sync — sincronización manual desde el panel
router.post('/sync', async (req, res) => {
  try {
    if (!estaConectado()) return res.status(503).json({ ok: false, error: 'Bot no conectado' })
    const total = await sincronizar()
    res.json({ ok: true, total })
  } catch (err) {
    logError('POST /admin/api/grupos/sync', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

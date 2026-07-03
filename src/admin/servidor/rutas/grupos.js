const { Router }    = require('express')
const { pool }      = require('../../../db')
const { listarGrupos, estaConectado } = require('../../../whatsapp')
const { logError }  = require('../logger-errores')

const router = Router()

async function sincronizar(cuenta_id = 1) {
  const lista = await listarGrupos(cuenta_id)
  await pool.query('UPDATE wts_grupo SET wts_grupo_estado = 0 WHERE COALESCE(wts_cuenta_id, 1) = $1', [cuenta_id])
  for (const g of lista) {
    await pool.query(`
      INSERT INTO wts_grupo (wts_grupo_jid, wts_grupo_nombre, wts_grupo_estado, wts_cuenta_id, fecha_crea)
      VALUES ($1, $2, 1, $3, NOW())
      ON CONFLICT (wts_grupo_jid) DO UPDATE
        SET wts_grupo_nombre = $2, wts_grupo_estado = 1, wts_cuenta_id = $3, fecha_modifica = NOW()
    `, [g.id, g.nombre, cuenta_id])
  }
  return lista.length
}

// GET /?cuenta_id=1 — sincroniza si bot conectado, devuelve grupos filtrados por cuenta
router.get('/', async (req, res) => {
  const cuenta_id = parseInt(req.query.cuenta_id || '1')
  try {
    if (estaConectado(cuenta_id)) await sincronizar(cuenta_id)
    const { rows } = await pool.query(`
      SELECT wts_grupo_id AS id, wts_grupo_jid AS jid, wts_grupo_nombre AS nombre
      FROM wts_grupo
      WHERE wts_grupo_estado = 1
        AND COALESCE(wts_cuenta_id, 1) = $1
      ORDER BY wts_grupo_nombre
    `, [cuenta_id])
    res.json({ ok: true, datos: rows })
  } catch (err) {
    logError('GET /admin/api/grupos', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /sync?cuenta_id=1 — sincronización manual desde el panel
router.post('/sync', async (req, res) => {
  const cuenta_id = parseInt(req.query.cuenta_id || req.body?.cuenta_id || '1')
  try {
    if (!estaConectado(cuenta_id)) return res.status(503).json({ ok: false, error: `Cuenta ${cuenta_id} no conectada` })
    const total = await sincronizar(cuenta_id)
    res.json({ ok: true, total })
  } catch (err) {
    logError('POST /admin/api/grupos/sync', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

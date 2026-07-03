const { Router } = require('express')
const { listarGrupos, estaConectado } = require('../../whatsapp')
const { pool } = require('../../db')

const router = Router()

// GET /grupos?cuenta_id=1 — devuelve lista de grupos de una cuenta
// Si el bot está conectado refresca desde WhatsApp y actualiza wts_grupo.
// Si no está conectado devuelve lo que haya en BD.
router.get('/', async (req, res) => {
  const cuenta_id = parseInt(req.query.cuenta_id || '1')

  try {
    if (estaConectado(cuenta_id)) {
      await listarGrupos(cuenta_id)
    }

    const { rows } = await pool.query(`
      SELECT wts_grupo_id AS id, wts_grupo_nombre AS nombre, wts_grupo_jid AS jid
      FROM wts_grupo
      WHERE COALESCE(wts_cuenta_id, 1) = $1
        AND wts_grupo_estado = 1
      ORDER BY wts_grupo_nombre
    `, [cuenta_id])

    res.json({ ok: true, cuenta_id, total: rows.length, grupos: rows })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

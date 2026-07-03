const { Router } = require('express')
const { pool }   = require('../../../db')
const { iniciarCuenta, estaConectado, cuentas } = require('../../../whatsapp')
const { logError } = require('../logger-errores')
const path = require('path')
const fs   = require('fs')

const router = Router()

// GET / — lista todas las cuentas
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wts_cuenta_id    AS id,
             wts_cuenta_nombre AS nombre,
             wts_cuenta_numero AS numero,
             wts_cuenta_estado AS estado
      FROM wts_cuenta ORDER BY wts_cuenta_id
    `)
    const datos = rows.map(c => ({
      ...c,
      conectado: estaConectado(c.id),
    }))
    res.json({ ok: true, datos })
  } catch (err) {
    logError('GET /admin/api/cuentas', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST / — crea nueva cuenta e inicia su socket
router.post('/', async (req, res) => {
  const { nombre, numero } = req.body
  if (!nombre) return res.status(400).json({ ok: false, error: 'nombre es obligatorio' })

  try {
    const { rows } = await pool.query(`
      INSERT INTO wts_cuenta (wts_cuenta_nombre, wts_cuenta_numero, wts_cuenta_estado, user_crea)
      VALUES ($1, $2, 1, 'ADMIN')
      RETURNING wts_cuenta_id AS id
    `, [nombre, numero || null])

    const id = rows[0].id
    await iniciarCuenta(id, nombre)

    res.status(201).json({ ok: true, id })
  } catch (err) {
    logError('POST /admin/api/cuentas', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// PUT /:id — edita nombre, numero o estado
router.put('/:id', async (req, res) => {
  const { nombre, numero, estado } = req.body
  const id = parseInt(req.params.id)

  try {
    await pool.query(`
      UPDATE wts_cuenta
      SET wts_cuenta_nombre  = COALESCE($1, wts_cuenta_nombre),
          wts_cuenta_numero  = COALESCE($2, wts_cuenta_numero),
          wts_cuenta_estado  = COALESCE($3, wts_cuenta_estado),
          user_modifica      = 'ADMIN',
          fecha_modifica     = NOW()
      WHERE wts_cuenta_id = $4
    `, [nombre || null, numero || null, estado ?? null, id])

    res.json({ ok: true })
  } catch (err) {
    logError('PUT /admin/api/cuentas/:id', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// DELETE /:id — solo si no tiene mensajes asociados
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  if (id === 1) return res.status(400).json({ ok: false, error: 'No se puede eliminar la cuenta Principal' })

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total FROM wts_mensaje WHERE wts_cuenta_id = $1`, [id]
    )
    if (parseInt(rows[0].total) > 0) {
      return res.status(400).json({ ok: false, error: 'La cuenta tiene mensajes asociados — desactívala en su lugar' })
    }

    await pool.query(`DELETE FROM wts_cuenta WHERE wts_cuenta_id = $1`, [id])
    res.json({ ok: true })
  } catch (err) {
    logError('DELETE /admin/api/cuentas/:id', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /:id/qr — devuelve el QR actual de la cuenta como base64
router.get('/:id/qr', (req, res) => {
  const id      = parseInt(req.params.id)
  const qrPath  = path.join(__dirname, '../../../auth', `cuenta-${id}`, 'qr.png')

  if (!fs.existsSync(qrPath)) {
    return res.status(404).json({ ok: false, error: 'QR no disponible — la cuenta puede estar ya conectada' })
  }

  const base64 = fs.readFileSync(qrPath).toString('base64')
  res.json({ ok: true, qr: `data:image/png;base64,${base64}` })
})

module.exports = router

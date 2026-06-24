const { Router } = require('express')
const bcrypt = require('bcrypt')
const jwt    = require('jsonwebtoken')
const { pool } = require('../../../db')

const router = Router()

// POST /admin/api/auth/login
router.post('/login', async (req, res) => {
  const { email, clave } = req.body || {}

  if (!email || !clave) {
    return res.status(400).json({ ok: false, error: 'Email y clave requeridos' })
  }

  try {
    const { rows } = await pool.query(`
      SELECT u.sis_usuario_id, u.sis_usuario_nombre, u.sis_usuario_email,
             u.sis_usuario_clave, u.sis_usuario_estado,
             p.sis_perfil_id, p.sis_perfil_nombre
      FROM   sis_usuario u
      INNER JOIN sis_perfil p ON p.sis_perfil_id = u.sis_perfil_id
      WHERE  u.sis_usuario_email = $1
        AND  u.sis_usuario_estado = 1
        AND  p.sis_perfil_estado  = 1
    `, [email.toLowerCase().trim()])

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' })
    }

    const usuario = rows[0]
    const valida  = await bcrypt.compare(clave, usuario.sis_usuario_clave)

    if (!valida) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' })
    }

    // Cargar permisos del perfil
    const { rows: acciones } = await pool.query(`
      SELECT sis_perfil_acciones_modulo_codigo AS modulo,
             sis_perfil_acciones_modulo_nombre AS nombre,
             sis_perfil_acciones_ver           AS ver,
             sis_perfil_acciones_crear         AS crear,
             sis_perfil_acciones_editar        AS editar,
             sis_perfil_acciones_eliminar      AS eliminar
      FROM   sis_perfil_acciones
      WHERE  sis_perfil_id = $1
        AND  sis_perfil_acciones_estado = 1
    `, [usuario.sis_perfil_id])

    const payload = {
      id:      usuario.sis_usuario_id,
      nombre:  usuario.sis_usuario_nombre,
      email:   usuario.sis_usuario_email,
      perfil:  usuario.sis_perfil_nombre,
      permisos: acciones,
    }

    const token = jwt.sign(payload, process.env.JWT_SECRETO, { expiresIn: '8h' })

    res.json({ ok: true, token, usuario: payload })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

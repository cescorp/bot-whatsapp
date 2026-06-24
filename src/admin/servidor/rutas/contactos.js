const express      = require('express')
const { Router }   = require('express')
const { pool }     = require('../../../db')
const { logError } = require('../logger-errores')

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.wts_contacto_id               AS id,
             c.wts_contacto_nombres          AS nombres,
             c.wts_contacto_apellidos        AS apellidos,
             c.wts_contacto_celular_principal AS celular,
             c.wts_contacto_correo           AS correo,
             c.wts_contacto_permite_whatsapp AS permite_whatsapp,
             c.wts_contacto_estado           AS estado,
             c.wts_contacto_grupo_id         AS grupo_id,
             g.wts_grupo_nombre              AS grupo_nombre,
             g.wts_grupo_jid                 AS grupo_jid,
             c.fecha_crea
      FROM   wts_contacto c
      LEFT JOIN wts_grupo g ON g.wts_grupo_id = c.wts_contacto_grupo_id
      WHERE  c.wts_contacto_estado = 1
      ORDER BY c.wts_contacto_apellidos, c.wts_contacto_nombres
    `)
    res.json({ ok: true, datos: rows })
  } catch (err) {
    logError('GET /admin/api/contactos', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.wts_contacto_id               AS id,
             c.wts_contacto_nombres          AS nombres,
             c.wts_contacto_apellidos        AS apellidos,
             c.wts_contacto_celular_principal AS celular,
             c.wts_contacto_correo           AS correo,
             c.wts_contacto_permite_whatsapp AS permite_whatsapp,
             c.wts_contacto_estado           AS estado,
             c.wts_contacto_grupo_id         AS grupo_id,
             g.wts_grupo_nombre              AS grupo_nombre
      FROM   wts_contacto c
      LEFT JOIN wts_grupo g ON g.wts_grupo_id = c.wts_contacto_grupo_id
      WHERE  c.wts_contacto_id = $1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' })
    res.json({ ok: true, dato: rows[0] })
  } catch (err) {
    logError('GET /admin/api/contactos/:id', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/', async (req, res) => {
  const { nombres, apellidos, celular, correo, permite_whatsapp, grupo_id } = req.body || {}
  if (!nombres) return res.status(400).json({ ok: false, error: 'nombres es requerido' })
  if (!grupo_id && !celular) return res.status(400).json({ ok: false, error: 'celular es requerido cuando no hay grupo' })
  try {
    const { rows } = await pool.query(`
      INSERT INTO wts_contacto
        (wts_contacto_nombres, wts_contacto_apellidos, wts_contacto_celular_principal,
         wts_contacto_correo, wts_contacto_permite_whatsapp, wts_contacto_grupo_id,
         wts_contacto_estado, user_crea, fecha_crea)
      VALUES ($1,$2,$3,$4,$5,$6,1,$7,NOW())
      RETURNING wts_contacto_id AS id
    `, [nombres, apellidos||'', celular||null, correo||null, permite_whatsapp==1?1:0,
        grupo_id||null, req.usuario.email])
    res.status(201).json({ ok: true, id: rows[0].id })
  } catch (err) {
    logError('POST /admin/api/contactos', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  const { nombres, apellidos, celular, correo, permite_whatsapp, estado, grupo_id } = req.body || {}
  try {
    await pool.query(`
      UPDATE wts_contacto
      SET wts_contacto_nombres            = COALESCE($2, wts_contacto_nombres),
          wts_contacto_apellidos          = COALESCE($3, wts_contacto_apellidos),
          wts_contacto_celular_principal  = COALESCE($4, wts_contacto_celular_principal),
          wts_contacto_correo             = COALESCE($5, wts_contacto_correo),
          wts_contacto_permite_whatsapp   = COALESCE($6, wts_contacto_permite_whatsapp),
          wts_contacto_estado             = COALESCE($7, wts_contacto_estado),
          wts_contacto_grupo_id           = $8,
          user_modifica                   = $9,
          fecha_modifica                  = NOW()
      WHERE wts_contacto_id = $1
    `, [req.params.id, nombres||null, apellidos||null, celular||null, correo||null,
        permite_whatsapp!=null ? (permite_whatsapp==1?1:0) : null,
        estado!=null ? estado : null,
        grupo_id||null, req.usuario.email])
    res.json({ ok: true })
  } catch (err) {
    logError('PUT /admin/api/contactos/:id', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Importar contactos (recibe array ya parseado desde el frontend) ───────────
router.post('/importar', async (req, res) => {
  const { contactos: lista, duplicados } = req.body || {}
  if (!Array.isArray(lista)) return res.status(400).json({ ok: false, error: 'Se esperaba un array de contactos' })
  try {
    let insertados = 0, actualizados = 0, omitidos = 0, errores = 0
    const detalleErrores = []

    for (const c of lista) {
      try {
        const { rows } = await pool.query(
          'SELECT wts_contacto_id FROM wts_contacto WHERE wts_contacto_celular_principal = $1', [c.celular])
        if (rows.length) {
          if (duplicados === 'actualizar') {
            await pool.query(`
              UPDATE wts_contacto
              SET wts_contacto_nombres   = $2,
                  wts_contacto_apellidos = $3,
                  wts_contacto_correo    = $4,
                  user_modifica          = 'IMPORTACION',
                  fecha_modifica         = NOW()
              WHERE wts_contacto_id = $1
            `, [rows[0].wts_contacto_id, c.nombres, c.apellidos, c.correo])
            actualizados++
          } else {
            omitidos++
          }
        } else {
          await pool.query(`
            INSERT INTO wts_contacto
              (wts_contacto_nombres, wts_contacto_apellidos, wts_contacto_celular_principal,
               wts_contacto_correo, wts_contacto_permite_whatsapp, wts_contacto_estado,
               user_crea, fecha_crea)
            VALUES ($1,$2,$3,$4,1,1,'IMPORTACION',NOW())
          `, [c.nombres, c.apellidos, c.celular, c.correo])
          insertados++
        }
      } catch (e) {
        errores++
        detalleErrores.push(`${c.nombres} (${c.celular}): ${e.message}`)
      }
    }

    if (detalleErrores.length) {
      logError('POST /admin/api/contactos/importar — errores por fila', new Error(detalleErrores.join('\n')))
    }

    res.json({ ok: true, total: lista.length, insertados, actualizados, omitidos, errores })
  } catch (err) {
    logError('POST /admin/api/contactos/importar', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Desreferenciar FK antes de borrar
    await client.query(
      `UPDATE wts_mensaje    SET wts_contacto_id = NULL WHERE wts_contacto_id = $1`,
      [req.params.id])
    await client.query(
      `UPDATE wts_calendario SET wts_contacto_id = NULL WHERE wts_contacto_id = $1`,
      [req.params.id])
    await client.query(
      `DELETE FROM wts_contacto WHERE wts_contacto_id = $1`,
      [req.params.id])
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    logError('DELETE /admin/api/contactos/:id', err)
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router

-- Tabla de grupos WhatsApp sincronizados desde Baileys
CREATE TABLE IF NOT EXISTS wts_grupo (
  wts_grupo_id     SERIAL PRIMARY KEY,
  wts_grupo_jid    VARCHAR(100) UNIQUE NOT NULL,
  wts_grupo_nombre VARCHAR(200) NOT NULL,
  wts_grupo_estado SMALLINT    DEFAULT 1,
  fecha_crea       TIMESTAMP   DEFAULT NOW(),
  fecha_modifica   TIMESTAMP
);

-- Opcional: asignar un grupo destino a un contacto
ALTER TABLE wts_contacto
  ADD COLUMN IF NOT EXISTS wts_contacto_grupo_id INTEGER REFERENCES wts_grupo(wts_grupo_id);

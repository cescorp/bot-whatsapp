-- ── Migración 003: Extender calendario para grupos, número libre y repetición ──

-- Eliminar triggers existentes (el backend ahora genera los mensajes directamente)
DROP TRIGGER IF EXISTS trg_wts_calendario_ai ON wts_calendario;
DROP TRIGGER IF EXISTS trg_wts_calendario_au ON wts_calendario;
DROP TRIGGER IF EXISTS trg_wts_calendario_ad ON wts_calendario;

-- Hacer wts_contacto_id opcional (para grupos y números libres)
ALTER TABLE wts_calendario ALTER COLUMN wts_contacto_id DROP NOT NULL;

-- Destino grupo WhatsApp
ALTER TABLE wts_calendario
  ADD COLUMN IF NOT EXISTS wts_grupo_id INTEGER REFERENCES wts_grupo(wts_grupo_id);

-- Destino número libre (sin contacto ni grupo)
ALTER TABLE wts_calendario
  ADD COLUMN IF NOT EXISTS wts_calendario_destino_libre VARCHAR(20);

-- Texto del mensaje personalizado por evento
ALTER TABLE wts_calendario
  ADD COLUMN IF NOT EXISTS wts_calendario_mensaje_texto TEXT;

-- Repetición: 0=No, 1=Diario, 2=Semanal, 3=Mensual
ALTER TABLE wts_calendario
  ADD COLUMN IF NOT EXISTS wts_calendario_repeticion SMALLINT DEFAULT 0;

-- Fecha límite de repetición
ALTER TABLE wts_calendario
  ADD COLUMN IF NOT EXISTS wts_calendario_repeticion_fin DATE;

-- Prioridad en alertas (referenciada en la función pero faltaba en la tabla)
ALTER TABLE wts_calendario_alerta
  ADD COLUMN IF NOT EXISTS wts_calendario_alerta_prioridad SMALLINT DEFAULT 2;

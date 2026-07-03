-- ============================================================
-- Fase 1 — Multi-cuenta WhatsApp
-- ============================================================

-- ------------------------------------------------------------
-- 1.1  Tabla wts_cuenta
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wts_cuenta (
  wts_cuenta_id     SERIAL        PRIMARY KEY,
  wts_cuenta_nombre VARCHAR(100)  NOT NULL,
  wts_cuenta_numero VARCHAR(20),
  wts_cuenta_estado INTEGER       NOT NULL DEFAULT 1,
  user_crea         VARCHAR(100)  NOT NULL DEFAULT 'SYSTEM',
  fecha_crea        TIMESTAMP     NOT NULL DEFAULT NOW(),
  user_modifica     VARCHAR(100),
  fecha_modifica    TIMESTAMP
);

COMMENT ON COLUMN wts_cuenta.wts_cuenta_nombre  IS 'Nombre descriptivo, ej: Ventas, Soporte';
COMMENT ON COLUMN wts_cuenta.wts_cuenta_numero  IS 'Número de teléfono asociado (referencia)';
COMMENT ON COLUMN wts_cuenta.wts_cuenta_estado  IS '1=activa, 0=inactiva';

-- Cuenta principal (migra la sesión existente)
INSERT INTO wts_cuenta (wts_cuenta_id, wts_cuenta_nombre, wts_cuenta_numero)
VALUES (1, 'Principal', '')
ON CONFLICT (wts_cuenta_id) DO NOTHING;

-- ------------------------------------------------------------
-- 1.2  wts_cuenta_id en wts_mensaje
-- ------------------------------------------------------------
ALTER TABLE wts_mensaje
  ADD COLUMN IF NOT EXISTS wts_cuenta_id INTEGER REFERENCES wts_cuenta(wts_cuenta_id);

UPDATE wts_mensaje SET wts_cuenta_id = 1 WHERE wts_cuenta_id IS NULL;

-- ------------------------------------------------------------
-- 1.3  wts_cuenta_id en wts_calendario
-- ------------------------------------------------------------
ALTER TABLE wts_calendario
  ADD COLUMN IF NOT EXISTS wts_cuenta_id INTEGER REFERENCES wts_cuenta(wts_cuenta_id);

UPDATE wts_calendario SET wts_cuenta_id = 1 WHERE wts_cuenta_id IS NULL;

-- ------------------------------------------------------------
-- 1.4  Actualizar wts_generar_mensajes_calendario
--      Propaga wts_cuenta_id del calendario al INSERT en wts_mensaje
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION wts_generar_mensajes_calendario(p_wts_calendario_id BIGINT)
RETURNS void AS $BODY$
DECLARE
  v_cal         RECORD;
  v_alerta      RECORD;
  v_fecha       TIMESTAMP;
  v_destino     TEXT;
  v_contacto_id BIGINT;
  v_texto       TEXT;
  v_cuenta_id   INTEGER;
BEGIN
  -- Leer evento con destino resuelto
  SELECT c.*,
         ct.wts_contacto_celular_principal AS celular,
         ct.wts_contacto_id               AS cid,
         g.wts_grupo_jid                  AS jid
  INTO v_cal
  FROM wts_calendario c
  LEFT JOIN wts_contacto ct ON ct.wts_contacto_id = c.wts_contacto_id
  LEFT JOIN wts_grupo    g  ON g.wts_grupo_id     = c.wts_grupo_id
  WHERE c.wts_calendario_id = p_wts_calendario_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_cal.wts_calendario_estado <> 1 THEN RETURN; END IF;

  -- Cuenta que enviará (default 1 si no está asignada)
  v_cuenta_id := COALESCE(v_cal.wts_cuenta_id, 1);

  -- Resolver destino
  IF v_cal.wts_contacto_id IS NOT NULL AND v_cal.celular IS NOT NULL THEN
    v_destino     := v_cal.celular;
    v_contacto_id := v_cal.cid;
  ELSIF v_cal.wts_grupo_id IS NOT NULL AND v_cal.jid IS NOT NULL THEN
    v_destino     := v_cal.jid;
    v_contacto_id := NULL;
  ELSIF v_cal.wts_calendario_destino_libre IS NOT NULL THEN
    v_destino     := v_cal.wts_calendario_destino_libre;
    v_contacto_id := NULL;
  ELSE
    RETURN;
  END IF;

  v_texto := COALESCE(
    v_cal.wts_calendario_mensaje_texto,
    'Recordatorio: ' || v_cal.wts_calendario_titulo
      || E'\nFecha: ' || to_char(v_cal.wts_calendario_fecha_evento, 'DD/MM/YYYY HH24:MI')
  );

  -- Cancelar mensajes pendientes anteriores
  UPDATE wts_mensaje
  SET wts_mensaje_estado = 5, user_modifica = 'TRIGGER', fecha_modifica = NOW()
  WHERE wts_calendario_id = p_wts_calendario_id
    AND wts_mensaje_estado NOT IN (3, 5);

  -- Generar un mensaje por cada alerta activa
  FOR v_alerta IN
    SELECT * FROM wts_calendario_alerta
    WHERE wts_calendario_id            = p_wts_calendario_id
      AND wts_calendario_alerta_estado = 1
  LOOP
    IF    v_alerta.wts_calendario_alerta_tipo = 0 THEN
      v_fecha := v_cal.wts_calendario_fecha_evento;
    ELSIF v_alerta.wts_calendario_alerta_tipo = 1 THEN
      v_fecha := v_cal.wts_calendario_fecha_evento
                 - (v_alerta.wts_calendario_alerta_valor::INT * INTERVAL '1 day');
    ELSIF v_alerta.wts_calendario_alerta_tipo = 2 THEN
      v_fecha := v_cal.wts_calendario_fecha_evento
                 - (v_alerta.wts_calendario_alerta_valor::INT * INTERVAL '1 hour');
    ELSIF v_alerta.wts_calendario_alerta_tipo = 3 THEN
      v_fecha := v_cal.wts_calendario_fecha_evento
                 - (v_alerta.wts_calendario_alerta_valor::INT * INTERVAL '1 minute');
    ELSIF v_alerta.wts_calendario_alerta_tipo = 4 THEN
      v_fecha := date_trunc('day', v_cal.wts_calendario_fecha_evento)
                 + v_alerta.wts_calendario_alerta_valor::TIME;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO wts_mensaje
      (wts_contacto_id, wts_calendario_id, wts_calendario_alerta_id,
       wts_mensaje_tipo, wts_mensaje_origen, wts_mensaje_destino,
       wts_mensaje_texto, wts_mensaje_fecha_programada,
       wts_mensaje_estado, wts_mensaje_prioridad, wts_mensaje_intentos,
       wts_cuenta_id, user_crea)
    VALUES
      (v_contacto_id, p_wts_calendario_id, v_alerta.wts_calendario_alerta_id,
       2, 2, v_destino,
       v_texto, v_fecha,
       1, COALESCE(v_alerta.wts_calendario_alerta_prioridad, 2), 0,
       v_cuenta_id, 'TRIGGER');
  END LOOP;
END;
$BODY$
LANGUAGE plpgsql VOLATILE COST 100;

-- ------------------------------------------------------------
-- 1.5  wts_cuenta_id en wts_grupo
-- ------------------------------------------------------------
ALTER TABLE wts_grupo
  ADD COLUMN IF NOT EXISTS wts_cuenta_id INTEGER REFERENCES wts_cuenta(wts_cuenta_id) DEFAULT 1;

UPDATE wts_grupo SET wts_cuenta_id = 1 WHERE wts_cuenta_id IS NULL;

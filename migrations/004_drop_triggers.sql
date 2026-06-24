-- ── Migración 004: Eliminar triggers de calendario (backend genera mensajes) ──
-- Ejecutar si aún quedan triggers activos que generan duplicados (estado=5 + estado=1)

DROP TRIGGER IF EXISTS trg_wts_calendario_ai ON wts_calendario;
DROP TRIGGER IF EXISTS trg_wts_calendario_au ON wts_calendario;
DROP TRIGGER IF EXISTS trg_wts_calendario_ad ON wts_calendario;

-- Verificar que no quede ninguno:
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'wts_calendario';
-- Si esta query no devuelve filas, los triggers fueron eliminados correctamente.

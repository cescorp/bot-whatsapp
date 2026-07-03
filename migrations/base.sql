/*
PostgreSQL Backup
Database: alerta_wts/public
Backup Time: 2026-06-24 10:38:02
*/

DROP SEQUENCE IF EXISTS "public"."sis_perfil_acciones_sis_perfil_acciones_id_seq";
DROP SEQUENCE IF EXISTS "public"."sis_perfil_sis_perfil_id_seq";
DROP SEQUENCE IF EXISTS "public"."sis_usuario_sis_usuario_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_calendario_alerta_wts_calendario_alerta_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_calendario_wts_calendario_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_configuracion_wts_configuracion_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_contacto_grupo_detalle_wts_contacto_grupo_detalle_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_contacto_grupo_wts_contacto_grupo_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_contacto_wts_contacto_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_grupo_wts_grupo_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_mensaje_log_wts_mensaje_log_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_mensaje_wts_mensaje_id_seq";
DROP SEQUENCE IF EXISTS "public"."wts_plantilla_wts_plantilla_id_seq";
DROP TABLE IF EXISTS "public"."sis_perfil";
DROP TABLE IF EXISTS "public"."sis_perfil_acciones";
DROP TABLE IF EXISTS "public"."sis_usuario";
DROP TABLE IF EXISTS "public"."wts_calendario";
DROP TABLE IF EXISTS "public"."wts_calendario_alerta";
DROP TABLE IF EXISTS "public"."wts_configuracion";
DROP TABLE IF EXISTS "public"."wts_contacto";
DROP TABLE IF EXISTS "public"."wts_contacto_categoria";
DROP TABLE IF EXISTS "public"."wts_contacto_categoria_detalle";
DROP TABLE IF EXISTS "public"."wts_grupo";
DROP TABLE IF EXISTS "public"."wts_mensaje";
DROP TABLE IF EXISTS "public"."wts_mensaje_log";
DROP TABLE IF EXISTS "public"."wts_plantilla";
DROP FUNCTION IF EXISTS "public"."trg_wts_calendario_ad"();
DROP FUNCTION IF EXISTS "public"."trg_wts_calendario_ai"();
DROP FUNCTION IF EXISTS "public"."trg_wts_calendario_alerta_cambio"();
DROP FUNCTION IF EXISTS "public"."trg_wts_calendario_au"();
DROP FUNCTION IF EXISTS "public"."wts_generar_mensajes_calendario"(p_wts_calendario_id int8);
CREATE SEQUENCE "sis_perfil_acciones_sis_perfil_acciones_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "sis_perfil_sis_perfil_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "sis_usuario_sis_usuario_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_calendario_alerta_wts_calendario_alerta_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_calendario_wts_calendario_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_configuracion_wts_configuracion_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_contacto_grupo_detalle_wts_contacto_grupo_detalle_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_contacto_grupo_wts_contacto_grupo_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_contacto_wts_contacto_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_grupo_wts_grupo_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 2147483647
START 1
CACHE 1;
CREATE SEQUENCE "wts_mensaje_log_wts_mensaje_log_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_mensaje_wts_mensaje_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE SEQUENCE "wts_plantilla_wts_plantilla_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;
CREATE TABLE "sis_perfil" (
  "sis_perfil_id" int8 NOT NULL DEFAULT nextval('sis_perfil_sis_perfil_id_seq'::regclass),
  "sis_perfil_nombre" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "sis_perfil_descripcion" varchar(200) COLLATE "pg_catalog"."default",
  "sis_perfil_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_crea" timestamp(6) DEFAULT now(),
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6)
)
;
ALTER TABLE "sis_perfil" OWNER TO "postgres";
COMMENT ON COLUMN "sis_perfil"."sis_perfil_estado" IS '1=Activo, 0=Inactivo';
COMMENT ON TABLE "sis_perfil" IS 'Perfiles de acceso del sistema administrativo';
CREATE TABLE "sis_perfil_acciones" (
  "sis_perfil_acciones_id" int8 NOT NULL DEFAULT nextval('sis_perfil_acciones_sis_perfil_acciones_id_seq'::regclass),
  "sis_perfil_id" int8 NOT NULL,
  "sis_perfil_acciones_modulo_codigo" int2 NOT NULL,
  "sis_perfil_acciones_modulo_nombre" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "sis_perfil_acciones_ver" int2 NOT NULL DEFAULT 0,
  "sis_perfil_acciones_crear" int2 NOT NULL DEFAULT 0,
  "sis_perfil_acciones_editar" int2 NOT NULL DEFAULT 0,
  "sis_perfil_acciones_eliminar" int2 NOT NULL DEFAULT 0,
  "sis_perfil_acciones_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_crea" timestamp(6) DEFAULT now()
)
;
ALTER TABLE "sis_perfil_acciones" OWNER TO "postgres";
COMMENT ON COLUMN "sis_perfil_acciones"."sis_perfil_acciones_modulo_codigo" IS '1=contactos, 2=mensajes, 3=plantillas, 4=calendario, 5=reportes';
COMMENT ON COLUMN "sis_perfil_acciones"."sis_perfil_acciones_ver" IS '1=Permitido, 0=Denegado';
COMMENT ON COLUMN "sis_perfil_acciones"."sis_perfil_acciones_crear" IS '1=Permitido, 0=Denegado';
COMMENT ON COLUMN "sis_perfil_acciones"."sis_perfil_acciones_editar" IS '1=Permitido, 0=Denegado';
COMMENT ON COLUMN "sis_perfil_acciones"."sis_perfil_acciones_eliminar" IS '1=Permitido, 0=Denegado';
COMMENT ON COLUMN "sis_perfil_acciones"."sis_perfil_acciones_estado" IS '1=Activo, 0=Inactivo';
COMMENT ON TABLE "sis_perfil_acciones" IS 'Permisos por módulo asignados a cada perfil';
CREATE TABLE "sis_usuario" (
  "sis_usuario_id" int8 NOT NULL DEFAULT nextval('sis_usuario_sis_usuario_id_seq'::regclass),
  "sis_perfil_id" int8 NOT NULL,
  "sis_usuario_nombre" varchar(100) COLLATE "pg_catalog"."default" NOT NULL,
  "sis_usuario_email" varchar(100) COLLATE "pg_catalog"."default" NOT NULL,
  "sis_usuario_clave" varchar(200) COLLATE "pg_catalog"."default" NOT NULL,
  "sis_usuario_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_crea" timestamp(6) DEFAULT now(),
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6)
)
;
ALTER TABLE "sis_usuario" OWNER TO "postgres";
COMMENT ON COLUMN "sis_usuario"."sis_usuario_clave" IS 'Contraseña hasheada con bcrypt';
COMMENT ON COLUMN "sis_usuario"."sis_usuario_estado" IS '1=Activo, 0=Inactivo';
COMMENT ON TABLE "sis_usuario" IS 'Usuarios del sistema administrativo';
CREATE TABLE "wts_calendario" (
  "wts_calendario_id" int8 NOT NULL DEFAULT nextval('wts_calendario_wts_calendario_id_seq'::regclass),
  "wts_contacto_id" int8,
  "wts_plantilla_id" int8,
  "wts_calendario_titulo" varchar(150) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_calendario_descripcion" text COLLATE "pg_catalog"."default",
  "wts_calendario_fecha_evento" timestamp(6) NOT NULL,
  "wts_calendario_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6),
  "wts_grupo_id" int4,
  "wts_calendario_destino_libre" varchar(20) COLLATE "pg_catalog"."default",
  "wts_calendario_mensaje_texto" text COLLATE "pg_catalog"."default",
  "wts_calendario_repeticion" int2 DEFAULT 0,
  "wts_calendario_repeticion_fin" date
)
;
ALTER TABLE "wts_calendario" OWNER TO "icfv";
COMMENT ON COLUMN "wts_calendario"."wts_calendario_estado" IS '1=Activo - 0=Inactivo - 2=Cancelado';
CREATE TABLE "wts_calendario_alerta" (
  "wts_calendario_alerta_id" int8 NOT NULL DEFAULT nextval('wts_calendario_alerta_wts_calendario_alerta_id_seq'::regclass),
  "wts_calendario_id" int8 NOT NULL,
  "wts_calendario_alerta_tipo" int2 NOT NULL,
  "wts_calendario_alerta_valor" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_calendario_alerta_descripcion" varchar(100) COLLATE "pg_catalog"."default",
  "wts_calendario_alerta_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6),
  "wts_calendario_alerta_prioridad" int2 NOT NULL DEFAULT 2
)
;
ALTER TABLE "wts_calendario_alerta" OWNER TO "icfv";
COMMENT ON COLUMN "wts_calendario_alerta"."wts_calendario_alerta_tipo" IS '1=DiasAntes - 2=HorasAntes - 3=MinutosAntes - 4=HoraFija';
COMMENT ON COLUMN "wts_calendario_alerta"."wts_calendario_alerta_estado" IS '1=Activo - 0=Inactivo';
COMMENT ON COLUMN "wts_calendario_alerta"."wts_calendario_alerta_prioridad" IS '1=Baja - 2=Normal - 3=Alta';
COMMENT ON TABLE "wts_calendario_alerta" IS 'Reglas de alertas asociadas a eventos del calendario';
CREATE TABLE "wts_configuracion" (
  "wts_configuracion_id" int8 NOT NULL DEFAULT nextval('wts_configuracion_wts_configuracion_id_seq'::regclass),
  "wts_configuracion_clave" varchar(100) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_configuracion_valor" text COLLATE "pg_catalog"."default",
  "wts_configuracion_descripcion" varchar(200) COLLATE "pg_catalog"."default",
  "wts_configuracion_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6)
)
;
ALTER TABLE "wts_configuracion" OWNER TO "icfv";
COMMENT ON COLUMN "wts_configuracion"."wts_configuracion_estado" IS '1=Activo - 0=Inactivo';
COMMENT ON TABLE "wts_configuracion" IS 'Parametros globales del sistema. El bot los lee en cada ciclo sin reiniciar.';
CREATE TABLE "wts_contacto" (
  "wts_contacto_id" int8 NOT NULL DEFAULT nextval('wts_contacto_wts_contacto_id_seq'::regclass),
  "wts_contacto_tipo" int2 NOT NULL DEFAULT 1,
  "wts_contacto_identificacion" varchar(20) COLLATE "pg_catalog"."default",
  "wts_contacto_nombres" varchar(100) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_contacto_apellidos" varchar(100) COLLATE "pg_catalog"."default",
  "wts_contacto_razon_social" varchar(150) COLLATE "pg_catalog"."default",
  "wts_contacto_celular_principal" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_contacto_celular_secundario" varchar(20) COLLATE "pg_catalog"."default",
  "wts_contacto_correo" varchar(120) COLLATE "pg_catalog"."default",
  "wts_contacto_ciudad" varchar(80) COLLATE "pg_catalog"."default",
  "wts_contacto_direccion" varchar(200) COLLATE "pg_catalog"."default",
  "wts_contacto_fecha_ingreso" date,
  "wts_contacto_observacion" text COLLATE "pg_catalog"."default",
  "wts_contacto_permite_whatsapp" int2 NOT NULL DEFAULT 1,
  "wts_contacto_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6),
  "wts_contacto_grupo_id" int4
)
;
ALTER TABLE "wts_contacto" OWNER TO "icfv";
COMMENT ON COLUMN "wts_contacto"."wts_contacto_tipo" IS '1=Persona - 2=Empresa';
COMMENT ON COLUMN "wts_contacto"."wts_contacto_permite_whatsapp" IS '1=Si - 0=No';
COMMENT ON COLUMN "wts_contacto"."wts_contacto_estado" IS '1=Activo - 0=Inactivo - 2=Bloqueado';
COMMENT ON TABLE "wts_contacto" IS 'Contactos para envío de WhatsApp';
CREATE TABLE "wts_contacto_categoria" (
  "wts_contacto_grupo_id" int8 NOT NULL DEFAULT nextval('wts_contacto_grupo_wts_contacto_grupo_id_seq'::regclass),
  "wts_contacto_grupo_nombre" varchar(100) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_contacto_grupo_descripcion" varchar(200) COLLATE "pg_catalog"."default",
  "wts_contacto_grupo_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6)
)
;
ALTER TABLE "wts_contacto_categoria" OWNER TO "icfv";
COMMENT ON COLUMN "wts_contacto_categoria"."wts_contacto_grupo_estado" IS '1=Activo - 0=Inactivo';
CREATE TABLE "wts_contacto_categoria_detalle" (
  "wts_contacto_grupo_detalle_id" int8 NOT NULL DEFAULT nextval('wts_contacto_grupo_detalle_wts_contacto_grupo_detalle_id_seq'::regclass),
  "wts_contacto_grupo_id" int8 NOT NULL,
  "wts_contacto_id" int8 NOT NULL,
  "wts_contacto_grupo_detalle_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6)
)
;
ALTER TABLE "wts_contacto_categoria_detalle" OWNER TO "icfv";
COMMENT ON COLUMN "wts_contacto_categoria_detalle"."wts_contacto_grupo_detalle_estado" IS '1=Activo - 0=Inactivo';
CREATE TABLE "wts_grupo" (
  "wts_grupo_id" int4 NOT NULL DEFAULT nextval('wts_grupo_wts_grupo_id_seq'::regclass),
  "wts_grupo_jid" varchar(100) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_grupo_nombre" varchar(200) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_grupo_estado" int2 DEFAULT 1,
  "fecha_crea" timestamp(6) DEFAULT now(),
  "fecha_modifica" timestamp(6)
)
;
ALTER TABLE "wts_grupo" OWNER TO "postgres";
CREATE TABLE "wts_mensaje" (
  "wts_mensaje_id" int8 NOT NULL DEFAULT nextval('wts_mensaje_wts_mensaje_id_seq'::regclass),
  "wts_contacto_id" int8,
  "wts_calendario_id" int8,
  "wts_plantilla_id" int8,
  "wts_mensaje_tipo" int2 NOT NULL DEFAULT 1,
  "wts_mensaje_origen" int2 NOT NULL DEFAULT 1,
  "wts_mensaje_destino" varchar(100) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_mensaje_texto" text COLLATE "pg_catalog"."default" NOT NULL,
  "wts_mensaje_fecha_programada" timestamp(6) NOT NULL,
  "wts_mensaje_fecha_envio" timestamp(6),
  "wts_mensaje_estado" int2 NOT NULL DEFAULT 1,
  "wts_mensaje_prioridad" int2 NOT NULL DEFAULT 2,
  "wts_mensaje_intentos" int4 NOT NULL DEFAULT 0,
  "wts_mensaje_ultimo_error" text COLLATE "pg_catalog"."default",
  "wts_mensaje_observacion" text COLLATE "pg_catalog"."default",
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6),
  "wts_calendario_alerta_id" int8
)
;
ALTER TABLE "wts_mensaje" OWNER TO "icfv";
COMMENT ON COLUMN "wts_mensaje"."wts_plantilla_id" IS 'Si tiene valor, el bot usa la plantilla como estructura del mensaje reemplazando variables. Si es NULL usa wts_mensaje_texto directo.';
COMMENT ON COLUMN "wts_mensaje"."wts_mensaje_tipo" IS '1=Manual - 2=Calendario - 3=Automatico';
COMMENT ON COLUMN "wts_mensaje"."wts_mensaje_origen" IS '1=Sistema - 2=Calendario - 3=Importado - 4=API';
COMMENT ON COLUMN "wts_mensaje"."wts_mensaje_estado" IS '1=Pendiente - 2=Procesando - 3=Enviado - 4=Error - 5=Cancelado';
COMMENT ON COLUMN "wts_mensaje"."wts_mensaje_prioridad" IS '1=Baja - 2=Normal - 3=Alta';
COMMENT ON COLUMN "wts_mensaje"."wts_mensaje_ultimo_error" IS 'Ultimo error registrado por el bot al intentar enviar. Se actualiza en cada fallo.';
CREATE TABLE "wts_mensaje_log" (
  "wts_mensaje_log_id" int8 NOT NULL DEFAULT nextval('wts_mensaje_log_wts_mensaje_log_id_seq'::regclass),
  "wts_mensaje_id" int8 NOT NULL,
  "wts_mensaje_log_estado_anterior" int2,
  "wts_mensaje_log_estado_nuevo" int2 NOT NULL,
  "wts_mensaje_log_descripcion" text COLLATE "pg_catalog"."default",
  "wts_mensaje_log_fecha" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6)
)
;
ALTER TABLE "wts_mensaje_log" OWNER TO "icfv";
COMMENT ON TABLE "wts_mensaje_log" IS 'Historial de cambios de estado por mensaje. Cada transicion (pendiente->enviado, pendiente->error) genera un registro.';
CREATE TABLE "wts_plantilla" (
  "wts_plantilla_id" int8 NOT NULL DEFAULT nextval('wts_plantilla_wts_plantilla_id_seq'::regclass),
  "wts_plantilla_nombre" varchar(100) COLLATE "pg_catalog"."default" NOT NULL,
  "wts_plantilla_texto" text COLLATE "pg_catalog"."default" NOT NULL,
  "wts_plantilla_tipo" int2 NOT NULL DEFAULT 1,
  "wts_plantilla_estado" int2 NOT NULL DEFAULT 1,
  "user_crea" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "fecha_crea" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_modifica" varchar(50) COLLATE "pg_catalog"."default",
  "fecha_modifica" timestamp(6)
)
;
ALTER TABLE "wts_plantilla" OWNER TO "icfv";
COMMENT ON COLUMN "wts_plantilla"."wts_plantilla_texto" IS 'Cuerpo de la plantilla. Variables: {{nombre}}, {{celular}}, {{mensaje}}, {{titulo}}, {{fecha_evento}}. Las variables no presentes simplemente no se usan.';
COMMENT ON COLUMN "wts_plantilla"."wts_plantilla_tipo" IS '1=Manual - 2=Calendario - 3=Automatico';
COMMENT ON COLUMN "wts_plantilla"."wts_plantilla_estado" IS '1=Activo - 0=Inactivo';
COMMENT ON TABLE "wts_plantilla" IS 'Plantillas de mensajes reutilizables. La plantilla ES la estructura del mensaje. Variables disponibles: {{nombre}}, {{celular}}, {{mensaje}}, {{titulo}}, {{fecha_evento}}. Si la plantilla no incluye {{mensaje}}, el campo wts_mensaje_texto no se usa en el envio.';
CREATE FUNCTION "trg_wts_calendario_ad"()
  RETURNS "pg_catalog"."trigger" AS $BODY$
BEGIN
    UPDATE wts_mensaje
    SET
        wts_mensaje_estado = 5,
        user_modifica      = 'TRIGGER',
        fecha_modifica     = NOW()
    WHERE wts_calendario_id  = OLD.wts_calendario_id
      AND wts_mensaje_estado NOT IN (3, 5);  -- respeta Enviados y ya Cancelados

    RETURN OLD;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;
ALTER FUNCTION "trg_wts_calendario_ad"() OWNER TO "icfv";
CREATE FUNCTION "trg_wts_calendario_ai"()
  RETURNS "pg_catalog"."trigger" AS $BODY$
BEGIN

    PERFORM wts_generar_mensajes_calendario(
        NEW.wts_calendario_id
    );

    RETURN NEW;

END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;
ALTER FUNCTION "trg_wts_calendario_ai"() OWNER TO "icfv";
CREATE FUNCTION "trg_wts_calendario_alerta_cambio"()
  RETURNS "pg_catalog"."trigger" AS $BODY$
DECLARE
  v_calendario_id BIGINT;
  v_varname       TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_calendario_id := OLD.wts_calendario_id;
  ELSE
    v_calendario_id := NEW.wts_calendario_id;
  END IF;

  v_varname := 'app.cal_gen_' || v_calendario_id::text;

  -- Si ya corrió para este calendario en esta transacción, saltar
  IF current_setting(v_varname, true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Marcar como ejecutado y correr la función
  PERFORM set_config(v_varname, '1', true);
  PERFORM wts_generar_mensajes_calendario(v_calendario_id);

  RETURN NEW;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;
ALTER FUNCTION "trg_wts_calendario_alerta_cambio"() OWNER TO "icfv";
CREATE FUNCTION "trg_wts_calendario_au"()
  RETURNS "pg_catalog"."trigger" AS $BODY$
BEGIN

    PERFORM wts_generar_mensajes_calendario(
        NEW.wts_calendario_id
    );

    RETURN NEW;

END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;
ALTER FUNCTION "trg_wts_calendario_au"() OWNER TO "icfv";
CREATE FUNCTION "wts_generar_mensajes_calendario"("p_wts_calendario_id" int8)
  RETURNS "pg_catalog"."void" AS $BODY$
DECLARE
  v_cal    RECORD;
  v_alerta RECORD;
  v_fecha  TIMESTAMP;
  v_destino       TEXT;
  v_contacto_id   BIGINT;
  v_texto         TEXT;
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
    RETURN; -- sin destino válido
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
       wts_mensaje_estado, wts_mensaje_prioridad, wts_mensaje_intentos, user_crea)
    VALUES
      (v_contacto_id, p_wts_calendario_id, v_alerta.wts_calendario_alerta_id,
       2, 2, v_destino,
       v_texto, v_fecha,
       1, COALESCE(v_alerta.wts_calendario_alerta_prioridad, 2), 0, 'TRIGGER');
  END LOOP;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;
ALTER FUNCTION "wts_generar_mensajes_calendario"("p_wts_calendario_id" int8) OWNER TO "icfv";
BEGIN;
LOCK TABLE "public"."sis_perfil" IN SHARE MODE;
DELETE FROM "public"."sis_perfil";
INSERT INTO "public"."sis_perfil" ("sis_perfil_id","sis_perfil_nombre","sis_perfil_descripcion","sis_perfil_estado","user_crea","fecha_crea","user_modifica","fecha_modifica") VALUES (1, 'ADMINISTRADOR', 'Acceso total al sistema', 1, 'SISTEMA', '2026-06-22 14:04:21.428113', NULL, NULL)
;
COMMIT;
BEGIN;
LOCK TABLE "public"."sis_perfil_acciones" IN SHARE MODE;
DELETE FROM "public"."sis_perfil_acciones";
INSERT INTO "public"."sis_perfil_acciones" ("sis_perfil_acciones_id","sis_perfil_id","sis_perfil_acciones_modulo_codigo","sis_perfil_acciones_modulo_nombre","sis_perfil_acciones_ver","sis_perfil_acciones_crear","sis_perfil_acciones_editar","sis_perfil_acciones_eliminar","sis_perfil_acciones_estado","user_crea","fecha_crea") VALUES (1, 1, 1, 'contactos', 1, 1, 1, 1, 1, 'SISTEMA', '2026-06-22 14:04:21.428113'),(2, 1, 2, 'mensajes', 1, 1, 1, 1, 1, 'SISTEMA', '2026-06-22 14:04:21.428113'),(3, 1, 3, 'plantillas', 1, 1, 1, 1, 1, 'SISTEMA', '2026-06-22 14:04:21.428113'),(4, 1, 4, 'calendario', 1, 1, 1, 1, 1, 'SISTEMA', '2026-06-22 14:04:21.428113'),(5, 1, 5, 'reportes', 1, 1, 1, 1, 1, 'SISTEMA', '2026-06-22 14:04:21.428113')
;
COMMIT;
BEGIN;
LOCK TABLE "public"."sis_usuario" IN SHARE MODE;
DELETE FROM "public"."sis_usuario";
INSERT INTO "public"."sis_usuario" ("sis_usuario_id","sis_perfil_id","sis_usuario_nombre","sis_usuario_email","sis_usuario_clave","sis_usuario_estado","user_crea","fecha_crea","user_modifica","fecha_modifica") VALUES (1, 1, 'Administrador', 'cescorp@hotmail.es', '$2b$10$9UqJZRTh/sW2aabIudlxVOuexl3pAiRMHvQ5obUu16Bi0a0nnWr2i', 1, 'SISTEMA', '2026-06-22 14:04:21.428113', NULL, NULL)
;
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_calendario" IN SHARE MODE;
DELETE FROM "public"."wts_calendario";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_calendario_alerta" IN SHARE MODE;
DELETE FROM "public"."wts_calendario_alerta";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_configuracion" IN SHARE MODE;
DELETE FROM "public"."wts_configuracion";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_contacto" IN SHARE MODE;
DELETE FROM "public"."wts_contacto";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_contacto_categoria" IN SHARE MODE;
DELETE FROM "public"."wts_contacto_categoria";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_contacto_categoria_detalle" IN SHARE MODE;
DELETE FROM "public"."wts_contacto_categoria_detalle";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_grupo" IN SHARE MODE;
DELETE FROM "public"."wts_grupo";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_mensaje" IN SHARE MODE;
DELETE FROM "public"."wts_mensaje";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_mensaje_log" IN SHARE MODE;
DELETE FROM "public"."wts_mensaje_log";
COMMIT;
BEGIN;
LOCK TABLE "public"."wts_plantilla" IN SHARE MODE;
DELETE FROM "public"."wts_plantilla";
COMMIT;
ALTER TABLE "sis_perfil" ADD CONSTRAINT "sis_perfil_pkey" PRIMARY KEY ("sis_perfil_id");
ALTER TABLE "sis_perfil_acciones" ADD CONSTRAINT "sis_perfil_acciones_pkey" PRIMARY KEY ("sis_perfil_acciones_id");
ALTER TABLE "sis_usuario" ADD CONSTRAINT "sis_usuario_pkey" PRIMARY KEY ("sis_usuario_id");
ALTER TABLE "wts_calendario" ADD CONSTRAINT "wts_calendario_pkey" PRIMARY KEY ("wts_calendario_id");
ALTER TABLE "wts_calendario_alerta" ADD CONSTRAINT "wts_calendario_alerta_pkey" PRIMARY KEY ("wts_calendario_alerta_id");
ALTER TABLE "wts_configuracion" ADD CONSTRAINT "wts_configuracion_pkey" PRIMARY KEY ("wts_configuracion_id");
ALTER TABLE "wts_contacto" ADD CONSTRAINT "wts_contacto_pkey" PRIMARY KEY ("wts_contacto_id");
ALTER TABLE "wts_contacto_categoria" ADD CONSTRAINT "wts_contacto_grupo_pkey" PRIMARY KEY ("wts_contacto_grupo_id");
ALTER TABLE "wts_contacto_categoria_detalle" ADD CONSTRAINT "wts_contacto_grupo_detalle_pkey" PRIMARY KEY ("wts_contacto_grupo_detalle_id");
ALTER TABLE "wts_grupo" ADD CONSTRAINT "wts_grupo_pkey" PRIMARY KEY ("wts_grupo_id");
ALTER TABLE "wts_mensaje" ADD CONSTRAINT "wts_mensaje_pkey" PRIMARY KEY ("wts_mensaje_id");
ALTER TABLE "wts_mensaje_log" ADD CONSTRAINT "wts_mensaje_log_pkey" PRIMARY KEY ("wts_mensaje_log_id");
ALTER TABLE "wts_plantilla" ADD CONSTRAINT "wts_plantilla_pkey" PRIMARY KEY ("wts_plantilla_id");
ALTER TABLE "sis_perfil_acciones" ADD CONSTRAINT "sis_perfil_acciones_sis_perfil_id_fkey" FOREIGN KEY ("sis_perfil_id") REFERENCES "public"."sis_perfil" ("sis_perfil_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "sis_usuario" ADD CONSTRAINT "sis_usuario_sis_usuario_email_key" UNIQUE ("sis_usuario_email");
ALTER TABLE "sis_usuario" ADD CONSTRAINT "sis_usuario_sis_perfil_id_fkey" FOREIGN KEY ("sis_perfil_id") REFERENCES "public"."sis_perfil" ("sis_perfil_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_calendario" ADD CONSTRAINT "fk_wts_calendario_contacto" FOREIGN KEY ("wts_contacto_id") REFERENCES "public"."wts_contacto" ("wts_contacto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_calendario" ADD CONSTRAINT "fk_wts_calendario_plantilla" FOREIGN KEY ("wts_plantilla_id") REFERENCES "public"."wts_plantilla" ("wts_plantilla_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_calendario" ADD CONSTRAINT "wts_calendario_wts_grupo_id_fkey" FOREIGN KEY ("wts_grupo_id") REFERENCES "public"."wts_grupo" ("wts_grupo_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_calendario_alerta" ADD CONSTRAINT "fk_wts_calendario_alerta_calendario" FOREIGN KEY ("wts_calendario_id") REFERENCES "public"."wts_calendario" ("wts_calendario_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE CONSTRAINT TRIGGER "trg_wts_calendario_alerta_ad" AFTER DELETE ON "wts_calendario_alerta"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE PROCEDURE "public"."trg_wts_calendario_alerta_cambio"();
CREATE CONSTRAINT TRIGGER "trg_wts_calendario_alerta_ai" AFTER INSERT ON "wts_calendario_alerta"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE PROCEDURE "public"."trg_wts_calendario_alerta_cambio"();
CREATE CONSTRAINT TRIGGER "trg_wts_calendario_alerta_au" AFTER UPDATE ON "wts_calendario_alerta"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE PROCEDURE "public"."trg_wts_calendario_alerta_cambio"();
ALTER TABLE "wts_contacto" ADD CONSTRAINT "wts_contacto_wts_contacto_grupo_id_fkey" FOREIGN KEY ("wts_contacto_grupo_id") REFERENCES "public"."wts_grupo" ("wts_grupo_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_contacto_categoria_detalle" ADD CONSTRAINT "fk_wts_contacto_grupo_detalle_contacto" FOREIGN KEY ("wts_contacto_id") REFERENCES "public"."wts_contacto" ("wts_contacto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_contacto_categoria_detalle" ADD CONSTRAINT "fk_wts_contacto_grupo_detalle_grupo" FOREIGN KEY ("wts_contacto_grupo_id") REFERENCES "public"."wts_contacto_categoria" ("wts_contacto_grupo_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_grupo" ADD CONSTRAINT "wts_grupo_wts_grupo_jid_key" UNIQUE ("wts_grupo_jid");
ALTER TABLE "wts_mensaje" ADD CONSTRAINT "fk_wts_mensaje_alerta" FOREIGN KEY ("wts_calendario_alerta_id") REFERENCES "public"."wts_calendario_alerta" ("wts_calendario_alerta_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_mensaje" ADD CONSTRAINT "fk_wts_mensaje_calendario" FOREIGN KEY ("wts_calendario_id") REFERENCES "public"."wts_calendario" ("wts_calendario_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_mensaje" ADD CONSTRAINT "fk_wts_mensaje_contacto" FOREIGN KEY ("wts_contacto_id") REFERENCES "public"."wts_contacto" ("wts_contacto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_mensaje" ADD CONSTRAINT "fk_wts_mensaje_plantilla" FOREIGN KEY ("wts_plantilla_id") REFERENCES "public"."wts_plantilla" ("wts_plantilla_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "wts_mensaje_log" ADD CONSTRAINT "fk_wts_mensaje_log_mensaje" FOREIGN KEY ("wts_mensaje_id") REFERENCES "public"."wts_mensaje" ("wts_mensaje_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER SEQUENCE "sis_perfil_acciones_sis_perfil_acciones_id_seq"
OWNED BY "sis_perfil_acciones"."sis_perfil_acciones_id";
SELECT setval('"sis_perfil_acciones_sis_perfil_acciones_id_seq"', 5, true);
ALTER SEQUENCE "sis_perfil_acciones_sis_perfil_acciones_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "sis_perfil_sis_perfil_id_seq"
OWNED BY "sis_perfil"."sis_perfil_id";
SELECT setval('"sis_perfil_sis_perfil_id_seq"', 1, true);
ALTER SEQUENCE "sis_perfil_sis_perfil_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "sis_usuario_sis_usuario_id_seq"
OWNED BY "sis_usuario"."sis_usuario_id";
SELECT setval('"sis_usuario_sis_usuario_id_seq"', 2, true);
ALTER SEQUENCE "sis_usuario_sis_usuario_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "wts_calendario_alerta_wts_calendario_alerta_id_seq"
OWNED BY "wts_calendario_alerta"."wts_calendario_alerta_id";
SELECT setval('"wts_calendario_alerta_wts_calendario_alerta_id_seq"', 1, false);
ALTER SEQUENCE "wts_calendario_alerta_wts_calendario_alerta_id_seq" OWNER TO "icfv";
ALTER SEQUENCE "wts_calendario_wts_calendario_id_seq"
OWNED BY "wts_calendario"."wts_calendario_id";
SELECT setval('"wts_calendario_wts_calendario_id_seq"', 1, false);
ALTER SEQUENCE "wts_calendario_wts_calendario_id_seq" OWNER TO "icfv";
ALTER SEQUENCE "wts_configuracion_wts_configuracion_id_seq"
OWNED BY "wts_configuracion"."wts_configuracion_id";
SELECT setval('"wts_configuracion_wts_configuracion_id_seq"', 1, false);
ALTER SEQUENCE "wts_configuracion_wts_configuracion_id_seq" OWNER TO "icfv";
ALTER SEQUENCE "wts_contacto_grupo_detalle_wts_contacto_grupo_detalle_id_seq"
OWNED BY "wts_contacto_categoria_detalle"."wts_contacto_grupo_detalle_id";
SELECT setval('"wts_contacto_grupo_detalle_wts_contacto_grupo_detalle_id_seq"', 1, false);
ALTER SEQUENCE "wts_contacto_grupo_detalle_wts_contacto_grupo_detalle_id_seq" OWNER TO "icfv";
ALTER SEQUENCE "wts_contacto_grupo_wts_contacto_grupo_id_seq"
OWNED BY "wts_contacto_categoria"."wts_contacto_grupo_id";
SELECT setval('"wts_contacto_grupo_wts_contacto_grupo_id_seq"', 1, false);
ALTER SEQUENCE "wts_contacto_grupo_wts_contacto_grupo_id_seq" OWNER TO "icfv";
ALTER SEQUENCE "wts_contacto_wts_contacto_id_seq"
OWNED BY "wts_contacto"."wts_contacto_id";
SELECT setval('"wts_contacto_wts_contacto_id_seq"', 1, false);
ALTER SEQUENCE "wts_contacto_wts_contacto_id_seq" OWNER TO "icfv";
ALTER SEQUENCE "wts_grupo_wts_grupo_id_seq"
OWNED BY "wts_grupo"."wts_grupo_id";
SELECT setval('"wts_grupo_wts_grupo_id_seq"', 1, false);
ALTER SEQUENCE "wts_grupo_wts_grupo_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "wts_mensaje_log_wts_mensaje_log_id_seq"
OWNED BY "wts_mensaje_log"."wts_mensaje_log_id";
SELECT setval('"wts_mensaje_log_wts_mensaje_log_id_seq"', 1, false);
ALTER SEQUENCE "wts_mensaje_log_wts_mensaje_log_id_seq" OWNER TO "icfv";
ALTER SEQUENCE "wts_mensaje_wts_mensaje_id_seq"
OWNED BY "wts_mensaje"."wts_mensaje_id";
SELECT setval('"wts_mensaje_wts_mensaje_id_seq"', 1, false);
ALTER SEQUENCE "wts_mensaje_wts_mensaje_id_seq" OWNER TO "icfv";
ALTER SEQUENCE "wts_plantilla_wts_plantilla_id_seq"
OWNED BY "wts_plantilla"."wts_plantilla_id";
SELECT setval('"wts_plantilla_wts_plantilla_id_seq"', 1, false);
ALTER SEQUENCE "wts_plantilla_wts_plantilla_id_seq" OWNER TO "icfv";

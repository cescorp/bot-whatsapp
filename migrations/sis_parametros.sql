

CREATE TABLE public.sis_parametros (
	sis_parametros_id serial4 NOT NULL,
	sis_parametros_nombre varchar(100) NOT NULL,
	sis_parametros_valor text NOT NULL,
	sis_parametros_descripcion varchar(255) NULL,
	user_crea varchar(100) DEFAULT 'SYSTEM'::character varying NOT NULL,
	fecha_crea timestamp DEFAULT now() NOT NULL,
	user_modifica varchar(100) NULL,
	fecha_modifica timestamp NULL,
	CONSTRAINT sis_parametros_pkey PRIMARY KEY (sis_parametros_id),
	CONSTRAINT sis_parametros_sis_parametros_nombre_key UNIQUE (sis_parametros_nombre)
);



INSERT INTO sis_parametros (sis_parametros_nombre, sis_parametros_valor, user_crea) VALUES
  ('ALERTA_EMAIL_HABILITADO',    '0',                  'SYSTEM'),
  ('ALERTA_EMAIL_DESTINATARIO',  'correo@ejemplo.com', 'SYSTEM'),
  ('ALERTA_DESCONEXION_CICLOS',  '3',                  'SYSTEM')
ON CONFLICT (sis_parametros_nombre) DO NOTHING;


UPDATE sis_parametros SET sis_parametros_descripcion = 'Activa o desactiva el envío de alertas por correo. Valores: 1=activo, 0=inactivo'
WHERE sis_parametros_nombre = 'ALERTA_EMAIL_HABILITADO';

UPDATE sis_parametros SET sis_parametros_descripcion = 'Correo electrónico que recibirá las alertas de desconexión de WhatsApp'
WHERE sis_parametros_nombre = 'ALERTA_EMAIL_DESTINATARIO';

UPDATE sis_parametros SET sis_parametros_descripcion = 'Número de ciclos consecutivos sin conexión antes de enviar la alerta por correo'
WHERE sis_parametros_nombre = 'ALERTA_DESCONEXION_CICLOS';
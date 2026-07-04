# Guía de Instalación — AlertaWTS

Guía paso a paso para instalar el sistema en un equipo nuevo desde cero.

---

## Requisitos previos

Instalar antes de continuar:

| Software | Versión | Descarga |
|---|---|---|
| Docker Desktop | Última | https://www.docker.com/products/docker-desktop |
| PostgreSQL | 18 | https://www.postgresql.org/download/windows |
| Git (opcional) | Última | https://git-scm.com |

> **Docker Desktop** debe estar corriendo con WSL2 activado antes de continuar.

---

## Paso 1 — Copiar el proyecto

Copiar la carpeta del proyecto al equipo nuevo. La ruta recomendada es:

```
C:\bot-whatsapp\
```

Verificar que la estructura quede así:

```
C:\bot-whatsapp\
├── src\
├── Dockerfile
├── docker-compose.yml
├── package.json
└── grupos.txt
```

---

## Paso 2 — Crear el archivo `.env`

En la raíz del proyecto crear el archivo `.env` con este contenido:

```env
# PostgreSQL
DB_HOST=host.docker.internal
DB_PORT=5432
DB_NAME=alerta_wts
DB_USER=postgres
DB_PASS=TU_CONTRASEÑA_POSTGRES

# Bot
INTERVALO_MINUTOS=1
VENTANA_MINUTOS=15

# API REST
PORT=3000
API_KEY=TU_CLAVE_SECRETA

# Panel Admin
JWT_SECRET=TU_CLAVE_JWT_SECRETA
JWT_EXPIRES=8h
```

> Reemplazar `TU_CONTRASEÑA_POSTGRES`, `TU_CLAVE_SECRETA` y `TU_CLAVE_JWT_SECRETA` con valores propios.
> Para las claves usa cadenas largas y difíciles de adivinar. Ejemplo: `aW13x9$kLp2#mNqR7vZu`

---

## Paso 3 — Configurar PostgreSQL

### 3.1 Permitir conexiones desde Docker

Abrir el archivo:
```
C:\Program Files\PostgreSQL\18\data\pg_hba.conf
```

Agregar esta línea al final:
```
host    all    postgres    172.17.0.0/16    scram-sha-256
```

Guardar el archivo.

### 3.2 Reiniciar el servicio PostgreSQL

Abrir PowerShell **como Administrador** y ejecutar:

```powershell
Restart-Service "postgresql-x64-18"
```

---

## Paso 4 — Crear la base de datos

Conectarse a PostgreSQL con DBeaver, pgAdmin o psql y ejecutar:

```sql
CREATE DATABASE alerta_wts
  WITH ENCODING 'UTF8'
  LC_COLLATE = 'Spanish_Ecuador.1252'
  LC_CTYPE   = 'Spanish_Ecuador.1252';
```

---

## Paso 5 — Ejecutar las migraciones SQL

Conectado a la base de datos `alerta_wts`, ejecutar los scripts en este orden:

### 5.1 Tablas base del sistema

Ejecutar el script principal de creación de tablas (proporcionado por el equipo de desarrollo).

### 5.2 Tabla de grupos WhatsApp

```sql
-- Grupos WhatsApp sincronizados desde Baileys
CREATE TABLE IF NOT EXISTS wts_grupo (
  wts_grupo_id     SERIAL PRIMARY KEY,
  wts_grupo_jid    VARCHAR(100) UNIQUE NOT NULL,
  wts_grupo_nombre VARCHAR(200) NOT NULL,
  wts_grupo_estado SMALLINT    DEFAULT 1,
  fecha_crea       TIMESTAMP   DEFAULT NOW(),
  fecha_modifica   TIMESTAMP
);

-- Columna de grupo destino en contactos (opcional por contacto)
ALTER TABLE wts_contacto
  ADD COLUMN IF NOT EXISTS wts_contacto_grupo_id INTEGER REFERENCES wts_grupo(wts_grupo_id);
```

### 5.3 Datos iniciales — usuario administrador del panel

```sql
-- Insertar usuario administrador (cambiar email y contraseña)
INSERT INTO wts_usuario (
  wts_usuario_nombre,
  wts_usuario_email,
  wts_usuario_password,
  wts_usuario_perfil,
  wts_usuario_estado,
  user_crea,
  fecha_crea
) VALUES (
  'Administrador',
  'cescorp@hotmail.es',
  '$2b$10$HASH_GENERADO',   -- ver nota abajo
  'admin',
  1,
  'INSTALACION',
  NOW()
);
```

> Para generar el hash de la contraseña ejecutar en PowerShell dentro de la carpeta del proyecto:
> ```powershell
> docker run --rm node:22-alpine node -e "require('bcryptjs').hash('TU_PASSWORD',10).then(console.log)"
> ```
> Copiar el resultado y reemplazar `$2b$10$HASH_GENERADO`.

### 5.4 Parámetros de configuración

```sql
INSERT INTO wts_configuracion (wts_configuracion_clave, wts_configuracion_valor, wts_configuracion_estado, user_crea, fecha_crea)
VALUES
  ('INTERVALO_MINUTOS', '1',  1, 'INSTALACION', NOW()),
  ('VENTANA_MINUTOS',   '15', 1, 'INSTALACION', NOW())
ON CONFLICT (wts_configuracion_clave) DO NOTHING;
```

---

## Paso 6 — Levantar el bot con Docker

Abrir PowerShell en la carpeta del proyecto:

```powershell
cd C:\bot-whatsapp
docker compose up --build
```

Esperar hasta ver en los logs:

```
API REST escuchando en puerto 3000
```

> La primera vez descarga la imagen de Node.js — puede tardar varios minutos según la velocidad de internet.

---

## Paso 7 — Vincular WhatsApp (escanear QR)

Al iniciar por primera vez, el bot genera un código QR. Abrirlo en Windows:

```powershell
start C:\bot-whatsapp\src\auth\qr.png
```

En el celular:
1. Abrir WhatsApp
2. Ir a **⋮ → Dispositivos vinculados → Vincular dispositivo**
3. Escanear el QR de la imagen

Cuando la vinculación sea exitosa, los logs mostrarán:

```
WhatsApp conectado
```

> El QR expira en ~60 segundos. Si expira, reiniciar el bot y abrir el archivo nuevamente.

---

## Paso 8 — Levantar en segundo plano

Una vez verificado que conecta correctamente, detener con `Ctrl+C` y levantar en modo daemon:

```powershell
docker compose up -d
```

Verificar que el contenedor esté corriendo:

```powershell
docker ps
```

---

## Paso 9 — Acceder al panel administrador

Abrir en el navegador:

```
http://localhost:3000/admin
```

Ingresar con el email y contraseña del usuario creado en el Paso 5.3.

---

## Paso 10 — Verificar funcionamiento completo

### Bot y API
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/estado" `
  -Headers @{"x-api-key"="TU_CLAVE_SECRETA"}
```

Respuesta esperada:
```json
{ "ok": true, "whatsapp": "conectado", "timestamp": "..." }
```

### Panel administrador
- Ir a **Contactos** → crear un contacto de prueba
- Ir a **Plantillas** → crear una plantilla de prueba
- Botón **Sincronizar grupos** → debe listar los grupos del número vinculado

---

## Carpetas creadas automáticamente

| Carpeta | Contenido |
|---|---|
| `src\auth\` | Sesión de WhatsApp — **no borrar en producción** |
| `log_errores\` | Logs de errores del panel admin por fecha |

---

## Recepción de mensajes entrantes (opcional)

Además de enviar, el bot puede **guardar en base de datos los mensajes que le escriben** a cualquier cuenta vinculada, incluyendo el chat "Yo" (self-chat).

### Activar/desactivar

Se controla desde `wts_configuracion`, sin reiniciar el bot:

```sql
UPDATE wts_configuracion SET wts_configuracion_valor = 'SI' WHERE wts_configuracion_clave = 'LEER_MENSAJES';
UPDATE wts_configuracion SET wts_configuracion_valor = 'SI' WHERE wts_configuracion_clave = 'LEER_MENSAJES_MARCAR_LEIDO';
```

| Clave | Valores | Efecto |
|---|---|---|
| `LEER_MENSAJES` | `SI` / `NO` | Activa/desactiva el guardado de mensajes entrantes |
| `LEER_MENSAJES_MARCAR_LEIDO` | `SI` / `NO` | Si `SI`, marca el mensaje como leído en WhatsApp (palomitas azules) |

### Tabla `wts_mensaje_recibido`

| Columna | Descripción |
|---|---|
| `wts_cuenta_id` | Cuenta WhatsApp que recibió el mensaje |
| `wts_mensaje_recibido_jid` | JID del remitente: número, grupo (`@g.us`), estado (`status@broadcast`) o identificador de privacidad (`@lid`) |
| `wts_mensaje_recibido_texto` | Texto del mensaje (`null` si no es texto) |
| `wts_mensaje_recibido_es_grupo` | `1` si viene de un grupo |
| `wts_mensaje_recibido_yo` | `1` si el mensaje es del propio chat "Yo" (self-chat) |
| `wts_mensaje_recibido_leido` | `1` si se marcó como leído en WhatsApp |

### Qué se ignora automáticamente

- Actualizaciones de Estado de WhatsApp (`status@broadcast`).
- Ecos de mensajes que el propio bot envía — excepto el chat "Yo", que sí se guarda con `wts_mensaje_recibido_yo = 1`.

> **Importante:** WhatsApp puede entregar el remitente en un formato nuevo de privacidad (`@lid`) en vez del número tradicional. El bot ya lo maneja automáticamente.

### ⚠️ Requiere reconstruir la imagen, no solo reiniciar

`whatsapp.js`, `db.js` e `index.js` no son volumen montado — se copian dentro de la imagen Docker en el build. Cualquier cambio en este flujo necesita:

```powershell
docker compose down
docker compose up -d --build
```

### Verificar que está guardando

```sql
SELECT wts_mensaje_recibido_jid, wts_mensaje_recibido_texto, wts_mensaje_recibido_yo, fecha_crea
FROM wts_mensaje_recibido
ORDER BY fecha_crea DESC
LIMIT 10;
```

---

## Comandos útiles post-instalación

```powershell
# Ver logs en vivo
docker logs -f bot-whatsapp

# Reiniciar el bot
docker compose restart

# Detener todo
docker compose down

# Reconstruir después de cambios en código fuente (no admin)
docker compose down
docker compose up --build -d
```

---

## Solución de problemas frecuentes

### El bot no conecta a PostgreSQL
Verificar que `pg_hba.conf` tenga la línea `172.17.0.0/16` y que el servicio PostgreSQL esté activo:
```powershell
Get-Service "postgresql-x64-18"
```

### El QR expiró antes de escanearlo
```powershell
docker compose restart
start C:\bot-whatsapp\src\auth\qr.png
```

### El panel muestra error 401
Verificar que `JWT_SECRET` esté definido en el `.env` y que el contenedor se haya reiniciado después de crearlo.

### Cambiar el número de WhatsApp vinculado
```powershell
docker compose down
Remove-Item "C:\bot-whatsapp\src\auth\*" -Recurse -Force
docker compose up -d
start C:\bot-whatsapp\src\auth\qr.png
```

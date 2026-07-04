# AvisosWTS — Bot de Avisos por WhatsApp

Bot automatizado que consulta mensajes programados en PostgreSQL y los envía por WhatsApp Web usando Baileys (conexión directa por WebSocket, sin navegador). Incluye API REST para integración con sistemas externos.

---

## Arquitectura

```
Sistema externo (ERP, CRM, app)
        ↓ HTTP + API Key
   API REST :3000
        ↓
   Node.js + Baileys          ← corre en Docker
        ├── Scheduler (cada N min)
        └── WebSocket directo a WhatsApp
        ↓
   PostgreSQL alerta_wts      ← corre en Windows local
```

---

## Requisitos previos

| Requisito | Versión | Notas |
|---|---|---|
| Docker Desktop | Última | Con WSL2 activado |
| PostgreSQL | 18 | Corriendo como servicio Windows |
| Driver ODBC | PostgreSQL Unicode(x64) | Para conexión local desde Windows |
| Node.js | No requerido | Corre dentro de Docker |

---

## Estructura del proyecto

```
C:\bot-whatsapp\
├── src\
│   ├── api\
│   │   ├── middleware\
│   │   │   └── auth.js          ← valida API Key en cada request
│   │   ├── routes\
│   │   │   ├── estado.js        ← GET /estado
│   │   │   ├── mensajes.js      ← GET/POST /mensajes
│   │   │   ├── mensajeDirecto.js← POST /mensaje-directo
│   │   │   ├── contactos.js     ← GET/POST /contactos
│   │   │   ├── plantillas.js    ← GET/POST /plantillas
│   │   │   ├── calendario.js    ← POST /calendario
│   │   │   └── grupos.js        ← GET /grupos
│   │   └── server.js            ← servidor Express, registra rutas
│   ├── auth\                    ← sesión WhatsApp (NO borrar en producción)
│   ├── db.js                    ← todas las consultas a PostgreSQL
│   ├── whatsapp.js              ← conexión Baileys, envío, grupos
│   ├── index.js                 ← punto de entrada, scheduler dinámico
│   └── logger.js                ← logs en consola con timestamp
├── .env                         ← configuración local (no subir a git)
├── Dockerfile
├── docker-compose.yml
├── package.json
└── grupos.txt                   ← caché de grupos WhatsApp
```

---

## Configuración — archivo `.env`

```env
# PostgreSQL
DB_HOST=host.docker.internal   # desde Docker apunta al Windows local
DB_PORT=5432
DB_NAME=alerta_wts
DB_USER=postgres
DB_PASS=****                   # contraseña de postgres

# Bot
INTERVALO_MINUTOS=1            # cada cuántos minutos revisa (respaldo si falla BD)
VENTANA_MINUTOS=15             # respaldo si falla BD

# API REST
PORT=3000
API_KEY=****                   # clave secreta para consumir la API
```

> Los valores de `INTERVALO_MINUTOS` y `VENTANA_MINUTOS` del `.env` son solo respaldo.
> Los valores reales se leen desde `wts_configuracion` en la BD en cada ciclo.

---

## Instalación desde cero

### 1. Permitir conexiones desde Docker a PostgreSQL

Agregar al final de `C:\Program Files\PostgreSQL\18\data\pg_hba.conf`:

```
host    all    postgres    172.17.0.0/16    scram-sha-256
```

Reiniciar el servicio (PowerShell como administrador):

```powershell
Restart-Service "postgresql-x64-18"
```

### 2. Crear DSN ODBC (solo para acceso desde Windows, no Docker)

```powershell
Add-OdbcDsn -Name "pg_alerta_wts" -DriverName "PostgreSQL Unicode(x64)" `
  -DsnType System `
  -SetPropertyValue @("Server=localhost","Port=5432","Database=alerta_wts")
```

### 3. Levantar el bot

```powershell
cd C:\bot-whatsapp
docker compose up --build
```

### 4. Escanear QR de WhatsApp

Al iniciar por primera vez aparece en los logs:
```
QR guardado en: /app/src/auth/qr.png
```

Abrir la imagen en Windows:
```powershell
start C:\bot-whatsapp\src\auth\qr.png
```

En el celular: **WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo** → escanear.

---

## Base de datos — `alerta_wts`

### Tablas principales

| Tabla | Descripción |
|---|---|
| `wts_contacto` | Destinatarios con número de celular y permiso WhatsApp |
| `wts_mensaje` | Cola de mensajes a enviar con fecha programada |
| `wts_mensaje_log` | Historial de cambios de estado por mensaje |
| `wts_plantilla` | Plantillas reutilizables con variables dinámicas |
| `wts_calendario` | Eventos con fecha que generan alertas automáticas |
| `wts_calendario_alerta` | Configuración de cuándo alertar antes del evento |
| `wts_configuracion` | Parámetros del sistema leídos en tiempo de ejecución |

---

### Estados de `wts_mensaje`

| Estado | Nombre | Descripción |
|---|---|---|
| `1` | Pendiente | Listo para enviar, el bot lo tomará en el próximo ciclo |
| `2` | En proceso | Reservado (no usado actualmente) |
| `3` | Enviado | El bot lo envió correctamente |
| `4` | Error | Falló el envío, ver `wts_mensaje_ultimo_error` |
| `5` | Cancelado | Cancelado por trigger (el evento fue modificado o eliminado) |

---

### Tipos de alerta en `wts_calendario_alerta`

| Tipo | Descripción | Ejemplo valor |
|---|---|---|
| `1` | Días antes del evento | `2` = 2 días antes a la misma hora |
| `2` | Horas antes del evento | `3` = 3 horas antes |
| `3` | Minutos antes del evento | `30` = 30 minutos antes |
| `4` | Hora fija el día del evento | `08:00` = ese día a las 08:00 |

---

### Parámetros en `wts_configuracion`

| Clave | Valor por defecto | Descripción |
|---|---|---|
| `INTERVALO_MINUTOS` | `1` | Cada cuántos minutos el bot revisa mensajes |
| `VENTANA_MINUTOS` | `15` | Rango hacia atrás para buscar pendientes |

Cambiar en caliente (sin reiniciar Docker):
```sql
UPDATE wts_configuracion
SET wts_configuracion_valor = '5'
WHERE wts_configuracion_clave = 'VENTANA_MINUTOS';
```

---

### Cómo funciona el trigger de calendario

Cuando se inserta o modifica un evento en `wts_calendario`, el trigger llama a `wts_generar_mensajes_calendario` que:

1. Cancela todos los mensajes pendientes del evento (estado → 5)
2. Recorre las alertas activas del evento
3. Calcula la `fecha_programada` según el tipo de alerta
4. Inserta un nuevo registro en `wts_mensaje` por cada alerta

**No requiere intervención del bot** — los mensajes ya aparecen listos en la cola.

---

### Variables de plantilla (`wts_plantilla`)

La plantilla es la estructura del mensaje. El bot reemplaza las variables con datos reales antes de enviar. Si una variable no está en la plantilla, ese dato simplemente no aparece.

| Variable | Origen en la BD | Campo en la consulta |
|---|---|---|
| `{{nombre}}` | `wts_contacto_nombres + apellidos` | `nombre` |
| `{{celular}}` | `wts_mensaje_destino` | `celular` |
| `{{mensaje}}` | `wts_mensaje_texto` | `mensaje` |
| `{{titulo}}` | `wts_calendario_titulo` | `titulo` |
| `{{fecha_evento}}` | `wts_calendario_fecha_evento` | `fecha_evento` |

Ejemplo de plantilla:
```
Hola {{nombre}}, te recordamos tu cita "{{titulo}}" programada para el {{fecha_evento}}.
```

---

## Cómo funciona la consulta principal y cómo modificarla

La consulta está en `src/db.js` función `obtenerPendientes()`. Cada campo que devuelve la consulta tiene un alias que el bot usa directamente:

```sql
SELECT
  m.wts_mensaje_id                AS id,           -- identificador único
  m.wts_mensaje_estado            AS estado,        -- estado actual
  m.wts_mensaje_destino           AS celular,       -- número destino WhatsApp
  m.wts_mensaje_texto             AS mensaje,       -- texto del mensaje o variable {{mensaje}}
  p.wts_plantilla_texto           AS plantilla_texto,-- estructura de la plantilla
  concat(c.wts_contacto_nombres,
    ' ', c.wts_contacto_apellidos) AS nombre,       -- variable {{nombre}}
  cal.wts_calendario_titulo       AS titulo,        -- variable {{titulo}}
  cal.wts_calendario_fecha_evento AS fecha_evento   -- variable {{fecha_evento}}
```

> **Regla importante:** si cambias el alias (`AS nombre`, `AS celular`, etc.) debes
> actualizar también la función `resolverTexto()` en `src/db.js` que los referencia
> como `fila.nombre`, `fila.celular`, `fila.mensaje`, etc.

### Agregar un campo nuevo a la consulta

1. Agregar el campo con alias en el `SELECT` de `obtenerPendientes()` en `src/db.js`
2. Agregar la variable nueva en `resolverTexto()` con `.replace(/\{\{mi_campo\}\}/g, fila.mi_campo || '')`
3. Usar `{{mi_campo}}` en la plantilla desde la BD

---

## Recepción de mensajes entrantes (opcional)

Además de enviar, el bot puede **guardar en base de datos los mensajes que le escriben** (a cualquier cuenta vinculada), incluyendo el chat "Yo" (self-chat).

### Activar/desactivar — `wts_configuracion`

Sin reiniciar el bot:

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
| `wts_mensaje_recibido_jid` | JID del remitente: `numero@s.whatsapp.net`, `numero@lid` (identificador de privacidad nuevo de WhatsApp), `grupo@g.us` o `status@broadcast` |
| `wts_mensaje_recibido_nombre` | pushName del remitente |
| `wts_mensaje_recibido_texto` | Texto del mensaje (`null` si no es texto: audio, sticker, etc.) |
| `wts_mensaje_recibido_es_grupo` | `1` si viene de un grupo |
| `wts_mensaje_recibido_yo` | `1` si el mensaje es del propio chat "Yo" (self-chat) |
| `wts_mensaje_recibido_leido` | `1` si se marcó como leído en WhatsApp |
| `wts_mensaje_recibido_fecha` | Fecha/hora original del mensaje según WhatsApp |

### Qué se ignora automáticamente

- Mensajes de Estados de WhatsApp (`status@broadcast`) — reacciones o publicaciones de estado de cualquier contacto.
- Ecos de mensajes que el propio bot envía (scheduler, API, panel) — llegan con `fromMe: true` y no se guardan como "recibidos", excepto el chat "Yo".
- El chat "Yo" (self-chat) sí se guarda con `wts_mensaje_recibido_yo = 1` aunque también venga con `fromMe: true` — se distingue comparando el JID contra `sock.authState.creds.me` (número y/o LID propio de la sesión), no contra un número fijo guardado en `wts_cuenta`.

> WhatsApp introdujo un identificador de privacidad (`@lid`) que reemplaza al número de teléfono (`@s.whatsapp.net`) en algunos mensajes entrantes. El listener en `src/whatsapp.js` ya maneja ambos formatos — no requiere configuración adicional.

### ⚠️ Este flujo requiere reconstruir la imagen

`whatsapp.js`, `db.js` e `index.js` **no** están montados como volumen en `docker-compose.yml` (solo `src/auth` y `src/admin` lo están) — se copian dentro de la imagen en el build. Cualquier cambio en este flujo necesita:

```powershell
docker compose up -d --build
```

Un simple `docker compose restart` **no** aplica cambios de código en estos archivos.

### Verificar que está guardando

```sql
SELECT wts_mensaje_recibido_jid, wts_mensaje_recibido_nombre, wts_mensaje_recibido_texto,
       wts_mensaje_recibido_yo, wts_mensaje_recibido_fecha
FROM wts_mensaje_recibido
ORDER BY fecha_crea DESC
LIMIT 10;
```

```powershell
docker logs bot-whatsapp -f | Select-String "Mensaje recibido guardado"
```

---

## Comandos Docker

```powershell
# Levantar en segundo plano
docker compose up -d

# Ver logs en vivo
docker logs -f bot-whatsapp

# Reiniciar (aplica cambios de código sin reconstruir)
docker compose restart bot

# Reconstruir imagen completa (cuando cambia package.json o Dockerfile)
docker compose down
docker compose build --no-cache
docker compose up -d

# Detener todo
docker compose down
```

---

## Gestión de sesión WhatsApp

### Ver archivos de sesión
```powershell
Get-ChildItem C:\bot-whatsapp\src\auth
```

### Cerrar sesión actual
Desde el celular: **WhatsApp → ⋮ → Dispositivos vinculados → seleccionar dispositivo → Cerrar sesión**

O desde PowerShell (fuerza cierre borrando la sesión):
```powershell
docker compose down
Remove-Item "C:\bot-whatsapp\src\auth\*" -Recurse -Force
```

### Abrir sesión con otro número WhatsApp
```powershell
# 1. Detener el bot
docker compose down

# 2. Borrar sesión anterior
Remove-Item "C:\bot-whatsapp\src\auth\*" -Recurse -Force

# 3. Levantar el bot — generará QR nuevo
docker compose up

# 4. Abrir QR y escanear con el nuevo número
start C:\bot-whatsapp\src\auth\qr.png
```

### Listar grupos del número activo
```powershell
docker compose run --rm bot node src/index.js --listar-grupos
```
El resultado queda en `C:\bot-whatsapp\grupos.txt`.

---

## API REST

**Base URL:** `http://localhost:3000`

### Configurar la API Key

La API Key se define en el archivo `.env` del proyecto:

```env
API_KEY=clave-secreta-bot-2026
```

Para cambiarla edita ese valor y reinicia el contenedor:
```powershell
docker compose restart bot
```

Cada sistema externo que consuma la API debe enviarla en el header `x-api-key` en **todas** las peticiones:

```
x-api-key: clave-secreta-bot-2026
```

> En producción usa una clave larga y difícil de adivinar. Ejemplo:
> `API_KEY=aW13x9$kLp2#mNqR7vZu`

---

### Rutas disponibles

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/estado` | Health check — verifica bot y API |
| `GET` | `/contactos` | Lista contactos activos |
| `POST` | `/contactos` | Crea un contacto nuevo |
| `GET` | `/plantillas` | Lista plantillas activas |
| `POST` | `/plantillas` | Crea una plantilla nueva |
| `POST` | `/mensajes` | Crea un mensaje en la cola (envío diferido) |
| `GET` | `/mensajes/:id` | Consulta estado de un mensaje |
| `POST` | `/mensaje-directo` | Envía de inmediato sin pasar por el scheduler |
| `POST` | `/calendario` | Crea evento con alertas automáticas |
| `GET` | `/grupos` | Lista grupos WhatsApp del número activo |

> Todas requieren el header `x-api-key`. Desde el navegador siempre dará `401` — usar PowerShell, Postman o Thunder Client.

---

**Autenticación:** header `x-api-key: TU_API_KEY` en todos los endpoints.

### GET `/estado`
Verifica si el bot y la API están funcionando.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/estado" `
  -Headers @{"x-api-key"="TU_API_KEY"}
```

**Response:**
```json
{ "ok": true, "whatsapp": "conectado", "timestamp": "2026-06-22T17:00:00.000Z" }
```

---

### GET `/contactos`
Lista todos los contactos activos.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/contactos" `
  -Headers @{"x-api-key"="TU_API_KEY"}
```

**Response:**
```json
{
  "ok": true,
  "total": 2,
  "contactos": [
    { "id": 1, "nombres": "Juan", "apellidos": "Pérez", "celular": "593984103258",
      "correo": null, "permite_whatsapp": 1, "estado": 1 }
  ]
}
```

---

### POST `/contactos`
Crea un nuevo contacto.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/contactos" -Method POST `
  -Headers @{"x-api-key"="TU_API_KEY"; "Content-Type"="application/json"} `
  -Body '{"nombres":"Ana","apellidos":"Gómez","celular":"593991234567","correo":"ana@ejemplo.com","permite_whatsapp":1}'
```

**Body:**
```json
{
  "nombres": "Ana",
  "apellidos": "Gómez",
  "celular": "593991234567",
  "correo": "ana@ejemplo.com",
  "permite_whatsapp": 1
}
```

**Response:**
```json
{ "ok": true, "id": 3 }
```

---

### GET `/plantillas`
Lista plantillas activas.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/plantillas" `
  -Headers @{"x-api-key"="TU_API_KEY"}
```

**Response:**
```json
{
  "ok": true,
  "total": 1,
  "plantillas": [
    { "id": 1, "nombre": "Recordatorio cita", "texto": "Hola {{nombre}}, tu cita es el {{fecha_evento}}.", "tipo": 1 }
  ]
}
```

---

### POST `/plantillas`
Crea una nueva plantilla.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/plantillas" -Method POST `
  -Headers @{"x-api-key"="TU_API_KEY"; "Content-Type"="application/json"} `
  -Body '{"nombre":"Recordatorio cita","texto":"Hola {{nombre}}, tienes pendiente: {{titulo}} el {{fecha_evento}}."}'
```

**Body:**
```json
{
  "nombre": "Recordatorio cita",
  "texto": "Hola {{nombre}}, tienes pendiente: {{titulo}} el {{fecha_evento}}."
}
```

**Response:**
```json
{ "ok": true, "id": 1 }
```

---

### POST `/mensaje-directo`
Envía un mensaje de inmediato sin esperar el ciclo del scheduler. Si el bot está desconectado responde `503`.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/mensaje-directo" -Method POST `
  -Headers @{"x-api-key"="TU_API_KEY"; "Content-Type"="application/json"} `
  -Body '{"destino":"593984103258@s.whatsapp.net","texto":"Mensaje urgente enviado al instante","cuenta_id":1}'
```

**Body:**
```json
{
  "destino": "593984103258@s.whatsapp.net",
  "texto": "Mensaje urgente enviado al instante",
  "cuenta_id": 1,
  "contacto_id": 42
}
```

> `cuenta_id` y `contacto_id` son opcionales (default: `1` y `null`).

**Response:**
```json
{ "ok": true, "id": 21, "cuenta_id": 1, "destino": "593984103258@s.whatsapp.net" }
```

---

### POST `/mensajes`
Crea un mensaje puntual en la cola (envío diferido).

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/mensajes" -Method POST `
  -Headers @{"x-api-key"="TU_API_KEY"; "Content-Type"="application/json"} `
  -Body '{"contacto_id":1,"destino":"593984103258","texto":"Hola, este es un aviso.","fecha_programada":"2026-06-22T23:00:00","prioridad":5}'
```

**Body:**
```json
{
  "contacto_id": 1,
  "destino": "593984103258",
  "texto": "Hola, este es un aviso.",
  "fecha_programada": "2026-06-22T23:00:00",
  "prioridad": 5,
  "plantilla_id": null
}
```

> Para enviar a un grupo usar el ID del grupo como `destino`: `"120363XXXXXX@g.us"`

**Response:**
```json
{ "ok": true, "id": 20 }
```

---

### GET `/mensajes/:id`
Consulta el estado de un mensaje. Reemplazar `:id` con el número del mensaje.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/mensajes/20" `
  -Headers @{"x-api-key"="TU_API_KEY"}
```

**Response:**
```json
{
  "ok": true,
  "mensaje": {
    "id": 20,
    "destino": "593984103258",
    "texto": "Hola, este es un aviso.",
    "estado": 3,
    "fecha_programada": "2026-06-22T23:00:00",
    "fecha_envio": "2026-06-22T23:00:45",
    "intentos": 1,
    "ultimo_error": null
  }
}
```

---

### POST `/calendario`
Crea un evento con alertas. Los mensajes se generan automáticamente por trigger.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/calendario" -Method POST `
  -Headers @{"x-api-key"="TU_API_KEY"; "Content-Type"="application/json"} `
  -Body '{
    "contacto_id": 1,
    "titulo": "Reunion de directorio",
    "descripcion": "Sala de conferencias piso 3",
    "fecha_evento": "2026-06-29T09:00:00",
    "plantilla_id": null,
    "alertas": [
      { "tipo": 1, "valor": 1, "prioridad": 5 },
      { "tipo": 2, "valor": 2, "prioridad": 5 },
      { "tipo": 4, "valor": "08:00", "prioridad": 3 }
    ]
  }'
```

**Body:**
```json
{
  "contacto_id": 1,
  "titulo": "Reunión de directorio",
  "descripcion": "Sala de conferencias piso 3",
  "fecha_evento": "2026-06-29T09:00:00",
  "plantilla_id": 1,
  "alertas": [
    { "tipo": 1, "valor": 1, "prioridad": 5 },
    { "tipo": 2, "valor": 2, "prioridad": 5 },
    { "tipo": 4, "valor": "08:00", "prioridad": 3 }
  ]
}
```

**Response:**
```json
{ "ok": true, "calendario_id": 5 }
```

---

### GET `/grupos`
Lista los grupos WhatsApp del número conectado. Refresca el archivo `grupos.txt`.

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/grupos" `
  -Headers @{"x-api-key"="TU_API_KEY"}
```

**Response:**
```json
{
  "ok": true,
  "total": 3,
  "grupos": [
    { "nombre": "Sistemas HENTEL", "id": "120363XXXXXX@g.us" },
    { "nombre": "Familia", "id": "120363YYYYYY@g.us" }
  ]
}
```

---

## Consultas de mantenimiento

### Ver mensajes pendientes
```sql
SELECT wts_mensaje_id, wts_mensaje_destino, wts_mensaje_texto,
       wts_mensaje_fecha_programada, wts_mensaje_estado
FROM wts_mensaje
WHERE wts_mensaje_estado = 1
ORDER BY wts_mensaje_fecha_programada;
```

### Ver mensajes con error
```sql
SELECT wts_mensaje_id, wts_mensaje_destino,
       wts_mensaje_intentos, wts_mensaje_ultimo_error, fecha_modifica
FROM wts_mensaje
WHERE wts_mensaje_estado = 4
ORDER BY fecha_modifica DESC;
```

### Reintentar mensajes fallidos
```sql
UPDATE wts_mensaje
SET wts_mensaje_estado   = 1,
    wts_mensaje_intentos = 0,
    user_modifica        = 'MANUAL',
    fecha_modifica       = NOW()
WHERE wts_mensaje_estado = 4;
```

### Cancelar un mensaje pendiente
```sql
UPDATE wts_mensaje
SET wts_mensaje_estado = 5,
    user_modifica      = 'MANUAL',
    fecha_modifica     = NOW()
WHERE wts_mensaje_id = 99;
```

### Ver historial de un mensaje
```sql
SELECT wts_mensaje_log_estado_anterior AS de,
       wts_mensaje_log_estado_nuevo    AS a,
       wts_mensaje_log_descripcion     AS descripcion,
       wts_mensaje_log_fecha           AS fecha
FROM wts_mensaje_log
WHERE wts_mensaje_id = 99
ORDER BY wts_mensaje_log_fecha;
```

### Limpiar logs antiguos (más de 30 días)
```sql
DELETE FROM wts_mensaje_log
WHERE fecha_crea < NOW() - INTERVAL '30 days';
```

---

## Errores comunes y soluciones

### El bot no conecta a PostgreSQL
**Error en logs:** `Error consultando la BD` / `ECONNREFUSED`

**Causa:** PostgreSQL no acepta conexiones desde Docker.

**Solución:**
1. Verificar que `pg_hba.conf` tenga la línea `172.17.0.0/16`
2. Reiniciar el servicio PostgreSQL como administrador:
```powershell
Restart-Service "postgresql-x64-18"
```

---

### El puerto 3000 no responde
**Error:** `No es posible conectar con el servidor remoto`

**Causa:** El contenedor se levantó sin reconstruir la imagen nueva.

**Solución:**
```powershell
docker compose down
 
```

Verificar que el puerto aparezca mapeado:
```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

---

### Error al instalar dependencias en Docker — `spawn git`
**Error:** `npm error syscall spawn git`

**Causa:** La imagen Alpine no incluye `git` y Baileys lo necesita para instalar.

**Solución:** El `Dockerfile` ya incluye `RUN apk add --no-cache git python3 make g++`. Si el error persiste forzar rebuild:
```powershell
docker compose build --no-cache
```

---

### El QR de WhatsApp sale distorsionado en la terminal Docker
**Causa:** La terminal de Docker no renderiza bien caracteres especiales del QR.

**Solución:** El bot genera automáticamente `src/auth/qr.png`. Abrirlo en Windows:
```powershell
start C:\bot-whatsapp\src\auth\qr.png
```

---

### La API devuelve `401 Unauthorized`
**Causa:** Falta el header `x-api-key` o el valor no coincide con el `.env`.

**Solución:** Verificar que el header esté presente y coincida exactamente con `API_KEY` del `.env`.

---

### La API devuelve `500` al crear mensaje o contacto
**Causa:** Campo obligatorio faltante o tipo de dato incorrecto.

**Solución:** Revisar que el body incluya los campos requeridos. Ver tabla de cada endpoint.
Para mensajes: `contacto_id`, `destino`, `fecha_programada` son obligatorios.
Para contactos: `nombres`, `celular` son obligatorios.

---

### El bot envía mensajes pero no actualiza el estado en BD
**Causa:** Error de conexión a PostgreSQL al momento del UPDATE.

**Solución:** Ver logs del contenedor:
```powershell
docker logs -f bot-whatsapp
```
Buscar líneas con `Error al enviar` — el campo `wts_mensaje_ultimo_error` en la BD tendrá el detalle.

---

### WhatsApp cierra la sesión inesperadamente
**Causa:** WhatsApp detectó actividad inusual o se cerró desde el celular.

**Señal en logs:** `Sesión cerrada — escanea QR de nuevo`

**Solución:**
```powershell
docker compose down
Remove-Item "C:\bot-whatsapp\src\auth\*" -Recurse -Force
docker compose up -d
start C:\bot-whatsapp\src\auth\qr.png
```

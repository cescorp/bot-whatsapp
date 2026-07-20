# Contexto del proyecto — bot-whatsapp

> Documento generado para dar contexto a herramientas de IA sobre la arquitectura y el flujo de datos del sistema. No es documentación de usuario final.

## Qué es

Bot de envío de mensajes de WhatsApp (Node.js + Baileys) respaldado por PostgreSQL, con:
- Un **worker/scheduler** que envía mensajes pendientes desde una tabla de cola (`wts_mensaje`).
- Una **API REST** (con API key) para integraciones externas (crear mensajes, contactos, plantillas, calendario).
- Un **panel administrativo** (HTML + AdminLTE + API con JWT) para gestión manual desde navegador.
- **Triggers en PostgreSQL** que generan mensajes automáticamente a partir de eventos de calendario y sus alertas.

## Stack

- Node.js, Express
- `@whiskeysockets/baileys` — cliente de WhatsApp (multi-device, sesión persistida en `src/auth/`)
- PostgreSQL (`pg`) — cola de mensajes, contactos, plantillas, calendario, usuarios admin
- `pino` — logging
- `bcrypt` + `jsonwebtoken` — auth del panel admin
- Docker / docker-compose para despliegue

## Punto de entrada

`src/index.js` es el único proceso. Al arrancar:

```
main()
 ├─ si --listar-grupos → conecta WhatsApp, espera 6s, exporta grupos.txt, exit
 └─ modo normal:
     ├─ iniciarAPI()      → levanta Express en :3000 (API REST + panel admin)
     ├─ iniciarBot()      → conecta socket de WhatsApp (Baileys)
     ├─ espera 5s (deja estabilizar la conexión)
     └─ scheduler()       → loop infinito de envío de pendientes
```

## Flujo 1 — Ciclo del scheduler (envío de mensajes)

Este es el flujo central y se repite indefinidamente mientras el proceso viva.

```
┌─────────────────────────────────────────────────────────────────┐
│ scheduler()  [src/index.js]                                     │
│                                                                   │
│  1. procesarPendientes()                                        │
│       │                                                          │
│       ├─ estaConectado()? ──No──► log warn, salir del ciclo      │
│       │        │Sí                                               │
│       │        ▼                                                 │
│       ├─ obtenerPendientes()  [src/db.js]                       │
│       │     - lee VENTANA_MINUTOS desde wts_configuracion        │
│       │     - SELECT wts_mensaje WHERE estado=1 (Pendiente)      │
│       │       AND fecha_programada BETWEEN NOW()-ventana AND NOW │
│       │       LEFT JOIN contacto / plantilla / calendario        │
│       │       ORDER BY prioridad DESC, fecha_programada ASC      │
│       │     - resolverTexto(): arma texto final                  │
│       │         · si hay plantilla activa → reemplaza {{vars}}   │
│       │         · si no → usa wts_mensaje_texto o saludo default │
│       │                                                          │
│       ├─ por cada mensaje pendiente:                             │
│       │     ├─ enviarMensaje(celular, textoFinal) [whatsapp.js]  │
│       │     │     - normaliza destino a JID                      │
│       │     │       (número → @s.whatsapp.net, o usa @g.us tal   │
│       │     │        cual si ya viene con sufijo — grupos)       │
│       │     │     - sock.sendMessage(jid, { text })              │
│       │     │                                                    │
│       │     ├─ éxito → marcarEnviado(id)                         │
│       │     │     UPDATE estado=3 (Enviado) + log en              │
│       │     │     wts_mensaje_log                                │
│       │     │                                                    │
│       │     └─ error → marcarError(id, err)                      │
│       │           UPDATE estado=4 (Error), intentos+1,           │
│       │           ultimo_error + log en wts_mensaje_log          │
│       │                                                          │
│  2. lee INTERVALO_MINUTOS desde wts_configuracion (o .env)       │
│  3. setTimeout(scheduler, minutos * 60000)  ──► vuelve al paso 1 │
└─────────────────────────────────────────────────────────────────┘
```

**Estados de `wts_mensaje_estado`:** `1=Pendiente, 2=Procesando, 3=Enviado, 4=Error, 5=Cancelado`

**Puntos clave:**
- El intervalo del ciclo y la ventana de búsqueda de pendientes se leen de la tabla `wts_configuracion` en cada vuelta — se pueden cambiar en caliente sin reiniciar el bot.
- Si WhatsApp está desconectado, el ciclo simplemente se salta (no se pierden mensajes, siguen `Pendiente`).
- Baileys reconecta solo (`connection.update` → `close` → `setTimeout(iniciarBot, 5000)`), salvo que el código de desconexión sea `loggedOut`, en cuyo caso hay que reescanear el QR (se regenera `src/auth/qr.png`).

## Flujo 2 — Generación automática de mensajes desde el Calendario (`generarMensajes()` en `src/db.js`)

> Este flujo **antes** vivía dentro de PostgreSQL como triggers (`trg_wts_calendario_alerta_ai/au/ad` → `wts_generar_mensajes_calendario()`). Se eliminaron: no soportaban repetición (diario/semanal/mensual), y al ser `DEFERRABLE INITIALLY DEFERRED` se disparaban en el COMMIT y **cancelaban/reemplazaban** lo que la generación en JS ya había creado correctamente. Ahora todo pasa por una sola función de Node, `generarMensajes(calendarioId, client)`.

```
Se crea/edita un evento (panel admin, API externa, o comando "recordatorio" del chat "Yo")
        │
        ▼
INSERT/UPDATE en wts_calendario + wts_calendario_alerta
  (dentro de la misma transacción del caller)
        │
        ▼
await generarMensajes(calendarioId, client)   ← src/db.js, llamado explícitamente
        │
        ├─ resuelve destino:
        │     · contacto asociado → celular_principal
        │     · grupo asociado    → wts_grupo_jid
        │     · destino libre     → wts_calendario_destino_libre
        │     · nada válido       → no genera nada
        │
        ├─ arma texto: wts_calendario_mensaje_texto
        │     o fallback "Recordatorio: {titulo}"
        │
        ├─ cancela mensajes pendientes previos de este calendario
        │     (estado → 5, excepto ya Enviados/Cancelados)
        │
        ├─ arma la lista de fechas del evento según repetición:
        │     wts_calendario_repeticion: 0=ninguna, 1=diario, 2=semanal, 3=mensual
        │     suma día/semana/mes desde wts_calendario_fecha_evento hasta
        │     wts_calendario_repeticion_fin (obligatorio si repeticion != 0)
        │
        └─ por cada fecha × cada wts_calendario_alerta activa del evento:
              calcula fecha de disparo según tipo de alerta
                (0=en el momento, 1=días antes, 2=horas antes,
                 3=minutos antes, 4=hora fija del día)
              INSERT INTO wts_mensaje (estado=1, tipo=2 Calendario,
                                       origen=2, prioridad de la alerta)

DELETE de un evento (panel admin)
        │
        └─ UPDATE wts_mensaje SET estado=5 WHERE calendario_id=X AND estado NOT IN (3,5)
              (cancelación explícita en el propio endpoint, sin trigger)
```

**Dónde se llama `generarMensajes()` hoy:**

| Origen | Archivo |
|---|---|
| Panel admin — crear/editar evento | `src/admin/servidor/rutas/calendario.js` |
| API externa — `POST /calendario` | `src/api/routes/calendario.js` |
| Comando "recordatorio" del chat "Yo" | `crearRecordatorioDesdeComando()` en `src/db.js` |

Cualquier código nuevo que inserte o modifique `wts_calendario`/`wts_calendario_alerta` **debe llamar a `generarMensajes()` explícitamente** — no hay nada automático en la base de datos que lo haga.

Estos mensajes caen directamente en `wts_mensaje` con `estado=1`, así que el **Flujo 1** (scheduler) los recoge y envía normalmente en su siguiente ciclo dentro de la ventana configurada.

## Flujo 3 — API REST externa (integraciones, protegida con API key)

`src/api/server.js` monta rutas bajo `apiKey` middleware (`x-api-key` header, `src/api/middleware/auth.js`).

```
Cliente externo
   │  header: x-api-key
   ▼
Express app (puerto 3000)
   ├─ GET  /estado                → estado de conexión de WhatsApp
   ├─ POST /mensajes              → inserta un mensaje puntual en la cola (estado=1, origen=API)
   ├─ GET  /mensajes/:id          → consulta estado/resultado de un mensaje
   ├─ POST /mensaje-directo       → envía de inmediato sin pasar por el scheduler (estado=2)
   ├─ GET  /contactos             → lista contactos
   ├─ POST /contactos             → crea contacto
   ├─ GET  /plantillas            → lista plantillas activas
   ├─ POST /plantillas            → crea plantilla
   ├─ POST /calendario            → crea evento de calendario (dispara Flujo 2)
   └─ GET  /grupos                → lista grupos de WhatsApp conocidos
```

Un `POST /mensajes` o `POST /calendario` exitoso termina insertando filas que el **Flujo 1** procesará en su próximo ciclo.

Un `POST /mensaje-directo` llama a `enviarMensaje()` en el acto y registra el mensaje con estado `2` (enviado). Si el bot está desconectado responde `503` inmediatamente sin encolar nada.

## Flujo 4 — Panel administrativo (uso humano, protegido con JWT)

Montado en `/admin` (`src/admin/servidor/index.js`), sirve HTML estático (AdminLTE) + una sub-API JSON.

```
Navegador
   │
   ▼
GET /admin  → login.html
   │
   ▼
POST /admin/api/auth/login  (rutas/auth.js)
   ├─ valida email/clave contra sis_usuario (bcrypt)
   ├─ carga permisos desde sis_perfil_acciones (por módulo: ver/crear/editar/eliminar)
   └─ firma JWT (jwt.sign, expira 8h) con { id, nombre, perfil, permisos }
        │
        ▼
Cliente guarda el token y lo manda como "Authorization: Bearer <token>"
        │
        ▼
Rutas protegidas por verificarJWT (middleware/jwt.js):
   ├─ /admin/api/dashboard   → métricas resumen
   ├─ /admin/api/contactos   → CRUD + importación masiva (hasta 5MB JSON)
   ├─ /admin/api/mensajes    → listado, detalle, reenvío manual (PUT /:id/reenviar)
   ├─ /admin/api/plantillas  → CRUD
   ├─ /admin/api/calendario  → CRUD de eventos + alertas (dispara Flujo 2) y ver sus mensajes generados
   ├─ /admin/api/reportes    → reportes/estadísticas
   └─ /admin/api/grupos      → listar / sincronizar grupos de WhatsApp (sync contra Baileys)

Páginas HTML del panel: index, contactos, mensajes, plantillas, calendario, reportes
(src/admin/*.html + assets/js/{app,auth,config}.js)
```

Cualquier alta/edición hecha desde el panel (mensaje manual, evento de calendario) termina en las mismas tablas que consume el **Flujo 1**.

## Flujo 5 — Sincronización de grupos de WhatsApp

```
node src/index.js --listar-grupos
   │
   ├─ iniciarBot() (conecta Baileys, reutiliza sesión de src/auth/)
   ├─ espera 6s a que estabilice
   ├─ listarGrupos() [whatsapp.js]
   │     - sock.groupFetchAllParticipating()
   │     - ordena por nombre
   │     - escribe grupos.txt (nombre + jid) — archivo de referencia humana
   └─ exit
```

También existe `POST /admin/api/grupos/sync` que hace lo mismo en caliente contra la tabla `wts_grupo` (sin reiniciar el proceso), para que los eventos de calendario puedan apuntar a un `wts_grupo_id`.

## Modelo de datos (resumen, ver `migrations/base.sql` para el detalle completo)

| Tabla | Rol |
|---|---|
| `wts_mensaje` | Cola de envío. Es el centro de todo — la escriben la API, el panel admin y `generarMensajes()` (calendario); la lee y actualiza el scheduler. |
| `wts_mensaje_log` | Auditoría de cambios de estado de cada mensaje. |
| `wts_contacto` | Personas/empresas destinatarias. `permite_whatsapp` y `estado` filtran si el bot puede enviarles. |
| `wts_plantilla` | Plantillas reutilizables con variables `{{nombre}} {{celular}} {{mensaje}} {{titulo}} {{fecha_evento}}`. |
| `wts_calendario` | Eventos que disparan generación automática de mensajes (recordatorios). |
| `wts_calendario_alerta` | Reglas de "cuándo avisar" antes/después de un evento (días/horas/minutos antes, o hora fija). |
| `wts_grupo` | Catálogo de grupos de WhatsApp (jid + nombre) para usar como destino en calendario. |
| `wts_configuracion` | Parámetros globales leídos en caliente por el bot (`INTERVALO_MINUTOS`, `VENTANA_MINUTOS`). |
| `sis_usuario` / `sis_perfil` / `sis_perfil_acciones` | Usuarios y permisos del panel administrativo (no relacionado con WhatsApp en sí). |

## Variables de entorno relevantes (`.env`)

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` — conexión PostgreSQL
- `PORT` — puerto de la API/panel (default 3000)
- `API_KEY` — clave requerida en header `x-api-key` para la API REST externa
- `JWT_SECRETO` — firma de tokens del panel admin
- `INTERVALO_MINUTOS`, `VENTANA_MINUTOS` — defaults del scheduler si no están en `wts_configuracion`

## Persistencia de sesión de WhatsApp

`src/auth/` contiene las credenciales multi-dispositivo de Baileys (`creds.json`, `pre-key-*.json`, `app-state-sync-*.json`) y el QR generado (`qr.png`). Se monta como volumen en Docker para sobrevivir reinicios del contenedor — si se pierde, hay que re-escanear el QR.

## Resumen del flujo end-to-end

```
Origen del mensaje                         Cola                    Envío
──────────────────                        ─────                   ─────
API externa (POST /mensajes)      ─┐
Panel admin (crear mensaje)       ─┤
Panel admin/API (crear evento     ─┼──►  wts_mensaje (estado=1) ──► scheduler (cada N min)
  calendario → generarMensajes()      │                                  │
  crea N mensajes por fecha×alerta)─┘                                  ├─ WhatsApp (Baileys)
                                                                        ├─ marcarEnviado (estado=3)
                                                                        └─ marcarError   (estado=4)
```



## Resumen del flujo alerta por correo/mail desconexion
scheduler() — cada ciclo
  │
  ├─ estaConectado() = true  → reinicia contador a 0
  │
  └─ estaConectado() = false
        │
        ├─ ciclos_sin_conexion++
        │
        └─ ciclos_sin_conexion >= ALERTA_DESCONEXION_CICLOS ?
              │
              ├─ No → log warn, continúa
              │
              └─ Sí → leer ALERTA_EMAIL_HABILITADO de sis_parametros
                          │
                          ├─ '0' → no hace nada
                          │
                          └─ '1' → enviar correo via nodemailer
                                    (SMTP desde .env, destino desde sis_parametros)
                                    → reinicia contador (no spamear)
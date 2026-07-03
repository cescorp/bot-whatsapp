# CLAUDE.md — Reglas y contexto del proyecto bot-whatsapp

Documento de referencia para herramientas de IA. Leer completo antes de tocar cualquier archivo.

---

## Qué es este proyecto

Bot de WhatsApp (Node.js + Baileys + PostgreSQL) con:
- **Scheduler** que envía mensajes pendientes desde una cola en BD
- **API REST** protegida con API key para integraciones externas
- **Panel admin** (AdminLTE) protegido con JWT para gestión manual
- **Triggers en PostgreSQL** que generan mensajes automáticamente desde el calendario

Corre en **Docker** sobre Windows. PostgreSQL corre en el **Windows host** (no en Docker).

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22 (Alpine, en Docker) |
| WhatsApp | `@whiskeysockets/baileys` (multi-device, WebSocket directo) |
| Base de datos | PostgreSQL 18 (servicio Windows local) |
| API / Panel | Express 4 |
| Auth panel | JWT (`jsonwebtoken`) + `bcrypt` |
| Auth API externa | Header `x-api-key` |
| Frontend panel | AdminLTE 3 + Bootstrap 4 + jQuery |
| Logs | `pino` |
| Contenedor | Docker Desktop con WSL2 |

---

## Archivos clave

```
src/
├── index.js          ← punto de entrada, scheduler dinámico
├── whatsapp.js       ← conexión Baileys, enviarMensaje(), listarGrupos()
├── db.js             ← todas las queries PostgreSQL
├── logger.js         ← pino logger
├── api/
│   ├── server.js     ← servidor Express, monta rutas API y panel
│   ├── middleware/auth.js  ← valida x-api-key
│   └── routes/       ← estado, mensajes, contactos, plantillas, calendario, grupos
└── admin/
    ├── servidor/
    │   ├── index.js  ← sirve HTML estático + sub-API JSON con JWT
    │   ├── middleware/jwt.js
    │   └── rutas/    ← dashboard, contactos, mensajes, plantillas, calendario, reportes, grupos
    └── *.html        ← páginas del panel (AdminLTE)
```

---

## Reglas críticas — NO romper

### Base de datos y fechas

- **Zona horaria:** PostgreSQL tiene `timezone = 'America/Guayaquil'`. Siempre usar `TO_CHAR(campo, 'YYYY-MM-DD"T"HH24:MI')` para devolver fechas al frontend. **Nunca** dejar que el driver `pg` convierta `TIMESTAMP WITHOUT TIME ZONE` a JS Date — lo trata como UTC y desplaza la hora.
- **Comparar fechas:** comparar como strings (`actual.fecha_local !== fecha_evento.slice(0,16)`), no con `new Date()` ni `.getTime()`. El desfase UTC-5 genera falsos positivos.
- **Mensajes enviados y cancelados:** los estados `3 (Enviado)` y `5 (Cancelado)` son **intocables**. Ninguna operación de actualización masiva debe incluirlos. Siempre filtrar con `AND wts_mensaje_estado NOT IN (3, 5)`.

### Trigger de calendario (PostgreSQL)

- Los triggers `trg_wts_calendario_alerta_ai/au/ad` se disparan en `wts_calendario_alerta` y llaman a `wts_generar_mensajes_calendario()`.
- Esa función **cancela todos los pendientes del evento y crea nuevos** — es el comportamiento correcto cuando cambian las alertas.
- **NO tocar la tabla `wts_calendario_alerta`** si no es necesario. Si no hay cambios en alertas, no hacer DELETE + INSERT aunque "se vean iguales" — el trigger se dispararía innecesariamente y regeneraría todos los mensajes.
- El guard de deduplicación (`set_config('app.cal_gen_X', '1', true)`) evita que el trigger corra más de una vez por transacción, pero solo dentro de la misma transacción.

### Lógica del PUT de calendario

El `PUT /admin/api/calendario/:id` implementa lógica diferencial:

| Qué cambió | Acción |
|---|---|
| Nada | Solo UPDATE en `wts_calendario`. No tocar alertas. |
| Solo título/texto/plantilla | Igual que arriba. |
| Solo fecha del evento | UPDATE en calendario + `UPDATE noop` en alertas (para disparar trigger que recalcula fechas de mensajes pendientes). |
| Alertas cambiaron | DELETE + INSERT alertas (trigger maneja cancelación y recreación de mensajes). |

La comparación de alertas usa normalización: `{tipo, valor, prioridad}` ordenado, comparado como JSON string. Si la comparación falla falsamente (ej: tipos de dato distintos entre DB e incoming), puede disparar regeneración innecesaria — revisar que `parseInt()` y `String()` se aplican en ambos lados.

### Frontend — fechas en el panel de calendario

- El modal de edición usa `ev.fecha_local` (campo `TO_CHAR` del GET `/:id`) para poblar los inputs de fecha y hora. **No usar** `new Date(ev.wts_calendario_fecha_evento).toISOString()` ni `.toTimeString()` — ambos producen desfase de zona horaria que corre la fecha 1 día por cada guardado.

---

## Docker y variables de entorno

- `docker compose restart` **NO recarga el `.env`**. Para aplicar cambios de variables: `docker compose down && docker compose up -d`.
- Para verificar que una variable quedó cargada: `docker exec bot-whatsapp printenv API_KEY`.
- El contenedor tiene `TZ=America/Guayaquil` en `docker-compose.yml`.
- PostgreSQL no corre en Docker — corre como servicio Windows. La conexión desde el contenedor usa `host.docker.internal` como host (mapeado en `extra_hosts`).
- La carpeta `src/auth/` está montada como volumen para que la sesión de WhatsApp sobreviva reinicios.

---

## Variables de entorno (.env)

```
DB_HOST=host.docker.internal
DB_PORT=5432
DB_NAME=alerta_wts
DB_USER=postgres
DB_PASS=...
INTERVALO_MINUTOS=1
VENTANA_MINUTOS=15
PORT=3000
API_KEY=...
JWT_SECRET=...
JWT_EXPIRES=8h
```

`INTERVALO_MINUTOS` y `VENTANA_MINUTOS` son solo fallback — los valores reales se leen de `wts_configuracion` en cada ciclo del scheduler.

---

## Panel admin — convenciones frontend

- Todas las páginas HTML incluyen: `jquery`, `bootstrap`, `adminlte.min.js`, `sweetalert2`, `config.js`, `auth.js`, `app.js`. Si falta `adminlte.min.js`, el botón de menú hamburguesa no funciona.
- `Auth.fetch()` adjunta automáticamente el header `Authorization: Bearer <token>`.
- `Modal.show()` / `Modal.hide()` son helpers definidos en `app.js`.
- `Alerta.error()`, `Alerta.exito()`, `Alerta.confirmar()` usan SweetAlert2.
- `badgeEstado()`, `badgeActivo()`, `fechaLocal()` son helpers globales en `app.js`.
- Las tablas de datos usan DataTables (`$('#tabla').DataTable({...})`). No hay plugin responsive instalado — usar CSS media queries + `table-responsive` wrapper para móvil.

---

## Base de datos — tablas principales

| Tabla | Rol |
|---|---|
| `wts_mensaje` | Cola central. La escriben API, panel y triggers; la lee el scheduler. |
| `wts_mensaje_log` | Auditoría de cambios de estado. |
| `wts_contacto` | Destinatarios. `permite_whatsapp=1` y `estado=1` son requisito para envío. |
| `wts_plantilla` | Plantillas con variables `{{nombre}} {{celular}} {{mensaje}} {{titulo}} {{fecha_evento}}`. |
| `wts_calendario` | Eventos que disparan mensajes automáticos. |
| `wts_calendario_alerta` | Reglas de cuándo enviar (días/horas/minutos antes, hora fija). |
| `wts_grupo` | Catálogo de grupos WhatsApp (jid + nombre). |
| `wts_configuracion` | Parámetros leídos en caliente por el scheduler. |
| `sis_usuario` / `sis_perfil` | Usuarios y permisos del panel admin. |

**Estados de `wts_mensaje_estado`:** `1=Pendiente, 2=Procesando, 3=Enviado, 4=Error, 5=Cancelado`

---

## Archivos ignorados en git (.gitignore)

```
src/auth/*.json   ← sesión WhatsApp (generada por Baileys, no versionar)
log_errores/      ← logs de errores del servidor
/grupos.txt       ← caché de grupos WhatsApp
```

---

## Mejoras pendientes / conocidas

- **Reintentos automáticos:** mensajes en estado `4 (Error)` con `intentos < 3` deberían reintentarse automáticamente tras unos minutos. Hoy requieren intervención manual.
- **Alerta de desconexión WhatsApp:** si la sesión se cierra, el bot salta ciclos en silencio. Pendiente implementar notificación (correo o Telegram) cuando `estaConectado()` retorna `false` por múltiples ciclos.
- **Mensajes fuera de ventana:** si el bot estuvo caído y un mensaje superó `fecha_programada + VENTANA_MINUTOS`, queda como `Pendiente` eternamente sin indicación visible de que expiró.
- **Imágenes en mensajes:** Baileys soporta `{ image, caption }`. Pendiente agregar campo de media en `wts_mensaje` y uploader en el panel.

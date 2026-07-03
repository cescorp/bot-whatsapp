# Manual Técnico — Envío de Mensajes e Inicio de Sesión

## Stack

| Componente | Tecnología |
|---|---|
| Runtime | Node.js |
| WhatsApp | `@whiskeysockets/baileys` (multi-device) |
| Base de datos | PostgreSQL |
| Auth sesión | Archivos locales (`useMultiFileAuthState`) |

---

## 1. Inicio de sesión (`src/whatsapp.js`)

### 1.1 Arranque del sistema

Al iniciar (`src/index.js → main()`), el sistema consulta todas las cuentas activas en BD y llama `iniciarCuenta()` por cada una:

```
main()
 └─ obtenerCuentasActivas()       → SELECT wts_cuenta WHERE estado = 1
 └─ iniciarCuenta(id, nombre)     → por cada cuenta activa
```

### 1.2 `iniciarCuenta(cuentaId, nombre)`

```
src/auth/cuenta-{id}/            ← directorio de sesión por cuenta
 └─ useMultiFileAuthState(dir)   ← carga credenciales si ya existen
 └─ makeWASocket(...)            ← crea socket Baileys
 └─ cuentas.set(id, { sock, conectado: false, nombre })
```

El socket escucha dos eventos:

**`creds.update`** → persiste credenciales en disco con `saveCreds()`. Esto mantiene la sesión activa entre reinicios.

**`connection.update`** → maneja el ciclo de vida de la conexión:

| Evento | Acción |
|---|---|
| `qr` generado | Guarda imagen en `src/auth/cuenta-{id}/qr.png` |
| `connection = 'open'` | Marca `conectado = true` en el Map |
| `connection = 'close'` | Marca `conectado = false`; reconecta en 5 s (salvo `loggedOut`) |

### 1.3 Estado en memoria

```js
// Map<cuentaId, { sock, conectado, nombre }>
const cuentas = new Map()
```

Toda la lógica de envío consulta este Map. Si la cuenta no está en él, o `conectado = false`, el envío falla inmediatamente.

### 1.4 QR y primera conexión

1. Baileys detecta que no hay sesión → genera QR como string
2. Se convierte a imagen PNG con `qrcode` y se guarda en `src/auth/cuenta-{id}/qr.png`
3. El panel admin lo expone vía `GET /api/cuentas/{id}/qr`
4. El usuario escanea con WhatsApp → Baileys recibe `connection = 'open'`
5. `saveCreds()` persiste la sesión; los próximos arranques no piden QR

### 1.5 Reconexión automática

Si la conexión cae por error de red u otro motivo (distinto a `loggedOut`), `iniciarCuenta()` se vuelve a llamar tras 5 segundos, reutilizando las credenciales persistidas.

---

## 2. Scheduler — envío programado (`src/index.js`)

### 2.1 Ciclo

```
scheduler()
 └─ procesarPendientes()
 └─ setTimeout(scheduler, INTERVALO_MINUTOS * 60000)   ← se reprograma solo
```

El intervalo se lee de la tabla `wts_configuracion` (clave `INTERVALO_MINUTOS`). Por defecto 1 minuto.

### 2.2 `procesarPendientes()`

```
por cada cuenta activa en BD:
  ├─ si !estaConectado(id)
  │    └─ incrementa ciclosSinConexion
  │    └─ si ciclos >= umbral → enviarAlertaDesconexion() por correo
  │    └─ skip
  └─ obtenerPendientes(cuentaId)
       └─ por cada mensaje:
            ├─ enviarMensaje(cuentaId, celular, textoFinal)
            │    └─ marcarEnviado(id)   → estado = 3
            └─ (en error) marcarError(id, err)  → estado = 4
```

### 2.3 `obtenerPendientes(cuentaId)` — `src/db.js`

Consulta mensajes con:
- `wts_mensaje_estado = 1` (pendiente)
- `wts_cuenta_id = cuentaId`
- `wts_mensaje_fecha_programada BETWEEN NOW() - VENTANA_MINUTOS AND NOW()`
- Contacto activo y con permiso WhatsApp (o sin contacto asociado)

Hace JOIN con `wts_plantilla` y `wts_calendario` para resolver variables de texto.

**Resolución del texto final (`resolverTexto`):**

| Caso | Resultado |
|---|---|
| Sin plantilla | Usa `wts_mensaje_texto` o `"Hola {nombre}"` |
| Con plantilla | Reemplaza `{{nombre}}`, `{{celular}}`, `{{mensaje}}`, `{{titulo}}`, `{{fecha_evento}}` |

Los resultados se ordenan por `prioridad DESC, fecha_programada ASC`.

### 2.4 Estados de `wts_mensaje`

| Estado | Significado |
|---|---|
| `1` | Pendiente |
| `2` | Enviado (directo, sin pasar por scheduler) |
| `3` | Enviado (por scheduler) |
| `4` | Error |

Cada cambio de estado genera un registro en `wts_mensaje_log`.

---

## 3. Envío de un mensaje (`src/whatsapp.js → enviarMensaje`)

```js
async function enviarMensaje(cuentaId, destino, texto)
```

### Flujo interno

```
1. Verificar cuenta en Map y conectado = true
2. Construir JID
   ├─ si destino incluye '@' → usar tal cual  (grupo: xxxxx@g.us)
   └─ si no              → limpiar dígitos + '@s.whatsapp.net'
3. Si JID termina en @s.whatsapp.net (número individual):
   └─ sock.onWhatsApp(jid)
        ├─ result.exists = false → lanzar Error (número no registrado)
        └─ result.exists = true  → continuar
4. sock.sendMessage(jid, { text: texto })
```

### Por qué el check `onWhatsApp()`

Baileys implementa el protocolo Signal. Antes del primer mensaje a un número, necesita intercambiar claves de cifrado. Sin el pre-check, el mensaje queda en estado "Esperando" hasta que el destinatario abra WhatsApp. `onWhatsApp()` fuerza ese intercambio antes de enviar.

Este check **no aplica a grupos** (`@g.us`) porque el bot ya es miembro y las claves están establecidas.

---

## 4. Mensaje directo — API REST (`src/api/routes/mensajeDirecto.js`)

Ruta: `POST /api/mensaje-directo`  
Autenticación: header `x-api-key`

### Flujo

```
POST /api/mensaje-directo
  Body: { destino, texto, cuenta_id?, contacto_id? }

1. Validar campos obligatorios (destino, texto)
2. SELECT wts_cuenta WHERE id = cuenta_id AND estado = 1
3. estaConectado(cuenta_id)  → 503 si no conectado
4. enviarMensaje(cuenta_id, destino, texto)   ← misma función que el scheduler
5. INSERT wts_mensaje con estado = 2, origen = 3 (API-DIRECTO)
6. Respuesta: { ok: true, id, cuenta_id, destino }
```

La diferencia con el scheduler es que **no espera el ciclo**: el mensaje se envía en la misma request HTTP y se registra en BD ya como enviado (`estado = 2`).

---

## 5. Alerta de desconexión (`src/mailer.js`)

Si una cuenta lleva N ciclos consecutivos sin conexión (umbral configurable en `sis_parametros`, clave `ALERTA_DESCONEXION_CICLOS`, default 3), se envía un correo de alerta. El contador se reinicia cuando la cuenta vuelve a conectarse.

---

## 6. Tablas principales

| Tabla | Función |
|---|---|
| `wts_cuenta` | Cuentas WhatsApp (id, nombre, número, estado) |
| `wts_mensaje` | Mensajes con estado, fecha programada, destino, texto |
| `wts_mensaje_log` | Auditoría de cambios de estado |
| `wts_plantilla` | Plantillas con variables `{{...}}` |
| `wts_calendario` | Eventos que generan mensajes repetidos |
| `wts_grupo` | Grupos sincronizados desde WhatsApp |
| `wts_configuracion` | Parámetros del sistema (intervalo, ventana, etc.) |
| `sis_parametros` | Parámetros globales (umbral desconexión, etc.) |

---

## 7. Archivos clave

| Archivo | Responsabilidad |
|---|---|
| `src/index.js` | Arranque, scheduler, orquestación de cuentas |
| `src/whatsapp.js` | Conexión Baileys, envío, listado de grupos |
| `src/db.js` | Queries: pendientes, marcar enviado/error, configuración |
| `src/api/routes/mensajeDirecto.js` | Endpoint envío inmediato (API pública) |
| `src/admin/servidor/rutas/mensajeDirecto.js` | Proxy del panel admin (JWT) hacia el mismo flujo |
| `src/auth/cuenta-{id}/` | Sesión Baileys persistida por cuenta |

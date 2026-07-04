# Flujo de Implementación — Lectura de Mensajes Entrantes WhatsApp

## Objetivo

Permitir que el bot reciba y almacene mensajes entrantes de WhatsApp en base de datos,
controlado por configuración, sin afectar el flujo de envío existente.

---

## Archivos involucrados

| Archivo | Tipo de cambio |
|---|---|
| SQL (script nuevo) | Crear tabla + insertar parámetros |
| `src/db.js` | Nueva función `guardarMensajeRecibido()` |
| `src/whatsapp.js` | Nuevo listener `messages.upsert` dentro de `iniciarCuenta()` |

No se modifica: `src/index.js`, rutas de API, panel admin.

---

## Paso 1 — Base de datos

### 1.1 Crear tabla `wts_mensaje_recibido`

```sql
CREATE TABLE public.wts_mensaje_recibido (
  wts_mensaje_recibido_id     SERIAL        PRIMARY KEY,
  wts_cuenta_id               INT           NOT NULL,
  wts_mensaje_recibido_jid    VARCHAR(100)  NOT NULL,
  wts_mensaje_recibido_nombre VARCHAR(200),
  wts_mensaje_recibido_texto  TEXT,
  wts_mensaje_recibido_es_grupo SMALLINT    DEFAULT 0,
  wts_mensaje_recibido_leido  SMALLINT      DEFAULT 0,
  wts_mensaje_recibido_fecha  TIMESTAMP,
  user_crea                   VARCHAR(100)  DEFAULT 'BOT_WHATSAPP',
  fecha_crea                  TIMESTAMP     DEFAULT NOW(),

  CONSTRAINT fk_mrecibido_cuenta
    FOREIGN KEY (wts_cuenta_id)
    REFERENCES public.wts_cuenta (wts_cuenta_id)
);

COMMENT ON TABLE  public.wts_mensaje_recibido                        IS 'Mensajes entrantes recibidos por el bot';
COMMENT ON COLUMN public.wts_mensaje_recibido.wts_cuenta_id          IS 'Cuenta WhatsApp que recibió el mensaje';
COMMENT ON COLUMN public.wts_mensaje_recibido.wts_mensaje_recibido_jid IS 'JID del remitente: número@s.whatsapp.net o grupo@g.us';
COMMENT ON COLUMN public.wts_mensaje_recibido.wts_mensaje_recibido_nombre IS 'Nombre del contacto según WhatsApp (pushName)';
COMMENT ON COLUMN public.wts_mensaje_recibido.wts_mensaje_recibido_texto IS 'Texto plano del mensaje recibido';
COMMENT ON COLUMN public.wts_mensaje_recibido.wts_mensaje_recibido_es_grupo IS '1 si el mensaje viene de un grupo, 0 si es directo';
COMMENT ON COLUMN public.wts_mensaje_recibido.wts_mensaje_recibido_leido IS '1 si el bot marcó el mensaje como leído en WhatsApp';
COMMENT ON COLUMN public.wts_mensaje_recibido.wts_mensaje_recibido_fecha IS 'Timestamp original del mensaje según WhatsApp';
```

### 1.2 Insertar parámetros de configuración

```sql
INSERT INTO public.wts_configuracion
  (wts_configuracion_clave, wts_configuracion_valor, wts_configuracion_estado, user_crea, fecha_crea)
VALUES
  ('LEER_MENSAJES',              'NO', 1, 'SISTEMA', NOW()),
  ('LEER_MENSAJES_MARCAR_LEIDO', 'NO', 1, 'SISTEMA', NOW());
```

**Descripción de los parámetros:**

| Clave | Valores | Efecto |
|---|---|---|
| `LEER_MENSAJES` | `SI` / `NO` | Activa o desactiva la escucha de mensajes entrantes |
| `LEER_MENSAJES_MARCAR_LEIDO` | `SI` / `NO` | Si `SI`, llama `sock.readMessages()` y el contacto verá palomitas azules |

> **Nota:** Ambos en `NO` por defecto. Cambiar a `SI` en caliente desde BD sin reiniciar el bot —
> el listener consulta la configuración en cada mensaje recibido.

---

## Paso 2 — `src/db.js`

### 2.1 Nueva función `guardarMensajeRecibido()`

Agregar al final de `src/db.js`, antes del `module.exports`:

```js
async function guardarMensajeRecibido(cuentaId, { jid, nombre, texto, esGrupo, marcadoLeido, fechaMensaje }) {
  await pool.query(`
    INSERT INTO wts_mensaje_recibido (
      wts_cuenta_id,
      wts_mensaje_recibido_jid,
      wts_mensaje_recibido_nombre,
      wts_mensaje_recibido_texto,
      wts_mensaje_recibido_es_grupo,
      wts_mensaje_recibido_leido,
      wts_mensaje_recibido_fecha,
      user_crea,
      fecha_crea
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'BOT_WHATSAPP', NOW())
  `, [
    cuentaId,
    jid,
    nombre  || null,
    texto   || null,
    esGrupo ? 1 : 0,
    marcadoLeido ? 1 : 0,
    fechaMensaje || new Date(),
  ])
}
```

### 2.2 Exportar la función

```js
// antes:
module.exports = { pool, obtenerPendientes, marcarEnviado, marcarError, obtenerConfig, obtenerCuentasActivas }

// después:
module.exports = { pool, obtenerPendientes, marcarEnviado, marcarError, obtenerConfig, obtenerCuentasActivas, guardarMensajeRecibido }
```

---

## Paso 3 — `src/whatsapp.js`

### 3.1 Importar la nueva función

```js
// antes (línea 3 aprox):
const { pool, obtenerPendientes, marcarEnviado, marcarError, obtenerConfig, obtenerCuentasActivas } = require('./db')

// después:
const { pool, obtenerPendientes, marcarEnviado, marcarError, obtenerConfig, obtenerCuentasActivas, guardarMensajeRecibido } = require('./db')
```

> **Nota:** actualmente `whatsapp.js` no importa `db.js` directamente — si no lo hace,
> agregar el require al inicio del archivo.

### 3.2 Agregar listener dentro de `iniciarCuenta()`

Ubicación: inmediatamente después del listener `sock.ev.on('connection.update', ...)`, dentro de la misma función `iniciarCuenta()`.

```js
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  // Solo procesar notificaciones de mensajes nuevos
  if (type !== 'notify') return

  // Verificar configuración — consultado en cada evento para permitir cambio en caliente
  const leer = await obtenerConfig('LEER_MENSAJES', 'NO')
  if (leer !== 'SI') return

  const marcarLeido = await obtenerConfig('LEER_MENSAJES_MARCAR_LEIDO', 'NO')

  for (const message of messages) {
    try {
      // Ignorar mensajes enviados por el propio bot
      if (message.key.fromMe) continue

      // Ignorar mensajes de sistema (sin contenido real)
      if (!message.message) continue

      const jid    = message.key.remoteJid
      const nombre = message.pushName || null

      // Extraer texto — puede venir en distintos formatos según el tipo de mensaje
      const texto =
        message.message.conversation ||
        message.message.extendedTextMessage?.text ||
        message.message.imageMessage?.caption ||
        message.message.videoMessage?.caption ||
        null

      const esGrupo    = jid.endsWith('@g.us')
      const fechaWts   = message.messageTimestamp
        ? new Date(Number(message.messageTimestamp) * 1000)
        : new Date()

      // Guardar en BD
      await guardarMensajeRecibido(cuentaId, {
        jid,
        nombre,
        texto,
        esGrupo,
        marcadoLeido: marcarLeido === 'SI',
        fechaMensaje: fechaWts,
      })

      logger.info({ jid, cuentaId, esGrupo }, 'Mensaje recibido guardado')

      // Marcar como leído en WhatsApp solo si está configurado
      if (marcarLeido === 'SI') {
        await sock.readMessages([message.key])
      }

    } catch (err) {
      logger.error({ err, cuentaId }, 'Error procesando mensaje recibido')
    }
  }
})
```

### 3.3 Tipos de mensaje que se capturan

| Campo en `message.message` | Tipo de mensaje |
|---|---|
| `conversation` | Texto plano simple |
| `extendedTextMessage.text` | Texto con formato, respuesta, o link preview |
| `imageMessage.caption` | Foto con texto |
| `videoMessage.caption` | Video con texto |
| Otros (audio, sticker, documento) | Se guarda `null` en texto — el registro queda igual |

---

## Paso 4 — Aplicar cambios

```bash
# Solo reiniciar — no requiere rebuild porque whatsapp.js y db.js
# están en src/ que es volumen montado
docker compose restart
```

---

## Paso 5 — Verificación

### 5.1 Activar lectura desde BD

```sql
UPDATE wts_configuracion
SET wts_configuracion_valor = 'SI'
WHERE wts_configuracion_clave = 'LEER_MENSAJES';
```

### 5.2 Enviar un mensaje al número del bot desde otro teléfono

### 5.3 Verificar que se guardó

```sql
SELECT
  wts_mensaje_recibido_id,
  wts_cuenta_id,
  wts_mensaje_recibido_jid,
  wts_mensaje_recibido_nombre,
  wts_mensaje_recibido_texto,
  wts_mensaje_recibido_es_grupo,
  wts_mensaje_recibido_leido,
  wts_mensaje_recibido_fecha,
  fecha_crea
FROM wts_mensaje_recibido
ORDER BY fecha_crea DESC
LIMIT 10;
```

### 5.4 Verificar logs del bot

```bash
docker logs bot-whatsapp -f | grep "Mensaje recibido"
```

---

## Comportamiento esperado por combinación de parámetros

| `LEER_MENSAJES` | `LEER_MENSAJES_MARCAR_LEIDO` | Resultado |
|---|---|---|
| `NO` | (cualquiera) | El bot ignora todos los mensajes entrantes |
| `SI` | `NO` | Guarda en BD, el contacto NO ve palomitas azules |
| `SI` | `SI` | Guarda en BD, el contacto SÍ ve palomitas azules |

---

## Consideraciones

- **Grupos:** si el bot está en un grupo, recibirá TODOS los mensajes del grupo.
  Todos se guardan con `wts_mensaje_recibido_es_grupo = 1`.
  Si no se desea esto, se puede filtrar por `jid.endsWith('@g.us')`.

- **Mensajes de estado (Status):** Baileys puede recibir actualizaciones de estado.
  Se filtran automáticamente porque `type !== 'notify'`.

- **Volumen:** en cuentas con muchos grupos activos, el volumen de registros puede crecer rápido.
  Considerar un job de limpieza periódica o índice en `fecha_crea`.

- **Sin rebuild:** `whatsapp.js` y `db.js` están en `src/` que es volumen montado en Docker.
  Solo se necesita `docker compose restart`, no `--build`.

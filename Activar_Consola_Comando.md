# Flujo a implementar — Consola de comandos y Watchdog por chat "Yo"

## Objetivo

Usar el chat "Yo" (self-chat, ver `manual_tecnico.md` sección 6.3) de cada cuenta para dos cosas independientes, **activables por separado y por cuenta**:

1. **Consola de comandos** — escribir un mensaje con formato `Campo: valor` al "Yo" ejecuta acciones (crear recordatorio en calendario, consultar una API externa, etc.) — **sin hardcodear comandos en el código**, solo los *tipos* de acción.
2. **Watchdog de lectura** — verifica automáticamente que la recepción de mensajes de esa cuenta sigue funcionando, y alerta por correo si se rompe en silencio.

Ambas se apoyan en el mismo mecanismo ya implementado: `esSelfChat` en `src/whatsapp.js` (comparación contra `sock.authState.creds.me.id` / `.lid`).

---

## Cambios en base de datos

### 1. Nuevas columnas en `wts_cuenta` (estado por cuenta)

```sql
ALTER TABLE public.wts_cuenta
  ADD COLUMN wts_cuenta_consola_activo               SMALLINT  DEFAULT 0,
  ADD COLUMN wts_cuenta_watchdog_activo               SMALLINT  DEFAULT 0,
  ADD COLUMN wts_cuenta_watchdog_ultimo_ping           TIMESTAMP,
  ADD COLUMN wts_cuenta_watchdog_ultima_confirmacion   TIMESTAMP,
  ADD COLUMN wts_cuenta_watchdog_alerta_enviada        SMALLINT  DEFAULT 0;

COMMENT ON COLUMN public.wts_cuenta.wts_cuenta_consola_activo
  IS '1=Recibe comando activo; 0=inactivo';

COMMENT ON COLUMN public.wts_cuenta.wts_cuenta_watchdog_activo
  IS '1=Verificacion automatica activo; 0=inactivo';

COMMENT ON COLUMN public.wts_cuenta.wts_cuenta_watchdog_ultimo_ping
  IS 'Fecha/hora del ultimo mensaje de prueba (ping) enviado al chat Yo';

COMMENT ON COLUMN public.wts_cuenta.wts_cuenta_watchdog_ultima_confirmacion
  IS 'Fecha/hora en que se confirmo la lectura del ultimo ping (eco recibido de vuelta)';

COMMENT ON COLUMN public.wts_cuenta.wts_cuenta_watchdog_alerta_enviada
  IS '1=ya se envio alerta por correo para el ping actual sin confirmar (evita reenvios); se resetea a 0 al confirmar o al mandar un ping nuevo';
```

### 2. Parámetros globales de tiempo del watchdog (política, no estado — sí van en `wts_configuracion`)

```sql
INSERT INTO public.wts_configuracion
  (wts_configuracion_clave, wts_configuracion_valor, wts_configuracion_estado, user_crea, fecha_crea)
VALUES
  ('WATCHDOG_INTERVALO_MINUTOS', '60', 1, 'SISTEMA', NOW()),
  ('WATCHDOG_TIMEOUT_MINUTOS',   '15', 1, 'SISTEMA', NOW());
```

| Clave | Significado |
|---|---|
| `WATCHDOG_INTERVALO_MINUTOS` | Cada cuánto se manda un ping de prueba al "Yo" |
| `WATCHDOG_TIMEOUT_MINUTOS` | Cuánto esperar la confirmación antes de alertar |

### 3. Tabla `wts_comando` — catálogo de comandos (sin hardcodear en código)

```sql
CREATE TABLE public.wts_comando (
  wts_comando_id           SERIAL        PRIMARY KEY,
  wts_comando_nombre       VARCHAR(50)   NOT NULL,
  wts_comando_tipo         VARCHAR(30)   NOT NULL,
  wts_comando_campos_clave JSONB         NOT NULL,
  wts_comando_config       JSONB,
  wts_comando_respuesta    TEXT,
  wts_comando_cuenta_id    INT           REFERENCES public.wts_cuenta(wts_cuenta_id),
  wts_comando_estado       SMALLINT      DEFAULT 1,
  user_crea                VARCHAR(100)  DEFAULT 'BOT_WHATSAPP',
  fecha_crea               TIMESTAMP     DEFAULT NOW()
);

COMMENT ON TABLE  public.wts_comando IS 'Comandos reconocidos en el chat "Yo" (consola) — palabra/campos clave y su accion, sin hardcodear en el codigo';
COMMENT ON COLUMN public.wts_comando.wts_comando_nombre       IS 'Nombre identificador interno del comando (solo para administracion)';
COMMENT ON COLUMN public.wts_comando.wts_comando_tipo         IS 'Tipo de accion a ejecutar: CALENDARIO | API_EXTERNA (catalogo fijo definido en src/comandos.js)';
COMMENT ON COLUMN public.wts_comando.wts_comando_campos_clave IS 'Array de nombres de campo (formato del mensaje "Clave: valor") que identifican este comando; basta que aparezca al menos uno para matchear';
COMMENT ON COLUMN public.wts_comando.wts_comando_config       IS 'Configuracion especifica de esta instancia del tipo (ver ejemplos en Activar_Consola_Comando.md)';
COMMENT ON COLUMN public.wts_comando.wts_comando_respuesta    IS 'Plantilla de confirmacion enviada de vuelta al chat Yo, admite {{variables}}';
COMMENT ON COLUMN public.wts_comando.wts_comando_cuenta_id    IS 'Cuenta especifica donde aplica este comando; NULL = todas las cuentas con consola activa';
COMMENT ON COLUMN public.wts_comando.wts_comando_estado       IS '1=activo, 0=inactivo';
```

### 4. Comandos iniciales (datos, no código) — tus dos casos concretos

```sql
INSERT INTO wts_comando (wts_comando_nombre, wts_comando_tipo, wts_comando_campos_clave, wts_comando_config, wts_comando_respuesta)
VALUES
(
  'crear_recordatorio',
  'CALENDARIO',
  '["Titulo","Fecha"]',
  '{}',
  '✅ Evento "{{Titulo}}" creado para el {{Fecha}}{{Recordatorio? , aviso {{Recordatorio}} : ""}}'
),
(
  'consulta_gastos',
  'API_EXTERNA',
  '["Producto","Gastos"]',
  '{
    "llamadas": [
      { "si_campo": "Producto", "resultado": "precios", "url": "https://api.miapp.com/gastos/producto", "metodo": "GET",
        "query": { "producto": "{{Producto}}" } },
      { "si_campo": "Gastos",   "resultado": "total",   "url": "https://api.miapp.com/gastos/total",    "metodo": "GET",
        "query": { "desde": "{{primer_dia_mes}}", "hasta": "{{Gastos|hoy}}" } }
    ]
  }',
  '📊 {{precios}}\n💰 Total: {{total}}'
);
```

> `{{Gastos|hoy}}` = usar el valor del campo `Gastos`, o la fecha de hoy si el usuario escribió literalmente "hoy". `{{primer_dia_mes}}` es una variable especial que resuelve el bot (1º del mes en curso), no un campo del mensaje.

---

## Flujo A — Watchdog de lectura (gate: `wts_cuenta_watchdog_activo`)

### A.1 Envío del ping — dentro del `scheduler()`, por cada cuenta activa y conectada

```
procesarPendientes()
  por cada cuenta activa y conectada:
    ...(envío normal de pendientes, ya existente — sin cambios)...

    if wts_cuenta_watchdog_activo != 1 → salir, no hacer nada de watchdog para esta cuenta

    revisarWatchdog(cuentaId)
      │
      ├─ hay ping pendiente sin confirmar
      │    y NOW() - wts_cuenta_watchdog_ultimo_ping > WATCHDOG_TIMEOUT_MINUTOS
      │    y wts_cuenta_watchdog_alerta_enviada = 0
      │        → enviarAlertaWatchdog(cuentaNombre)   ← correo, mismo patrón que enviarAlertaDesconexion (src/mailer.js)
      │        → UPDATE wts_cuenta SET wts_cuenta_watchdog_alerta_enviada = 1
      │
      └─ NOW() - wts_cuenta_watchdog_ultimo_ping >= WATCHDOG_INTERVALO_MINUTOS
              → enviarMensaje(cuentaId, propioJid, 'PING_WATCHDOG_' + Date.now())
              → UPDATE wts_cuenta
                   SET wts_cuenta_watchdog_ultimo_ping = NOW(),
                       wts_cuenta_watchdog_alerta_enviada = 0
```

### A.2 Confirmación — dentro de `messages.upsert`, cuando `esSelfChat === true`

```
esSelfChat === true && texto empieza con 'PING_WATCHDOG_'
   → UPDATE wts_cuenta
        SET wts_cuenta_watchdog_ultima_confirmacion = NOW()
      WHERE wts_cuenta_id = cuentaId
   → continue   (no se guarda en wts_mensaje_recibido — es trafico interno de control, no un mensaje real)
```

### A.3 Resultado esperado

- **Sano:** cada `WATCHDOG_INTERVALO_MINUTOS` sale un ping y a los segundos se confirma — nunca se dispara alerta.
- **Roto** (ej. Baileys deja de decodificar mensajes pero la cuenta sigue "conectada"): el ping sale pero nunca se confirma. A los `WATCHDOG_TIMEOUT_MINUTOS` llega un correo: *"Cuenta Principal: no se ha podido confirmar la lectura de mensajes desde hace X minutos"*.
- Es por cuenta: si "Carolina" está sana pero "Principal" está rota, solo se alerta la que falló.
- Si `wts_cuenta_watchdog_activo = 0`, esa cuenta no genera pings ni alertas — apagado por completo.

---

## Flujo B — Consola de comandos (gate: `wts_cuenta_consola_activo`)

### B.1 Parser genérico de campos `Clave: valor`

Los mensajes de comando son formularios multilínea, no `comando + argumento`. Se parsean genéricamente antes de intentar matchear cualquier comando:

```
parsearCampos(texto)
  campos = {}
  por cada línea del texto:
     si la línea contiene ':' →
        clave = texto antes de ':' (trim)
        valor = texto después de ':' (trim, sin ';' final)
        campos[clave] = valor
  return campos   // {} si el mensaje no tiene ninguna línea "Clave: valor"
```

Ejemplos:
```
"Producto: Papel Higienico\nGastos: hoy/10-07-2026"
  → { Producto: "Papel Higienico", Gastos: "hoy/10-07-2026" }

"Titulo: Recordatorio;\nMensaje: Mi hermano no olvide nuestra reunion hoy;\nFecha: 30-07-2026;\nRecordatorio: 1 hora antes"
  → { Titulo: "Recordatorio", Mensaje: "Mi hermano no olvide nuestra reunion hoy", Fecha: "30-07-2026", Recordatorio: "1 hora antes" }
```

### B.2 Punto de entrada — dentro de `messages.upsert`, cuando `esSelfChat === true`

```
esSelfChat === true
  │
  ├─ texto empieza con 'PING_WATCHDOG_'          → (Flujo A.2, ya cubierto arriba)
  │
  ├─ wts_cuenta_consola_activo != 1               → sigue el flujo normal, se guarda como mensaje recibido común
  │
  └─ wts_cuenta_consola_activo == 1
        │
        campos = parsearCampos(texto)
        │
        ├─ campos vacío (no es un formulario Clave: valor) → sigue el flujo normal, se guarda como mensaje recibido común
        │
        └─ campos no vacío
              │
              SELECT * FROM wts_comando
               WHERE wts_comando_estado = 1
                 AND (wts_comando_cuenta_id IS NULL OR wts_comando_cuenta_id = cuentaId)
              │
              buscar el primero cuyo wts_comando_campos_clave tenga
              al menos una clave presente en `campos`
              │
              ├─ ningún comando matchea → sigue el flujo normal, se guarda como mensaje recibido común
              │
              └─ comando encontrado:
                    resultado = ejecutarComando(cuentaId, comando, campos)   ← switch por wts_comando_tipo (B.3)
                    enviarMensaje(cuentaId, propioJid, renderizar(comando.wts_comando_respuesta, resultado))
                    continue   (el comando NO se guarda en wts_mensaje_recibido — es control, no un mensaje real)
```

### B.3 Dispatcher por tipo — `src/comandos.js` (único lugar con código fijo; son *tipos*, no comandos)

```js
async function ejecutarComando(cuentaId, comando, campos) {
  switch (comando.wts_comando_tipo) {
    case 'CALENDARIO':   return ejecutarCalendario(cuentaId, comando, campos)
    case 'API_EXTERNA':  return ejecutarApiExterna(comando, campos)
    // futuros tipos se agregan aquí — una vez por TIPO, nunca por comando individual
  }
}
```

#### `CALENDARIO` — caso "crear_recordatorio"

```
ejecutarCalendario(cuentaId, comando, campos)
  titulo  = campos.Titulo
  mensaje = campos.Mensaje || null
  fecha   = parsearFecha(campos.Fecha)              // '30-07-2026' → timestamp

  INSERT INTO wts_calendario (
    wts_calendario_titulo, wts_calendario_mensaje_texto,
    wts_calendario_fecha_evento, wts_calendario_destino_libre
  ) VALUES (titulo, mensaje, fecha, propioNumero)     -- destino = el propio chat Yo (self-chat), ver 6.1 abajo
    RETURNING wts_calendario_id

  si campos.Recordatorio presente:
     { tipo, valor } = parsearRecordatorio(campos.Recordatorio)   // '1 hora antes' → { tipo: 2, valor: 1 }
     INSERT INTO wts_calendario_alerta (wts_calendario_id, wts_calendario_alerta_tipo, wts_calendario_alerta_valor, prioridad)
       VALUES (id, tipo, valor, 5)

  // el trigger existente (trg_wts_calendario_ai, FLUJO.md Flujo 2) ya genera el wts_mensaje —
  // no se toca nada de esa parte

  return { Titulo: titulo, Fecha: campos.Fecha, Recordatorio: campos.Recordatorio || '' }
```

`parsearRecordatorio()` traduce lenguaje natural simple a los tipos ya definidos en `wts_calendario_alerta` (ver `README.md` — tabla de tipos de alerta):

| Texto reconocido | tipo | valor |
|---|---|---|
| `"N dias antes"` | `1` | `N` |
| `"N horas antes"` | `2` | `N` |
| `"N minutos antes"` | `3` | `N` |
| `"HH:MM"` (hora fija el mismo día) | `4` | `"HH:MM"` |

#### `API_EXTERNA` — caso "consulta_gastos"

```
ejecutarApiExterna(comando, campos)
  resultados = {}
  por cada llamada en comando.config.llamadas:
     si campos[llamada.si_campo] no existe → saltar esta llamada
     query = sustituirVariables(llamada.query, campos, variablesEspeciales)
                // variablesEspeciales: primer_dia_mes, y resolver "hoy" en {{Gastos|hoy}}
     resp = await fetch(llamada.url + '?' + querystring(query), { method: llamada.metodo })
     resultados[llamada.resultado] = formatearResultado(await resp.json())

  return resultados   // { precios: "...", total: "..." }
```

> Usa el `fetch` nativo de Node 22 (ya es la base de la imagen Docker) — no hace falta agregar `node-fetch` ni ninguna dependencia nueva.

### B.4 Resultado esperado

**Ejemplo calendario:**
```
Tú → "Yo": Titulo: Recordatorio;
           Mensaje: Mi hermano no olvide nuestra reunion hoy;
           Fecha: 30-07-2026;
           Recordatorio: 1 hora antes

Bot → "Yo": ✅ Evento "Recordatorio" creado para el 30-07-2026, aviso 1 hora antes
```

**Ejemplo gastos:**
```
Tú → "Yo": Producto: Papel Higienico
           Gastos: hoy/10-07-2026

Bot → "Yo": 📊 Papel Higienico: $2.50 (Súper) / $2.35 (Tienda X) / $2.60 (Farmacia Y)
            💰 Total: $148.20 gastados del 01-07-2026 al 10-07-2026
```

Cualquier otro texto que no matchee ningún comando (o no tenga formato `Clave: valor`) se guarda como mensaje recibido normal, sin cambios de comportamiento.

---

## Activación (por cuenta, vía SQL o futuro panel admin)

```sql
-- Activar consola de comandos en la cuenta Principal
UPDATE wts_cuenta SET wts_cuenta_consola_activo = 1 WHERE wts_cuenta_id = 1;

-- Activar watchdog en la cuenta Principal
UPDATE wts_cuenta SET wts_cuenta_watchdog_activo = 1 WHERE wts_cuenta_id = 1;
```

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `migrations/*.sql` (script nuevo) | `ALTER TABLE wts_cuenta`, `CREATE TABLE wts_comando`, `INSERT` de parámetros de watchdog y comandos iniciales |
| `src/db.js` | `obtenerEstadoWatchdog`, `actualizarPingWatchdog`, `confirmarWatchdog`, `marcarAlertaWatchdogEnviada`, `buscarComando(cuentaId, campos)`, funciones de INSERT para `wts_calendario` / `wts_calendario_alerta` reutilizables desde el comando |
| `src/whatsapp.js` | En `messages.upsert`: detectar `PING_WATCHDOG_`, parsear campos y despachar comando antes del guardado normal |
| `src/index.js` | En `procesarPendientes()`: llamar `revisarWatchdog(cuentaId)` por cuenta si `wts_cuenta_watchdog_activo = 1` |
| `src/mailer.js` | Nueva función `enviarAlertaWatchdog(cuentaNombre, minutosSinConfirmar)`, mismo patrón que `enviarAlertaDesconexion` |
| **Nuevo:** `src/comandos.js` | `parsearCampos()`, `ejecutarComando()` (dispatcher), `ejecutarCalendario()`, `ejecutarApiExterna()`, `parsearFecha()`, `parsearRecordatorio()`, `renderizar()` |

> Recordatorio: estos archivos **no** son volumen montado en Docker — cualquier cambio requiere `docker compose up -d --build`, no solo `restart` (ver `manual_tecnico.md` sección 6.6).

---

## Decisiones ya resueltas (quedaron abiertas en la versión anterior de este documento)

1. **Sintaxis de los comandos** → resuelta: formato de formulario `Clave: valor` multilínea, parseado genéricamente; el comando se identifica por `wts_comando_campos_clave`, no por una palabra en posición fija.
2. **Contacto/destino del recordatorio creado por comando** → resuelta: se usa `wts_calendario_destino_libre` con el propio número de la cuenta — el aviso vuelve al mismo chat "Yo" que lo creó, salvo que se agregue explícitamente un campo `Destino:` más adelante.
3. **Confirmación `✅` vs `LEER_MENSAJES_MARCAR_LEIDO`** → resuelta: son conceptos independientes. La confirmación es un mensaje saliente normal (`enviarMensaje`) y se manda siempre que se ejecuta un comando, sin importar el valor de `LEER_MENSAJES_MARCAR_LEIDO` (que solo controla las palomitas azules del mensaje entrante).

## Pendiente real — falta definir contigo antes de codear

- **Endpoint real de la API de "gastos"** — URL, método, autenticación (¿header, token?) y forma exacta de la respuesta JSON (para saber cómo armar `precios` y `total` en `formatearResultado()`). Los valores en el `INSERT` de ejemplo (`https://api.miapp.com/...`) son placeholder.

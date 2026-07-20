# Config API Gastos — Consola de comandos WhatsApp

Documento de referencia de los comandos que reconoce el bot de WhatsApp (proyecto `bot-whatsapp`) en el chat "Yo" (self-chat), su sintaxis, configuración y cómo se conecta con esta API de Control de Gastos.

> Diseño completo del mecanismo de comandos (tabla `wts_comando`, motor genérico, watchdog) en `bot-whatsapp/Activar_Consola_Comando.md`. Aquí solo lo específico de estos dos comandos y de esta API.

---

## 0. Cómo funciona en general (resumen)

```
Escribes al chat "Yo" un mensaje con formato "Clave: valor" (una por línea)
        │
        ▼
El bot lo reconoce SOLO si esGrupo=self-chat y wts_cuenta_consola_activo=1
        │
        ▼
Busca en wts_comando (BD) un comando cuyas "campos_clave" coincidan con
alguna de las claves del mensaje
        │
        ▼
Ejecuta la acción (CALENDARIO o API_EXTERNA) y responde en el mismo chat
```

Requisito previo, por cuenta de WhatsApp:
```sql
UPDATE wts_cuenta SET wts_cuenta_consola_activo = 1 WHERE wts_cuenta_id = 1;
```

---

## 1. Comando `crear_recordatorio` (tipo `CALENDARIO`)

No usa esta API — se documenta aquí solo como contexto (es el otro comando existente).

### Sintaxis
```
Titulo: <texto>;
Mensaje: <texto>;
Fecha: DD-MM-YYYY;
Recordatorio: N dias antes | N horas antes | N minutos antes | HH:MM
```

| Campo          | Obligatorio | Notas |
|----------------|-------------|---|
| `Titulo`       | Sí          | — |
| `Fecha`        | Sí          | `DD-MM-YYYY` o `DD-MM-YYYY HH:mm` (hora opcional) |
| `Mensaje`      | No          | Texto del recordatorio que se enviará |
| `Recordatorio` | No          | Una sola regla — ver limitación abajo |

### Ejemplo
```
Titulo: Reunion equipo;
Mensaje: No olvides la reunion;
Fecha: 30-07-2026 09:00;
Recordatorio: 1 hora antes
```
Respuesta: `✅ Evento "Reunion equipo" creado para el 30-07-2026 09:00, aviso 1 hora antes`

### Limitaciones conocidas
- **Solo se admite un `Recordatorio:` por evento.** Si se repite la clave dos veces en el mismo mensaje, la segunda sobreescribe a la primera (el parser guarda un objeto plano `{clave: valor}`, no arrays). No implementado aún: soporte para varios recordatorios separados por coma en una sola línea.
- El recordatorio se envía al **mismo chat "Yo"** que lo creó (destino = número propio de la cuenta), no a otro contacto.
- Ocasionalmente el mensaje del recordatorio (cuando lo dispara el scheduler) puede llegar **vacío** por un problema conocido de Baileys/WhatsApp (renegociación de sesión de cifrado justo al enviar a uno mismo) — no es un bug del código, el texto en BD siempre está correcto. Sin fix definitivo por ahora.

---

## 2. Comando `consulta_gastos` (tipo `API_EXTERNA`) — este es el que usa esta API

### 2.1 Campos y variantes

| Campo | Qué dispara | Valores válidos |
|---|---|---|
| `Producto` | Consulta `historial_producto.php` | Cualquier texto (coincidencia parcial) |
| `Periodo` | Filtra la consulta de `Producto` (opcional, se ignora si no hay `Producto`) | `hoy` \| `mes` \| `año` (o `ano`) — ausente = sin filtro de fecha |
| `Gastos` | Consulta `gastos_rango.php` | `hoy` (o vacío) = hasta hoy · `DD-MM-YYYY` = hasta esa fecha |

Se pueden mandar **una o ambas** claves (`Producto`/`Gastos`) en el mismo mensaje — cada una dispara su propia llamada a la API, de forma independiente.

### 2.2 Ejemplos de todas las variantes

```
Producto: Papel Higienico                     → historial completo, sin filtro de fecha

Producto: Papel Higienico
Periodo: hoy                                  → solo movimientos de hoy

Producto: Papel Higienico
Periodo: mes                                  → del 1 del mes actual a hoy

Producto: Papel Higienico
Periodo: año                                  → del 1 de enero a hoy

Gastos: hoy                                   → total del 1 del mes actual a hoy

Gastos: 10-07-2026                            → total del 1 del mes actual a esa fecha

Producto: Papel Higienico
Gastos: hoy                                   → ambas consultas en un solo mensaje,
                                                 se responden juntas
```

> `Periodo` **solo afecta la consulta de `Producto`**. La consulta de `Gastos` siempre es "del 1 del mes actual hasta la fecha indicada (o hoy)" — no usa `Periodo`.

### 2.3 Requisitos de configuración

**a) Variable de entorno en `bot-whatsapp/.env`** (API key fija, no vive en base de datos):
```env
# ── API EXTERNA GASTOS ──────────────────────────────────────────
API_GASTOS_TOKEN=WhatsappAlerta2026!
```

**b) API key creada en esta base (Control de Gastos)** — tabla `sis_api_tokens`:
```sql
INSERT INTO sis_api_tokens (
    sis_usuarios_id,
    sis_api_tokens_token,
    sis_api_tokens_fecha_expira,
    sis_api_tokens_estado
) VALUES (
    1,
    'WhatsappAlerta2026!',   -- debe ser idéntico al API_GASTOS_TOKEN del .env del bot
    DATE_ADD(NOW(), INTERVAL 1 YEAR),
    1
);
```

**c) Configuración del comando en la base del bot (`alerta_wts`, tabla `wts_comando`)** — no en esta base:
```sql
UPDATE wts_comando
SET
  wts_comando_config = '{
    "llamadas": [
      { "si_campo": "Producto", "resultado": "productos",
        "url": "http://host.docker.internal:88/control_gastos/api/reportes/historial_producto.php",
        "metodo": "GET", "query": { "empresa_id": "1", "q": "{{Producto}}", "desde": "{{periodo_desde}}", "hasta": "{{periodo_hasta}}" } },
      { "si_campo": "Gastos", "resultado": "total",
        "url": "http://host.docker.internal:88/control_gastos/api/reportes/gastos_rango.php",
        "metodo": "GET", "query": { "empresa_id": "1", "desde": "{{primer_dia_mes}}", "hasta": "{{Gastos|hoy}}" } }
    ]
  }',
  wts_comando_respuesta = '📊 *Consulta de gastos*

{{mensaje}}'
WHERE wts_comando_nombre = 'consulta_gastos';
```

> `empresa_id: "1"` — ajustar si corresponde a otra empresa.
> Se usa `host.docker.internal` (no `localhost`) porque el bot corre dentro de Docker — desde ahí `localhost` apuntaría al propio contenedor, no al servidor PHP de esta API.

**d) Reconstruir la imagen del bot** cada vez que cambia `src/comandos.js` (no hace falta si solo se toca la config en `wts_comando`, eso es en caliente):
```powershell
docker compose up -d --build
```

### 2.4 Autenticación en cada llamada

El bot manda automáticamente en cada request:
```
Authorization: Bearer <API_GASTOS_TOKEN>
```
Se revisa tanto el status HTTP como el campo `ok` del cuerpo (`{"ok":true/false, ...}`) — si cualquiera falla, la sección de esa consulta responde con un mensaje de error en vez de romper toda la respuesta.

---

## 3. Formato de la respuesta — `historial_producto.php`

El bot espera (y formatea especialmente) esta forma de respuesta para `data`:

```json
[
  {
    "producto": "PAPEL HIGIENICT/HOJ",
    "movimientos": [
      { "fecha": "2026-04-03", "precio_unitario": 5.17, "cantidad": 1, "precio_total": 5.17, "proveedor": "CORPORACION EL ROSADO S.A." }
    ]
  }
]
```

Se renderiza así (código en `bot-whatsapp/src/comandos.js`, función `formatearResultado`):

```
*PAPEL HIGIENICT/HOJ*
1 de $5.17 - Total: $5.17 el 2026-04-03 -  CORPORACION...
```

Reglas de formato actuales:
- Nombre del producto en **negrita** (sintaxis WhatsApp `*texto*`) como encabezado.
- Una línea por movimiento: `{cantidad} de ${precio_unitario} - Total: ${precio_total} el {fecha} - {proveedor}`.
- `proveedor` se trunca a **12 caracteres** + `...` si es más largo (evita líneas eternas en el celular).
- Si `gastos_rango.php`/`gastos_mes_actual.php` devuelven `{ filas: [...] }` en vez de esta forma, se usa un formateador genérico distinto (no se conocen los nombres de columna exactos de ese reporte todavía — queda pendiente afinarlo cuando se pruebe).
- Si no hay resultados: `"sin resultados"`.

### Dónde cambiar cada cosa

| Qué quieres cambiar | Dónde | ¿Rebuild? |
|---|---|---|
| Palabra clave, URL, parámetros de query, `empresa_id`, texto general de confirmación | `UPDATE wts_comando` (tabla en `alerta_wts`) | No |
| Cómo se arma cada línea (abreviaciones, orden de campos, límite de caracteres, negritas) | `formatearResultado()` en `bot-whatsapp/src/comandos.js` | Sí — `docker compose up -d --build` |
| Reconocer una forma de respuesta nueva (otro endpoint con otra estructura) | Agregar un nuevo `if` en `formatearResultado()` | Sí |

---

## 4. Cómo agregar un comando nuevo (para esta API u otra)

1. `INSERT INTO wts_comando` en `alerta_wts` con `wts_comando_nombre`, `wts_comando_tipo` (`CALENDARIO` o `API_EXTERNA`), `wts_comando_campos_clave` (array de nombres de campo que lo identifican), `wts_comando_config`, `wts_comando_respuesta`.
2. Si es `API_EXTERNA` y la respuesta tiene una forma nueva, agregar el caso correspondiente en `formatearResultado()` (`src/comandos.js`) y reconstruir.
3. Si es un tipo de acción completamente nuevo (ni calendario ni API externa), agregar un handler nuevo y el `case` en `ejecutarComando()` (`src/comandos.js`).

No se necesita tocar `whatsapp.js` ni `db.js` para agregar comandos nuevos de los tipos que ya existen — solo para tipos de acción genuinamente nuevos.

---

## 5. Notas y limitaciones conocidas (resumen)

- `Periodo` solo aplica a `Producto`, no a `Gastos`.
- Un solo `Recordatorio` por evento de calendario (no acumulativo).
- El formateador de `historial_producto.php` es específico para la forma `[{producto, movimientos}]` — si esta API cambia esa estructura, hay que actualizar `formatearResultado()`.
- El bot corre dentro de Docker — cualquier URL de esta API que el bot consuma debe usar `host.docker.internal`, no `localhost`, al configurarla en `wts_comando`.
- Los cambios en `wts_comando` (BD) son en caliente. Los cambios en `src/comandos.js` (código) requieren `docker compose up -d --build`.

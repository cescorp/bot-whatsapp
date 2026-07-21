# Implementar: comandos internos/externos + menú por niveles

> Documento autocontenido — pensado para que cualquier IA/sesión que lo retome pueda
> implementar sin haber visto la conversación original. Marcar cada casilla `- [ ]` → `- [x]`
> a medida que se completa e ir committeando. Si algo de la sección 1 (supuestos) resulta
> incorrecto al implementar, corregirlo ahí mismo y ajustar el resto del documento antes de seguir.

## 0. Contexto

`bot-whatsapp` tiene una "consola de comandos" en el chat "Yo" (self-chat) de WhatsApp: se
le escribe un mensaje con formato `Clave: valor` (una por línea) y el bot reconoce el
comando por sus `campos_clave`, lo ejecuta y responde. Diseño original en
`Activar_Consola_Comando.md`, implementación en `src/comandos.js` + `src/whatsapp.js` +
`src/db.js`. Hoy solo hay 2 comandos activos en `wts_comando`:

| nombre | tipo | campos_clave |
|---|---|---|
| `crear_recordatorio` | `CALENDARIO` | `Titulo`, `Fecha` |
| `consulta_gastos` | `API_EXTERNA` | `Producto`, `Gastos` |

Ambos solo funcionan si el mensaje viene del propio chat "Yo" (`esSelfChat === true` en
`src/whatsapp.js`). No hay noción de "otro contacto puede usar esto", ni de menú
navegable — todo es un match directo de `Clave: valor`.

**Objetivo de este trabajo:**
1. Permitir clasificar cada comando como `INTERNO` (solo "Yo") o `EXTERNO` (cualquier
   contacto, público o restringido por lista blanca).
2. Agregar un tipo de comando nuevo, `SCRIPT`, que ejecuta un archivo dentro del propio
   contenedor Docker (carpeta `scripts/script-sh/` del proyecto, montada a Docker) — **no**
   un `.bat` de Windows ni nada fuera de Docker, el contenedor es Linux (Alpine). Las
   acciones que sí necesitan Windows (ej. VPN) usan un tipo aparte, `HOST_HTTP`, con su
   código en `scripts/agentes-host/` — **no** montada en Docker (ver 4.1 y 4.6).
3. Construir un sistema de **menú navegable por niveles** (máx. 4), con estado de
   conversación por remitente, donde cada opción numerada puede: abrir un submenú,
   responder un texto fijo, o ejecutar un comando (pidiendo sus parámetros en el
   siguiente mensaje si el comando los necesita).
4. Cada comando puede ser accesible por **texto libre** (`Clave: valor` directo, sin
   pasar por el menú — como funciona hoy), por **menú únicamente**, o ambas cosas — son
   dos flags independientes, no un modo exclusivo.

## 1. Decisiones de diseño confirmadas (y supuestos a revisar)

Confirmado con el usuario en la conversación de diseño:

- [x] Rebautizar la tabla de lista blanca: `wts_comando_lista_blanca` (no
      `wts_comando_contacto_permitido`).
- [x] Un comando `EXTERNO` tiene un sub-flag `wts_comando_publico`: si es `true`,
      **cualquier** contacto lo puede disparar; si es `false`, solo los contactos/números
      dados de alta en `wts_comando_lista_blanca` para ese comando.
- [x] `acceso_libre` (Clave:valor directo) y `visible_menu` (aparece como opción en el
      árbol) son **flags independientes** — un comando puede tener ambos, uno, o ninguno
      (si no tiene ninguno, está desactivado de facto, tratar como inválido en validación).
- [x] **Organización final de `scripts/` — una sola carpeta contenedora con dos
      subcarpetas** (ver 4.1): `scripts/script-sh/` para lo que ejecuta el propio
      contenedor (tipo `SCRIPT`, montada en Docker) y `scripts/agentes-host/` para lo que
      corre nativo en Windows fuera de Docker (tipo `HOST_HTTP` — agente VPN y futuros
      agentes de host, **no** montada en Docker). Nunca se mezcla: nada de
      `agentes-host/` se copia ni se monta al contenedor.
- [x] La palabra de entrada al menú (antes fija a `"Hola"`) pasa a ser configurable y
      admite varios sinónimos por nodo raíz (ej. `"abrir menu"`, `"como estas"`), en una
      tabla aparte — no hardcodeada en `whatsapp.js`.
- [x] **Punto 4.5 resuelto: Opción B2.** El texto de un nodo de menú **no** se guarda
      completo y fijo — se genera en cada request combinando un encabezado fijo
      (`wts_menu_nodo_texto`) con la lista de opciones **filtrada según quién escribe**
      (solo se listan las opciones `COMANDO` cuyo comando referenciado el remitente puede
      usar; `SUBMENU`/`RESPUESTA`/`VOLVER`/`SALIR` siempre se muestran). El número
      (`wts_menu_opcion_valor`) de cada opción es **fijo y no se renumera** según lo que
      falte — si a un contacto externo le falta la opción `"2"`, su menú salta de `"1"` a
      `"3"` directo, nunca se corre la numeración. Detalle completo en la sección 4.5.
- [x] **Comando `conectar_vpn` — tipo nuevo `HOST_HTTP`, distinto de `SCRIPT`.** El
      contenedor Docker es Linux (Alpine) y no puede manejar una VPN de Windows
      directamente. La acción real (conectar la VPN vía PowerShell, `VPN_Automatico.bat`)
      corre en un agente HTTP nativo en el host Windows, código en `scripts/agentes-host/`
      — esa subcarpeta **no** se monta en Docker (a diferencia de `scripts/script-sh/`,
      que sí — ver 4.1). El bot le pega a `http://host.docker.internal:PUERTO`, mismo patrón ya usado en el
      proyecto para la API de Control de Gastos (`INSTALAR v2.md` sección 3.8c).
      Autenticación con **token fijo estático** — igual mecanismo que `API_KEY` /
      `API_GASTOS_TOKEN` ya usan en el proyecto: una sola clave en `.env` en ambos lados,
      comparada por igualdad, **sin expiración, sin rotación, sin acumulación de tokens
      viejos**. Diseño completo en la sección 4.6.

**Supuestos que asumí al diseñar el esquema — revisar si no calzan con lo que se quiso decir:**

- [ ] **Match de palabra de entrada = texto exacto** (trim + minúsculas), no coincidencia
      parcial ni NLP difuso. Si el usuario escribe `"Como estas hoy?"` no matchea la
      entrada `"como estas"`. Si se quería algo más flexible (contains, sin signos de
      puntuación), ajustar `buscarNodoPorPalabraEntrada()` en el paso 4.3.
- [ ] **"Dar una respuesta específica"** (la idea original #3: menú tipo `"1=Abrir /
      2=Ejecutar"`) se resuelve como una opción de menú de tipo `RESPUESTA` con texto fijo
      — **no** se modela como un `wts_comando` nuevo. Si en algún punto se necesita que esa
      respuesta fija también sea alcanzable por `Clave: valor` libre (fuera del menú), sí
      habría que convertirla en un `wts_comando` de un tipo nuevo (`RESPUESTA_FIJA`). No
      implementado así por defecto porque no se pidió acceso libre para este caso.
- [ ] **Un comando con parámetros dentro del menú** siempre pide los datos en **texto
      libre** en el siguiente mensaje (nivel 2, como se maquetó en la conversación) — no se
      construyó un sub-flujo de "un campo por mensaje". Si se quiere ir campo por campo
      (más guiado pero más mensajes), es un cambio posterior en el paso 4.5.
- [ ] **Timeout de conversación de menú:** propongo 15 minutos de inactividad antes de
      resetear el estado (mismo patrón que `WATCHDOG_TIMEOUT_MINUTOS`). Ajustable en
      `wts_configuracion` como `MENU_TIMEOUT_MINUTOS`.

## 2. Esquema de base de datos

Crear `migrations/00X_comandos_menu.sql` (usar el siguiente número disponible en
`migrations/`) con lo siguiente. Todo aditivo, no rompe nada existente.

```sql
-- ── Clasificación y modo de acceso de comandos existentes ──────────────────
ALTER TABLE public.wts_comando
  ADD COLUMN wts_comando_origen        VARCHAR(10) NOT NULL DEFAULT 'INTERNO'
    CHECK (wts_comando_origen IN ('INTERNO','EXTERNO')),
  ADD COLUMN wts_comando_publico       SMALLINT    NOT NULL DEFAULT 1,
  ADD COLUMN wts_comando_acceso_libre  SMALLINT    NOT NULL DEFAULT 1,
  ADD COLUMN wts_comando_visible_menu  SMALLINT    NOT NULL DEFAULT 0,
  ADD COLUMN wts_comando_instrucciones TEXT;

COMMENT ON COLUMN public.wts_comando.wts_comando_origen
  IS 'INTERNO = solo chat Yo (self-chat); EXTERNO = cualquier contacto puede llegar a este comando (sujeto a wts_comando_publico)';
COMMENT ON COLUMN public.wts_comando.wts_comando_publico
  IS 'Solo aplica si origen=EXTERNO. 1=cualquier contacto; 0=requiere estar en wts_comando_lista_blanca';
COMMENT ON COLUMN public.wts_comando.wts_comando_acceso_libre
  IS '1=se puede disparar escribiendo "Clave: valor" directo sin pasar por el menú';
COMMENT ON COLUMN public.wts_comando.wts_comando_visible_menu
  IS '1=aparece como opción numerada dentro del árbol de menú (wts_menu_opcion tipo COMANDO)';
COMMENT ON COLUMN public.wts_comando.wts_comando_instrucciones
  IS 'Texto que se muestra cuando se llega a este comando por menú y necesita parámetros (ej. formato Clave: valor esperado). NULL si el comando no requiere campos.';

-- El tipo 'SCRIPT' se suma a los ya existentes ('CALENDARIO','API_EXTERNA') por convención
-- de datos, no hay constraint de tipo en wts_comando_tipo hoy — no requiere ALTER.

-- ── Lista blanca por comando ────────────────────────────────────────────────
CREATE TABLE public.wts_comando_lista_blanca (
  wts_comando_lista_blanca_id      SERIAL PRIMARY KEY,
  wts_comando_id                   INT NOT NULL REFERENCES public.wts_comando(wts_comando_id),
  wts_contacto_id                  INT REFERENCES public.wts_contacto(wts_contacto_id),
  wts_comando_lista_blanca_numero  VARCHAR(30),
  wts_comando_lista_blanca_estado  SMALLINT DEFAULT 1,
  user_crea    VARCHAR(100),
  fecha_crea   TIMESTAMP DEFAULT NOW()
);
COMMENT ON TABLE public.wts_comando_lista_blanca
  IS 'Contactos autorizados para comandos EXTERNO con publico=0. Al menos uno de wts_contacto_id / wts_comando_lista_blanca_numero debe venir informado.';

-- ── Árbol de menú ────────────────────────────────────────────────────────────
CREATE TABLE public.wts_menu_nodo (
  wts_menu_nodo_id      SERIAL PRIMARY KEY,
  wts_cuenta_id         INT REFERENCES public.wts_cuenta(wts_cuenta_id),
  wts_menu_nodo_nivel   SMALLINT NOT NULL CHECK (wts_menu_nodo_nivel BETWEEN 1 AND 4),
  wts_menu_nodo_texto   TEXT NOT NULL,
  wts_menu_nodo_estado  SMALLINT DEFAULT 1,
  user_crea  VARCHAR(100),
  fecha_crea TIMESTAMP DEFAULT NOW()
);
COMMENT ON COLUMN public.wts_menu_nodo.wts_menu_nodo_texto
  IS 'Solo el ENCABEZADO del nodo (ej. "👋 ¿Qué necesitas?") — la lista numerada de opciones NO va acá, se arma dinámicamente por renderizarNodoMenu() a partir de wts_menu_opcion, filtrada según permisos de quien escribe (ver sección 4.5, Opción B2).';

CREATE TABLE public.wts_menu_entrada (
  wts_menu_entrada_id       SERIAL PRIMARY KEY,
  wts_menu_nodo_id          INT NOT NULL REFERENCES public.wts_menu_nodo(wts_menu_nodo_id),
  wts_menu_entrada_palabra  VARCHAR(100) NOT NULL,
  wts_menu_entrada_estado   SMALLINT DEFAULT 1
);
COMMENT ON TABLE public.wts_menu_entrada
  IS 'Frases que, al escribirlas sin tener conversación de menú activa, activan el nodo (normalmente nivel 1). Varias filas = varios sinónimos. Match exacto, trim + minúsculas.';

CREATE TABLE public.wts_menu_opcion (
  wts_menu_opcion_id            SERIAL PRIMARY KEY,
  wts_menu_nodo_id              INT NOT NULL REFERENCES public.wts_menu_nodo(wts_menu_nodo_id),
  wts_menu_opcion_valor         VARCHAR(20) NOT NULL,
  wts_menu_opcion_etiqueta      VARCHAR(200) NOT NULL,
  wts_menu_opcion_orden         SMALLINT NOT NULL DEFAULT 0,
  wts_menu_opcion_tipo          VARCHAR(20) NOT NULL
    CHECK (wts_menu_opcion_tipo IN ('SUBMENU','COMANDO','RESPUESTA','VOLVER','SALIR')),
  wts_menu_opcion_destino_nodo_id INT REFERENCES public.wts_menu_nodo(wts_menu_nodo_id),
  wts_comando_id                INT REFERENCES public.wts_comando(wts_comando_id),
  wts_menu_opcion_respuesta     TEXT,
  wts_menu_opcion_estado        SMALLINT DEFAULT 1,
  UNIQUE (wts_menu_nodo_id, wts_menu_opcion_valor)
);
COMMENT ON COLUMN public.wts_menu_opcion.wts_menu_opcion_valor
  IS 'Lo que el usuario debe escribir para elegir esta opción, ej "1", "0". Es FIJO — nunca se renumera aunque la opción quede oculta para algún remitente (Opción B2, ver 4.5).';
COMMENT ON COLUMN public.wts_menu_opcion.wts_menu_opcion_etiqueta
  IS 'Texto que se muestra junto al número en el menú renderizado, ej "Crear recordatorio". Antes esto vivía embebido en wts_menu_nodo_texto; ahora es por-opción porque el texto del nodo se arma dinámicamente.';
COMMENT ON COLUMN public.wts_menu_opcion.wts_menu_opcion_orden
  IS 'Orden de aparición en el menú renderizado (independiente de wts_menu_opcion_valor). Menor primero. En empate, por wts_menu_opcion_id.';
COMMENT ON COLUMN public.wts_menu_opcion.wts_menu_opcion_destino_nodo_id
  IS 'Requerido si tipo=SUBMENU';
COMMENT ON COLUMN public.wts_menu_opcion.wts_comando_id
  IS 'Requerido si tipo=COMANDO. Determina si la opción se filtra para el remitente: se oculta si wts_comando_origen=INTERNO y el remitente no es self-chat, o si origen=EXTERNO con publico=0 y el remitente no está en wts_comando_lista_blanca para ese comando.';
COMMENT ON COLUMN public.wts_menu_opcion.wts_menu_opcion_respuesta
  IS 'Requerido si tipo=RESPUESTA — texto fijo que se envía (soporta {{variables}} simples si hace falta a futuro)';

-- ── Estado de conversación por remitente ────────────────────────────────────
CREATE TABLE public.wts_conversacion_estado (
  wts_conversacion_estado_id        SERIAL PRIMARY KEY,
  wts_cuenta_id                     INT NOT NULL REFERENCES public.wts_cuenta(wts_cuenta_id),
  wts_conversacion_jid              VARCHAR(100) NOT NULL,
  wts_menu_nodo_id                  INT NOT NULL REFERENCES public.wts_menu_nodo(wts_menu_nodo_id),
  wts_conversacion_esperando_comando_id INT REFERENCES public.wts_comando(wts_comando_id),
  fecha_actualiza                   TIMESTAMP DEFAULT NOW(),
  UNIQUE (wts_cuenta_id, wts_conversacion_jid)
);
COMMENT ON COLUMN public.wts_conversacion_estado.wts_conversacion_esperando_comando_id
  IS 'NULL = esperando número de opción de wts_menu_nodo_id. Si tiene valor = esperando texto libre Clave:valor para ese comando (nivel 2).';

-- ── Parámetro global de timeout ─────────────────────────────────────────────
INSERT INTO public.wts_configuracion
  (wts_configuracion_clave, wts_configuracion_valor, wts_configuracion_estado, user_crea, fecha_crea)
VALUES
  ('MENU_TIMEOUT_MINUTOS', '15', 1, 'SISTEMA', NOW());
```

- [ ] Migración creada y ejecutada en `alerta_wts` (pgAdmin o `psql`).
- [ ] Verificado con `\d wts_comando` (o consulta a `information_schema.columns`) que las
      columnas nuevas quedaron con los defaults esperados.

## 3. Migrar datos existentes

Clasificar los 2 comandos actuales — ambos siguen siendo `INTERNO` (nada cambia para
ellos en la práctica), pero ahora quedan también visibles en el menú:

```sql
UPDATE wts_comando SET
  wts_comando_origen        = 'INTERNO',
  wts_comando_acceso_libre  = 1,
  wts_comando_visible_menu  = 1,
  wts_comando_instrucciones = CASE wts_comando_nombre
    WHEN 'crear_recordatorio' THEN
      'Titulo: <texto>;
Mensaje: <opcional>;
Fecha: DD-MM-YYYY o DD-MM-YYYY HH:MM;
Recordatorio: HH:MM | N dias antes | N horas antes | N minutos antes (opcional)'
    WHEN 'consulta_gastos' THEN
      'Producto: <texto> (opcional)
Periodo: hoy | mes | año (opcional, solo afecta a Producto)
Gastos: hoy | DD-MM-YYYY (opcional)'
  END
WHERE wts_comando_nombre IN ('crear_recordatorio','consulta_gastos');
```

Crear el menú raíz de ejemplo (nivel 1) con las 2 opciones existentes, entrada `"hola"`
y `"menu"`:

```sql
-- El texto es SOLO el encabezado — la lista de opciones la arma renderizarNodoMenu()
INSERT INTO wts_menu_nodo (wts_menu_nodo_nivel, wts_menu_nodo_texto)
VALUES (1, '👋 ¿Qué necesitas?')
RETURNING wts_menu_nodo_id;   -- anotar el id devuelto, ej. 1

INSERT INTO wts_menu_entrada (wts_menu_nodo_id, wts_menu_entrada_palabra) VALUES
  (1, 'hola'),
  (1, 'menu');

INSERT INTO wts_menu_opcion (wts_menu_nodo_id, wts_menu_opcion_valor, wts_menu_opcion_etiqueta, wts_menu_opcion_orden, wts_menu_opcion_tipo, wts_comando_id) VALUES
  (1, '1', 'Crear recordatorio', 10, 'COMANDO', (SELECT wts_comando_id FROM wts_comando WHERE wts_comando_nombre='crear_recordatorio')),
  (1, '2', 'Consultar gastos',   20, 'COMANDO', (SELECT wts_comando_id FROM wts_comando WHERE wts_comando_nombre='consulta_gastos'));

INSERT INTO wts_menu_opcion (wts_menu_nodo_id, wts_menu_opcion_valor, wts_menu_opcion_etiqueta, wts_menu_opcion_orden, wts_menu_opcion_tipo, wts_menu_opcion_respuesta) VALUES
  (1, '0', 'Salir', 999, 'RESPUESTA', '👋 Listo, cualquier cosa escribe "Hola".');
```

- [ ] Comandos existentes actualizados con los flags.
- [ ] Nodo raíz + entradas + opciones creados.
- [ ] Probado manualmente en pgAdmin que las 3 filas de `wts_menu_opcion` quedaron
      apuntando al `wts_comando_id` correcto (no `NULL` por typo en el nombre).

## 4. Cambios de código

### 4.1 `scripts/` — carpeta contenedora única, dos subcarpetas con límites distintos

**Decisión del usuario:** todo lo relacionado a comandos ejecutables vive junto bajo un
mismo padre `scripts/` en la raíz del proyecto, para no dispersar archivos — pero adentro
hay dos subcarpetas con fronteras de ejecución completamente distintas:

```
scripts/
├── script-sh/        ← ejecuta el propio contenedor (tipo SCRIPT) — SÍ se monta en Docker
│   └── ping_test.sh
└── agentes-host/      ← corre nativo en Windows, fuera de Docker (tipo HOST_HTTP) — NO se monta
    ├── vpn-agent.js
    ├── VPN_Automatico.bat
    └── .env            (no versionado)
```

- [ ] Crear `C:\bot-whatsapp\scripts\script-sh\` con un script de prueba, ej. `ping_test.sh`:
  ```sh
  #!/bin/sh
  echo "ok $(date)"
  ```
- [ ] Agregar a `docker-compose.yml` (junto a los volúmenes existentes) — **solo** la
      subcarpeta `script-sh/`, nunca `scripts/` completa. Así `agentes-host/` (que puede
      tener secretos como `VPN_AGENT_TOKEN` en su `.env`) nunca llega al contenedor:
  ```yaml
  - ./scripts/script-sh:/app/scripts/script-sh
  ```
  (para poder editar/agregar scripts sin rebuild — igual que `src/admin`)
- [ ] Si el contenedor no corre como root o hay problemas de permisos, dar permiso de
      ejecución desde el host antes de montarlo, o `RUN chmod +x` en el `Dockerfile` para
      los que sí vayan copiados en build.
- [ ] Crear `C:\bot-whatsapp\scripts\agentes-host\` — código de agentes nativos de Windows
      (agente VPN, sección 4.6, y cualquier otro que se agregue después). **No** aparece
      en `docker-compose.yml` bajo ningún concepto.
- [ ] Mover `VPN_Automatico.bat` a `scripts\agentes-host\VPN_Automatico.bat`.

> ⚠️ Un `.bat` de Windows jamás debe terminar en `scripts/script-sh/` — el contenedor no
> tiene `cmd.exe`/PowerShell, ese `execFile` fallaría. La regla simple para no confundirlas:
> si el código necesita algo del sistema operativo Windows (VPN, servicios, registro, etc.)
> va en `agentes-host/`; si solo necesita lo que ya vive dentro del contenedor (BD, sistema
> de archivos del propio Linux, red del contenedor) va en `script-sh/`.

### 4.2 `src/comandos.js` — nuevo tipo `SCRIPT`

- [ ] Agregar función `ejecutarScript(comando, campos)`:
  ```js
  const path = require('path')
  const { execFile } = require('child_process')

  const SCRIPTS_DIR = path.resolve(__dirname, '..', 'scripts', 'script-sh')

  function ejecutarScript(comando) {
    const archivo = comando.config?.archivo
    if (!archivo) throw new Error('comando SCRIPT sin "archivo" configurado')

    const ruta = path.resolve(SCRIPTS_DIR, archivo)
    if (!ruta.startsWith(SCRIPTS_DIR + path.sep)) {
      throw new Error('ruta de script fuera de la carpeta permitida')
    }

    return new Promise((resolve) => {
      execFile(ruta, { timeout: comando.config?.timeout_ms || 10000 }, (err, stdout, stderr) => {
        if (err) return resolve({ salida: `error: ${err.message}` })
        resolve({ salida: (stdout || stderr || '').trim().slice(0, 1000) })
      })
    })
  }
  ```
  Notas de seguridad ya decididas: `archivo` es un nombre relativo (`"ping_test.sh"`), NO
  una ruta absoluta — se resuelve siempre contra `SCRIPTS_DIR` y se valida que el
  resultado no se escape con `..`. Si mañana se quiere permitir rutas fuera de
  `scripts/`, es una decisión nueva a confirmar, no cambiar esto por defecto.
- [ ] Sumar `case 'SCRIPT': return ejecutarScript(comando, campos)` en `ejecutarComando()`.
- [ ] `wts_comando_config` de un comando `SCRIPT` de ejemplo:
  ```json
  { "archivo": "ping_test.sh", "timeout_ms": 10000 }
  ```
  y `wts_comando_respuesta`: `"✅ {{salida}}"`.

### 4.3 `src/db.js` — funciones de permisos y menú

- [ ] `buscarComando(cuentaId, campos, remitenteInfo)` — extender el filtro actual para
      que además de matchear por `campos_clave`, valide permisos:
  ```
  candidatos = comandos activos con acceso_libre=1 que matchean campos_clave
  por cada candidato:
    si origen === 'INTERNO' → solo pasa si remitenteInfo.esSelfChat
    si origen === 'EXTERNO':
       si publico === 1 → pasa
       si publico === 0 → pasa solo si remitenteInfo.jid está en wts_comando_lista_blanca
                           para ese wts_comando_id (por wts_contacto_id o por número)
  devolver el primero que pase, o null
  ```
- [ ] `buscarNodoPorPalabraEntrada(texto)` — `SELECT ... FROM wts_menu_entrada WHERE
      LOWER(TRIM(wts_menu_entrada_palabra)) = LOWER(TRIM($1)) AND estado=1`, devuelve el
      `wts_menu_nodo_id` o `null`.
- [ ] `obtenerEstadoConversacion(cuentaId, jid)` — lee `wts_conversacion_estado`,
      devuelve `null` si no existe o si `fecha_actualiza` supera `MENU_TIMEOUT_MINUTOS`
      (y en ese caso lo borra).
- [ ] `guardarEstadoConversacion(cuentaId, jid, nodoId, esperandoComandoId)` — upsert
      (`ON CONFLICT (wts_cuenta_id, wts_conversacion_jid) DO UPDATE ...`).
- [ ] `borrarEstadoConversacion(cuentaId, jid)`.
- [ ] `obtenerNodoMenu(nodoId)` + `obtenerOpcionesNodo(nodoId)` — para renderizar/validar
      una opción elegida.
- [ ] `contactoEnListaBlanca(comandoId, jid, contactoId)` — usada por `buscarComando` y
      por el filtro de opciones visibles del menú.
- [ ] `puedeVerOpcion(opcion, remitenteInfo)` — regla de permiso compartida por
      `renderizarNodoMenu()` y por la validación de la opción elegida (4.4):
  ```
  si opcion.tipo !== 'COMANDO' → true   (SUBMENU/RESPUESTA/VOLVER/SALIR siempre visibles)
  comando = comandoPorId(opcion.wts_comando_id)
  si comando.origen === 'INTERNO' → remitenteInfo.esSelfChat
  si comando.origen === 'EXTERNO':
     si comando.publico === 1 → true
     si comando.publico === 0 → contactoEnListaBlanca(comando.id, remitenteInfo.jid, remitenteInfo.contactoId)
  ```
- [ ] `renderizarNodoMenu(nodoId, remitenteInfo)` — **Opción B2** (ver 4.5): arma el texto
      final que se envía por WhatsApp.
  ```js
  async function renderizarNodoMenu(nodoId, remitenteInfo) {
    const nodo     = await obtenerNodoMenu(nodoId)
    const opciones = await obtenerOpcionesNodo(nodoId)   // ya ordenadas por wts_menu_opcion_orden
    const visibles = []
    for (const o of opciones) {
      if (await puedeVerOpcion(o, remitenteInfo)) visibles.push(o)
    }
    const lineas = visibles.map(o => `${o.valor}. ${o.etiqueta}`)
    return [nodo.texto, ...lineas].join('\n')
  }
  ```
  Importante: `wts_menu_opcion_valor` **no se toca** al filtrar — si la opción `"2"` no es
  visible para este remitente, la lista simplemente pasa de `"1"` a `"3"` (huecos
  permitidos, nunca renumeración). Esto es intencional (decisión B2).

### 4.4 `src/whatsapp.js` — flujo de decisión en `messages.upsert`

- [ ] Insertar, antes del guardado normal de "mensaje recibido" y respetando el orden ya
      documentado en la conversación de diseño:
  ```
  1. estado = obtenerEstadoConversacion(cuentaId, jid)
     si estado existe:
       si estado.esperando_comando_id != null:
           // nivel 2: texto libre para ese comando específico
           campos = parsearCampos(texto)
           resultado = ejecutarComando(cuentaId, comandoPorId(estado.esperando_comando_id), campos)
           enviarMensaje(... renderizar(...))
           borrarEstadoConversacion(cuentaId, jid)
           return  // no seguir al flujo normal
       si no:
           // esperando número de opción
           opcion = buscarOpcion(estado.nodo_id, texto.trim())
           // ojo: buscarOpcion() encuentra la fila por valor, pero además hay que revalidar
           // permiso acá — no alcanza con que no aparezca en el texto renderizado, porque
           // nada impide que alguien escriba a ciegas un número que en su menú no se veía.
           si no existe O !puedeVerOpcion(opcion, remitenteInfo)
               → enviarMensaje(await renderizarNodoMenu(estado.nodo_id, remitenteInfo))  // opción inválida: se re-muestra el menú ya filtrado, mismo estado
               → return
           según opcion.tipo:
             SUBMENU   → enviarMensaje(await renderizarNodoMenu(opcion.destino_nodo_id, remitenteInfo))
                         guardarEstadoConversacion(opcion.destino_nodo_id, null)
             RESPUESTA → enviarMensaje(opcion.respuesta); borrarEstadoConversacion()
             VOLVER    → (si se modela así en vez de SUBMENU al padre)
             SALIR     → enviarMensaje(despedida); borrarEstadoConversacion()
             COMANDO   → si comando.campos_clave.length === 0: ejecutar directo y borrar estado
                         si no: enviarMensaje(comando.instrucciones);
                                guardarEstadoConversacion(mismoNodo, comando.id)  // pasa a nivel 2
           return

  2. si no hay estado:
       a) campos = parsearCampos(texto)
          si campos no vacío:
             comando = buscarComando(cuentaId, campos, { esSelfChat, jid, contactoId })
             si comando → ejecutar, responder, return  (comportamiento actual, ahora filtrado por permisos)
       b) nodoId = buscarNodoPorPalabraEntrada(texto)
          si nodoId:
             enviarMensaje(await renderizarNodoMenu(nodoId, remitenteInfo))
             guardarEstadoConversacion(nodoId, null); return
       c) seguir el flujo actual sin cambios (guardar como mensaje recibido normal)
  ```
- [ ] Ojo con el watchdog: los mensajes `PING_WATCHDOG_` ya tienen prioridad especial en
      el código actual — este nuevo bloque va **después** de esa verificación, nunca antes.

### 4.5 Filtrado de opciones visibles según quién escribe — **RESUELTO: Opción B2**

Decisión: el texto de un nodo **se genera en cada request** (`renderizarNodoMenu()`, ver
4.3) combinando el encabezado fijo con solo las opciones `COMANDO` que el remitente puede
usar. El número de cada opción (`wts_menu_opcion_valor`) es **fijo y estable** — nunca se
renumera para "compactar" lo que falta. Si a un contacto externo le falta la opción `"2"`
(por ser `INTERNO`), su menú salta de `"1"` a `"3"` directo, con hueco.

Se descartaron dos alternativas:
- **Opción A** (texto fijo para todos, la opción no autorizada "rebota" recién al
  elegirla) — más simple pero peor UX y filtra el nombre de comandos internos a
  cualquiera.
- **Opción B1** (renumerar para que sea siempre `1, 2, 3...` consecutivo) — se ve más
  prolijo pero el mismo número (`"2"`) significa una opción distinta según quién mira,
  lo cual es confuso y complica el mapeo al validar la respuesta.

**Cómo se ve (con un menú de ejemplo: opción `"2"` = `Reiniciar servicio`, marcada
`INTERNO`; el resto `EXTERNO` público):**

```
┌─ "Yo" (self-chat) — ve todas las opciones ──────────────────────┐
│ Tú: Hola                                                          │
│                                                                    │
│ Bot: 👋 ¿Qué necesitas?                                          │
│      1. Crear recordatorio                                      │
│      2. Reiniciar servicio                                      │
│      3. Consultar gastos                                        │
│      0. Salir                                                   │
└───────────────────────────────────────────────────────────────┘

┌─ Contacto externo — la opción 2 no existe para él, queda el hueco ┐
│ Contacto: Hola                                                      │
│                                                                      │
│ Bot: 👋 ¿Qué necesitas?                                            │
│      1. Crear recordatorio                                        │
│      3. Consultar gastos      ← salta del "1" al "3", no se corre  │
│      0. Salir                                                     │
└─────────────────────────────────────────────────────────────────┘

┌─ Contacto externo escribe igual "2" (a ciegas / probando) ─────────┐
│ Contacto: 2                                                          │
│                                                                      │
│ Bot: 👋 ¿Qué necesitas?      ← se re-muestra el menú ya filtrado,  │
│      1. Crear recordatorio     mismo estado de conversación,       │
│      3. Consultar gastos       sin mensaje de error aparte         │
│      0. Salir                                                     │
└─────────────────────────────────────────────────────────────────┘
```

Nota de implementación clave: la validación de permiso se hace **dos veces** — al
renderizar (para no listar la opción) y al procesar la respuesta del usuario (por si
escribe un número que en su pantalla no aparecía). Sin la segunda validación, alguien
podría intentar `"2"` a ciegas y ejecutar un comando `INTERNO` aunque nunca lo haya visto
listado — el chequeo en `puedeVerOpcion()` dentro del flujo de `whatsapp.js` (4.4) cubre
justamente ese caso.

- [x] Decisión tomada y documentada (Opción B2).
- [ ] Implementado en `renderizarNodoMenu()` + validación de opción elegida (4.3 y 4.4).

### 4.6 Comando `conectar_vpn` — tipo nuevo `HOST_HTTP` (agente en el host Windows) — ✅ IMPLEMENTADO

**Estado: funcionando de punta a punta**, incluyendo Tarea Programada sobreviviendo un
reinicio completo. El diseño real terminó bastante distinto del boceto original de esta
sección — quedó documentado abajo tal cual se construyó, no como quedó planeado al
principio. Puntos que cambiaron respecto al primer borrador:

1. El agente **no es un endpoint fijo `/vpn/conectar`** — es un despachador genérico por
   `nombre` (`/proceso/iniciar|estado|terminar?nombre=...`), con un catálogo `DEFINICIONES`
   en el propio `vpn-agent.js`. `vpn` es hoy la única entrada, pero agregar una acción de
   host nueva en el futuro es sumar una entrada al catálogo, no un archivo nuevo.
2. Hay **dos scripts VPN distintos**, no uno: `C:\VPNA.ps1` (fuera del repo, ya existía,
   watchdog perpetuo `while($true)` que nunca termina solo) para el modo `consola`, y
   `scripts/agentes-host/vpn-once.ps1` (nuevo, dentro del repo) para el modo `sinconsola`
   — un solo intento que sí termina y devuelve un resultado real. Se necesitaron los dos
   porque son dos comportamientos genuinamente distintos (dejar vigilando para siempre vs.
   conectar una vez y listo), no una sola acción con una bandera.
3. La respuesta del comando **se encola en `wts_mensaje`** (`encolarRespuestaComando()` en
   `db.js`) en vez de mandarse directo por el socket — conectar la VPN interrumpe la red
   del contenedor un instante, y un `sock.sendMessage()` directo se quedaba colgado para
   siempre esperando un ACK sobre una conexión ya muerta. El scheduler que ya existe
   reintenta solo cuando WhatsApp se reconecta, así que se aprovechó esa cola en vez de
   pelear contra la desconexión momentánea. Detalle completo al final de esta sección.

#### a) Agente HTTP en el host — `C:\bot-whatsapp\scripts\agentes-host\vpn-agent.js` ✅

- [x] Carpeta `scripts/agentes-host/` — **NO** se monta en Docker ni se copia a la imagen.
      `scripts/agentes-host/.env` y `scripts/agentes-host/procesos.json` están en
      `.gitignore`; los `.js`/`.ps1` sí se versionan.
- [x] Sin la dependencia `dotenv` — el `.env` se carga con un parser propio de ~8 líneas
      (`cargarEnv()`), para no necesitar `npm install` en una carpeta que corre fuera de
      Docker sin `package.json` propio.
- [x] Catálogo `DEFINICIONES` — cada entrada define `iniciar(modo)` (para el modo
      `consola`, perpetuo) y `conectarUnaVez(callback)` (para `sinconsola`, de una sola
      vez), más un `alTerminar()` opcional:
  ```js
  const DEFINICIONES = {
    vpn: {
      iniciar(modo) {
        // Siempre powershell.exe directo, nunca cmd.exe/.bat — así el PID rastreado
        // es siempre el proceso real (ver nota de "terminar" más abajo).
        return spawn('powershell.exe', [
          '-ExecutionPolicy', 'Bypass', '-NoProfile',
          '-WindowStyle', modo === 'consola' ? 'Normal' : undefined, // ver nota (*)
          '-File', PS1_WATCHDOG   // C:\VPNA.ps1
        ].filter(Boolean), {
          cwd: __dirname, detached: true, stdio: 'ignore',
          windowsHide: modo !== 'consola'
        })
      },
      conectarUnaVez(callback) {
        execFile('powershell.exe', [
          '-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', PS1_ONCE  // vpn-once.ps1
        ], { cwd: __dirname, timeout: 20000, windowsHide: true }, callback)
      },
      alTerminar() {
        spawnSync('rasdial', [VPN_NOMBRE, '/disconnect'])
      }
    }
  }
  ```
  (*) **Nota de una vuelta de depuración larga:** pasarle `-WindowStyle Hidden` a
  PowerShell cuando de todos modos no se le crea ninguna consola (`windowsHide: true` de
  Node ya evita eso) hacía que el proceso saliera con código `0` casi al instante, sin
  ejecutar nada del script — pedirle que "oculte" una ventana que nunca existió lo corta.
  En modo `sinconsola` el argumento `-WindowStyle` **no se pasa en absoluto**; alcanza con
  `windowsHide: true` de Node.
- [x] Endpoints (todos requieren header `x-agent-token`):
  ```
  POST /proceso/iniciar?nombre=vpn&modo=consola|sinconsola
  GET  /proceso/estado?nombre=vpn
  POST /proceso/terminar?nombre=vpn
  ```
  `modo=consola` es fire-and-forget (nunca termina solo, se rastrea por PID en
  `procesos.json` y se corta con `/proceso/terminar`). `modo=sinconsola` espera el
  resultado real con `execFile` (hasta 20s) y no deja nada corriendo — no hay nada que
  rastrear ni terminar en ese modo.
- [x] `procesos.json` (no `vpn.pid` como se pensó al principio) — registro genérico
      `{ nombre: { pid, modo, iniciado } }`, para poder rastrear más de un proceso a la
      vez si se agregan más entradas al catálogo.
- [x] `terminar` mata el PID rastreado **y** llama `alTerminar()` — matar el watchdog no
      desconecta la VPN (`rasdial` vive a nivel del SO, no del proceso que lo disparó), así
      que sin el `alTerminar()` la VPN quedaría conectada y sin nadie vigilándola.

#### b) Exponerlo a Docker — sin regla de firewall, funciona tal cual

- [x] Confirmado con pruebas reales: el contenedor alcanza
      `http://host.docker.internal:5905` sin ninguna regla de Windows Firewall agregada.
- [ ] *(Opcional, no bloqueante)* Si más adelante se quiere restringir el puerto a la red
      de Docker por defensa en profundidad (el token ya protege el endpoint, esto sería
      una capa extra), primero hay que confirmar el rango real que usa Docker Desktop en
      esta máquina — **no asumir `172.17.0.0/16`** como en Linux, Docker Desktop en
      Windows/WSL2 puede usar otro rango.

#### c) Token fijo — mismo patrón que `API_KEY` / `API_GASTOS_TOKEN` ✅

- [x] Token estático de 48 hex, sin expiración/rotación, en `.env` de ambos lados
      (raíz del proyecto y `scripts/agentes-host/.env`), comparado por igualdad
      (`===`) contra el header `x-agent-token`.
- [x] `VPN_AGENT_TOKEN` y `VPN_AGENT_URL=http://host.docker.internal:5905` agregados al
      `.env` raíz; `docker compose up -d --build` para que el contenedor lo recoja.

#### d) Iniciar el agente automáticamente — Tarea Programada de Windows ✅

- [x] **No corre como `SYSTEM`** — corre con la cuenta de usuario real, configurada como
      "ejecutar tanto si el usuario inició sesión como si no". Motivo: la conexión VPN
      (`NORTE`) está asociada al perfil del usuario, no a "todos los usuarios" — `SYSTEM`
      tiene un perfil completamente distinto y no vería esa conexión, `rasdial` fallaría
      aunque el agente arrancara perfecto.
  - Programa: `C:\Program Files\nodejs\node.exe`
  - Argumentos: `C:\bot-whatsapp\scripts\agentes-host\vpn-agent.js`
  - Disparador: al iniciar el equipo
  - Nombre genérico (`Agente de Host bot-whatsapp`, no "...VPN...") porque el catálogo
    `DEFINICIONES` está pensado para más de una acción de host a futuro.
- [x] Verificado con un reinicio real del equipo — el agente queda corriendo solo.

#### e) `wts_comando` — alta del comando `conectar_vpn` ✅

```sql
INSERT INTO wts_comando (
  wts_comando_nombre, wts_comando_tipo, wts_comando_campos_clave,
  wts_comando_config, wts_comando_respuesta
) VALUES (
  'conectar_vpn',
  'HOST_HTTP',
  '["Vpn"]',
  '{"url": "http://host.docker.internal:5905/proceso/iniciar", "metodo": "POST", "token_env": "VPN_AGENT_TOKEN", "params": {"nombre": "vpn", "modo": "sinconsola"}}',
  '🔌 {{mensaje}}'
);
```
Se dispara escribiendo al chat "Yo": `Vpn: conectar` (mayúsculas/minúsculas no importan en
el nombre del campo — ver nota de `normalizarClave()` más abajo). Campo opcional
`Modo: consola` en el mismo mensaje para pedir el watchdog visible en vez del intento único.

> Nota: las columnas `wts_comando_origen`, `wts_comando_publico`, `wts_comando_acceso_libre`,
> `wts_comando_visible_menu` de la sección 1/2 de este documento **todavía no existen** en
> la base — este `INSERT` usa solo las columnas que ya existían antes de este plan (mismas
> que `crear_recordatorio`/`consulta_gastos`). El gate real hoy sigue siendo únicamente
> `wts_cuenta_consola_activo` + que el mensaje venga del chat "Yo" — igual que los otros dos
> comandos. Si se implementa la sección 2 más adelante, este `INSERT` debe actualizarse para
> sumar `wts_comando_origen = 'INTERNO'` explícito.

#### f) `src/comandos.js` — dispatcher del tipo `HOST_HTTP` ✅

```js
async function ejecutarHostHttp(comando, campos) {
  const cfg   = comando.config || {}
  const token = process.env[cfg.token_env]
  const url   = new URL(cfg.url)
  for (const [clave, valor] of Object.entries(cfg.params || {})) {
    url.searchParams.set(clave, valor)
  }
  if (campos.Modo) url.searchParams.set('modo', campos.Modo.trim().toLowerCase())

  const resp = await fetch(url, {
    method: cfg.metodo || 'POST',
    headers: { 'x-agent-token': token },
  })
  const data = await resp.json().catch(() => null)
  return { mensaje: data?.mensaje || `error inesperado del agente de host (HTTP ${resp.status})` }
}
```
`case 'HOST_HTTP': return ejecutarHostHttp(comando, campos)` sumado en `ejecutarComando()`.
No lanza excepción si el agente responde `ok:false` — ese mensaje (armado por el propio
agente, ej. `"vpn" ya en ejecución (PID ...)`) ya es legible tal cual, mismo patrón que
`ejecutarApiExterna()`.

> Diferencia clave con `SCRIPT` (4.2): `SCRIPT` ejecuta un archivo *dentro* del propio
> contenedor (`execFile` local, carpeta `scripts/script-sh/`); `HOST_HTTP` le pega por red a
> un proceso que corre *fuera* de Docker, en el host. Son dos tipos separados a propósito —
> no forzar la VPN dentro de `SCRIPT` porque ahí nunca podría ejecutar PowerShell de Windows.

#### g) Entrega resiliente de la respuesta — encolar en vez de enviar directo ✅

**El problema descubierto en pruebas reales:** conectar la VPN corta la red del contenedor
un instante (se ve en los logs como `"unexpected error in 'init queries'" / Timed Out` de
Baileys, justo después de `messages.upsert recibido`). Mandar la respuesta con
`sock.sendMessage()` directo, sobre el socket que existía *antes* del corte, se quedaba
colgado para siempre esperando un ACK que ya no iba a llegar — sin lanzar excepción, sin
loguear nada, el mensaje simplemente nunca salía.

**Arreglo — dos partes:**

1. `src/db.js` — `encolarRespuestaComando(cuentaId, destino, texto)`: en vez de enviar
   directo, inserta un `wts_mensaje` normal (`estado=1`, `tipo=1`, `origen=3`,
   `prioridad=5`, `fecha_programada=NOW()`, `user_crea='COMANDO'`). El scheduler que ya
   existe (`INTERVALO_MINUTOS`, 1 min por defecto) lo recoge en su próximo ciclo — llega
   igual aunque la reconexión de WhatsApp tarde unos segundos.
2. `src/whatsapp.js` — el `messages.upsert` handler llama `encolarRespuestaComando()` en
   vez de `sock.sendMessage()` para las respuestas de comandos de consola. De paso, se
   corrigió que `sock.readMessages()` (para `LEER_MENSAJES_MARCAR_LEIDO`) tome el socket
   vivo desde el Map `cuentas.get(cuentaId)?.sock` en vez del `sock` de la clausura del
   handler — mismo riesgo de socket viejo, aplica a cualquier reconexión, no solo a la VPN.

> Este patrón de "encolar en vez de enviar directo" queda disponible para cualquier
> comando futuro cuya acción pueda interrumpir la red (no es exclusivo de VPN) — el
> mecanismo ya está en `db.js`, solo hay que llamarlo en vez de `sock.sendMessage()`.

#### h) Detalle no documentado antes — `normalizarClave()` en `comandos.js`

- [x] El nombre del campo (`Titulo`, `Fecha`, `Modo`, `Vpn`, etc., la parte antes de `:`)
      se normaliza a "Primera mayúscula, resto minúscula" en `parsearCampos()` antes de
      matchear contra `wts_comando_campos_clave` — así `vpn:`, `VPN:`, `Vpn:` disparan el
      mismo comando. Afecta a los 3 comandos existentes por igual, no es específico de VPN.

## 5. Pruebas manuales de aceptación

- [ ] Desde "Yo": escribir `hola` → aparece el menú de nivel 1.
- [ ] Desde "Yo": elegir `1` → aparecen las instrucciones de `crear_recordatorio`, escribir
      los datos → se crea el evento, estado de conversación se borra.
- [ ] Desde "Yo": elegir `2` → instrucciones de `consulta_gastos`, escribir `Producto: ...`
      → responde el reporte.
- [ ] Desde "Yo": elegir una opción inexistente (`9`) → responde "opción inválida" y
      mantiene el mismo nodo (no se rompe el estado).
- [ ] Desde "Yo": escribir `Titulo: X; Fecha: 30-07-2026` **directo sin pasar por el
      menú** → sigue funcionando igual que hoy (acceso libre intacto).
- [ ] Crear un comando `EXTERNO` + `publico=1` de prueba (tipo `SCRIPT` con
      `ping_test.sh`) y probar desde un número de contacto real (no "Yo") que también
      pueda activarlo.
- [ ] Crear un comando `EXTERNO` + `publico=0` con un contacto en
      `wts_comando_lista_blanca` y confirmar que un contacto NO listado no puede
      ejecutarlo (ni por menú ni libre).
- [ ] Agregar una opción `COMANDO` de tipo `INTERNO` a un nodo que también tiene opciones
      `EXTERNO` (Opción B2, sección 4.5): confirmar que un contacto externo ve el menú con
      el número de esa opción saltado (hueco, sin renumerar), y que si igual escribe ese
      número a ciegas, el bot NO ejecuta nada y vuelve a mostrar el menú filtrado.
- [ ] Dejar pasar >`MENU_TIMEOUT_MINUTOS` sin responder y confirmar que el estado se
      resetea (escribir un número random después no ejecuta nada raro, y `hola` vuelve a
      abrir el menú desde cero).
- [ ] `docker compose up -d --build` (recordar: `whatsapp.js`, `db.js`, `comandos.js` no
      son volumen — todo cambio de código requiere rebuild, no solo restart).
- [x] Desde "Yo": escribir `Vpn: conectar` (o `vpn:`/`VPN:`, ya es insensible a
      mayúsculas) → la VPN conecta de verdad y el bot responde la confirmación dentro de
      ~1 min (encolada, no instantánea — ver 4.6g). Probado end-to-end, incluyendo con la
      VPN ya conectada de antes (`"VPN ya estaba conectada"`).
- [x] Probado `modo=consola` (watchdog visible) + `/proceso/estado` + `/proceso/terminar`
      end-to-end vía `Invoke-RestMethod` directo al agente (sin pasar por el chat).
- [x] Probada la Tarea Programada sobreviviendo un reinicio completo del equipo.
- [ ] **Pendiente, deliberadamente no probado todavía:** `/proceso/terminar?nombre=vpn`
      (mata el watchdog + `rasdial /disconnect`) disparado end-to-end desde el chat — se
      evitó porque en las pruebas la sesión de trabajo dependía de esa misma VPN y
      desconectarla hubiera cortado el acceso remoto. Probar cuando se esté en red local
      o exista otro acceso a la máquina aparte de esa VPN.

## 6. Documentación a actualizar al terminar

- [ ] `Activar_Consola_Comando.md` — agregar el diseño final del menú (tablas, flujo),
      dejar claro que reemplaza/convive con el diseño original de Flujo B.
- [ ] `README.md` — mencionar el menú navegable si se documentan comandos ahí.
- [ ] `INSTALAR v2.md` sección 3.8 — agregar cómo dar de alta un nodo de menú nuevo.
- [ ] `INSTALAR v2.md` sección 3.8 — agregar subsección para levantar el agente de host:
      Tarea Programada (con la cuenta del usuario, no SYSTEM — ver 4.6d), catálogo de
      procesos, comando `conectar_vpn`. El diseño real está completo en la sección 4.6 de
      este documento; falta trasladarlo a la guía de instalación para un usuario nuevo.

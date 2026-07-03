# Plan de implementación — Multi-cuenta WhatsApp

> Archivo temporal de seguimiento. Marcar [ ] → [x] al completar cada paso.

---

## FASE 1 — Base de datos

### 1.1 Crear tabla `wts_cuenta`
- [x] Ejecutar SQL:
```sql
CREATE TABLE wts_cuenta (
  wts_cuenta_id     SERIAL       PRIMARY KEY,
  wts_cuenta_nombre VARCHAR(100) NOT NULL,
  wts_cuenta_numero VARCHAR(20),
  wts_cuenta_estado INTEGER      NOT NULL DEFAULT 1,  -- 1=activa, 0=inactiva
  user_crea         VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
  fecha_crea        TIMESTAMP    NOT NULL DEFAULT NOW(),
  user_modifica     VARCHAR(100),
  fecha_modifica    TIMESTAMP
);

COMMENT ON COLUMN wts_cuenta.wts_cuenta_nombre  IS 'Nombre descriptivo, ej: Ventas, Soporte';
COMMENT ON COLUMN wts_cuenta.wts_cuenta_numero  IS 'Número de teléfono asociado (referencia, no se usa para conexión)';
COMMENT ON COLUMN wts_cuenta.wts_cuenta_estado  IS '1=activa (scheduler la usa), 0=inactiva';

INSERT INTO wts_cuenta (wts_cuenta_nombre, wts_cuenta_numero) VALUES ('Principal', '');
```

### 1.2 Agregar `wts_cuenta_id` a `wts_mensaje`
- [x] Ejecutar SQL:
```sql
ALTER TABLE wts_mensaje
  ADD COLUMN wts_cuenta_id INTEGER REFERENCES wts_cuenta(wts_cuenta_id);

-- Asignar cuenta 1 (Principal) a todos los mensajes existentes
UPDATE wts_mensaje SET wts_cuenta_id = 1;
```

### 1.3 Agregar `wts_cuenta_id` a `wts_calendario`
- [x] Ejecutar SQL:
```sql
ALTER TABLE wts_calendario
  ADD COLUMN wts_cuenta_id INTEGER REFERENCES wts_cuenta(wts_cuenta_id);

UPDATE wts_calendario SET wts_cuenta_id = 1;
```

### 1.4 Actualizar función `wts_generar_mensajes_calendario` en PostgreSQL
- [x] Modificar la función PL/pgSQL para que propague `wts_cuenta_id` del calendario
  al INSERT en `wts_mensaje`.
- [x] Verificar en `migrations/base.sql` y actualizar el CREATE OR REPLACE.

### 1.5 Agregar `wts_cuenta_id` a `wts_grupo`
- [x] Ejecutar SQL:
```sql
ALTER TABLE wts_grupo
  ADD COLUMN wts_cuenta_id INTEGER REFERENCES wts_cuenta(wts_cuenta_id) DEFAULT 1;
```

---

## FASE 2 — Backend Node.js

### 2.1 Refactorizar `src/whatsapp.js` — de socket único a Map de sockets
- [x] Cambiar variable global `sock` por `const cuentas = new Map()`
  donde la clave es `wts_cuenta_id` (integer).
- [ ] Crear función `iniciarCuenta(cuentaId, nombre)`:
  - Crea carpeta de sesión `src/auth/cuenta-{id}/`
  - Inicia socket Baileys con `authState` de esa carpeta
  - Registra el socket en `cuentas.set(cuentaId, { sock, estado })`
  - Maneja reconexión automática por cuenta
- [ ] Adaptar `enviarMensaje(cuentaId, celular, texto)` — recibe el id de cuenta.
- [ ] Adaptar `estaConectado(cuentaId)` — verifica estado de esa cuenta.
- [ ] Adaptar `listarGrupos(cuentaId)` — usa el socket de esa cuenta.
- [ ] Exportar `iniciarCuenta`, `enviarMensaje`, `estaConectado`, `listarGrupos`, `cuentas`.

### 2.2 Actualizar `src/db.js`
- [x] `obtenerPendientes()` — incluir `wts_cuenta_id` en el SELECT.
- [x] `obtenerCuentasActivas()` — nueva función:
  ```sql
  SELECT wts_cuenta_id, wts_cuenta_nombre
  FROM wts_cuenta WHERE wts_cuenta_estado = 1
  ```

### 2.3 Refactorizar `src/index.js` — scheduler multi-cuenta
- [x] Al arrancar, leer cuentas activas de BD e iniciar cada una con `iniciarCuenta()`.
- [x] `procesarPendientes()` — iterar sobre cuentas activas:
  - Por cada cuenta: obtener sus mensajes pendientes filtrados por `wts_cuenta_id`
  - Llamar `enviarMensaje(cuentaId, ...)` con el socket correcto
- [x] Contador `ciclosSinConexion` por cuenta (Map separado).
- [x] `enviarAlertaDesconexion()` recibe el nombre de la cuenta para incluirlo en el correo.

### 2.4 Actualizar `src/mailer.js`
- [x] Recibir `nombreCuenta` como parámetro y mostrarlo en el cuerpo del correo.

---

## FASE 3 — API REST externa

### 3.1 `POST /mensajes` — aceptar `cuenta_id` opcional
- [x] Si no se envía `cuenta_id`, usar cuenta 1 (Principal) como default.
- [x] Validar que la cuenta exista y esté activa.

### 3.2 `GET /estado` — devolver estado de todas las cuentas
- [x] Cambiar respuesta de `{ conectado: bool }` a:
  ```json
  { "cuentas": [{ "id": 1, "nombre": "Principal", "conectado": true }] }
  ```

### 3.3 `GET /grupos` — filtrar por cuenta
- [x] Aceptar query param `?cuenta_id=1`.

---

## FASE 4 — Panel admin

### 4.1 Nueva página `cuentas.html`
- [x] Tabla con lista de cuentas (nombre, número, estado).
- [x] Botón "Agregar cuenta".
- [x] Por cada cuenta: botón "Ver QR" (abre modal con imagen QR).
- [x] Botón "Activar / Desactivar".
- [x] Botón "Eliminar" (solo si no tiene mensajes asociados).

### 4.2 Nueva ruta de admin API `/admin/api/cuentas`
- [x] `GET /` — lista todas las cuentas.
- [x] `POST /` — crea nueva cuenta (crea carpeta auth, inicia socket).
- [x] `PUT /:id` — edita nombre/número/estado.
- [x] `DELETE /:id` — elimina si no tiene mensajes.
- [x] `GET /:id/qr` — devuelve el QR actual de esa cuenta (base64 PNG).

### 4.3 Actualizar `mensajes.html`
- [x] En el formulario de nuevo mensaje: dropdown para seleccionar cuenta.
- [x] En la tabla de mensajes: columna "Cuenta".

### 4.4 Actualizar `calendario.html`
- [x] En el modal de crear/editar evento: dropdown para seleccionar cuenta.

### 4.5 Actualizar `dashboard` (index.html)
- [x] Mostrar estado de conexión por cuenta (badge verde/rojo por cada una).

### 4.6 Agregar "Cuentas" al menú lateral (sidebar)
- [x] Nuevo ítem en el menú de todas las páginas HTML.

---

## FASE 5 — Sesiones y Docker

### 5.1 Estructura de carpetas de sesión
- [ ] Crear `src/auth/cuenta-1/` y mover los archivos actuales de `src/auth/*.json` ahí.
- [ ] Actualizar `docker-compose.yml` — el volumen `src/auth/` ya cubre las subcarpetas.
- [ ] Actualizar `.gitignore`:
  ```
  src/auth/cuenta-*/
  ```

### 5.2 Migración de sesión existente
- [ ] Script de migración que mueve `src/auth/*.json` → `src/auth/cuenta-1/`.

---

## FASE 6 — Pruebas

### 6.1 Prueba cuenta única (no debe romper lo existente)
- [ ] Verificar que con 1 cuenta el bot funciona igual que antes.
- [ ] Verificar que mensajes existentes (sin `wts_cuenta_id`) se asignan a cuenta 1.

### 6.2 Prueba con 2 cuentas
- [ ] Agregar cuenta 2 desde el panel, escanear QR.
- [ ] Crear mensaje asignado a cuenta 2, verificar que se envía desde ese número.
- [ ] Desconectar cuenta 2, verificar que llega alerta de correo solo para esa cuenta.

### 6.3 Prueba de calendario multi-cuenta
- [ ] Crear evento con cuenta 2, verificar que los mensajes generados por trigger
  traen `wts_cuenta_id = 2`.

---

## Resumen de archivos a tocar

| Archivo | Tipo de cambio |
|---|---|
| `migrations/006_multicuenta.sql` | Nuevo — DDL completo de la fase 1 |
| `src/whatsapp.js` | Refactorizar — Map de sockets |
| `src/db.js` | Actualizar — 2 funciones |
| `src/index.js` | Refactorizar — scheduler multi-cuenta |
| `src/mailer.js` | Menor — recibir nombre de cuenta |
| `src/api/routes/mensajes.js` | Menor — campo cuenta_id |
| `src/api/routes/estado.js` | Actualizar — multi-cuenta |
| `src/api/routes/grupos.js` | Menor — filtro por cuenta |
| `src/admin/servidor/rutas/cuentas.js` | Nuevo |
| `src/admin/cuentas.html` | Nuevo |
| `src/admin/mensajes.html` | Actualizar — dropdown cuenta |
| `src/admin/calendario.html` | Actualizar — dropdown cuenta |
| `src/admin/index.html` | Actualizar — badges por cuenta |
| Todas las `*.html` | Agregar ítem "Cuentas" al sidebar |
| `docker-compose.yml` | Verificar volumen |
| `.gitignore` | Actualizar rutas de sesión |

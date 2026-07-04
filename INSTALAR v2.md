# INSTALAR v2 — AlertaWTS
### Guía completa para instalación en equipo nuevo · Usuario no técnico

---

## ÍNDICE

| N° | Sección | Descripción |
|----|---------|-------------|
| **1** | [INSTALACIÓN](#1-instalación) | Software necesario y cómo instalarlo |
| **2** | [CONFIGURACIÓN](#2-configuración) | Archivos, base de datos y usuario admin |
| **3** | [PUESTA EN MARCHA](#3-puesta-en-marcha) | Iniciar el bot y verificar que funciona |
| **4** | [CORRECCIÓN DE ERRORES](#4-corrección-de-errores) | Problemas frecuentes y cómo resolverlos |

> **Tiempo estimado total:** 45 a 90 minutos (según velocidad de internet)

---
---

# 1. INSTALACIÓN

---

## 1.1 — ¿Qué necesito instalar?

Antes de comenzar, el equipo debe tener instalado el siguiente software.
**qué es cada uno y cómo instalarlo**.

| Software        | Para qué sirve                                   | ¿Gratuito?   |
|-----------------|--------------------------------------------------|------------  |
| Docker Desktop  | Ejecuta el bot en un contenedor aislado          | Sí           |
| PostgreSQL 18   | Base de datos donde se guardan los mensajes      | Sí           |
| pgAdmin 4       | Herramienta visual para manejar la base de datos | Sí           |

---

## 1.2 — Docker Desktop y WSL2

### ¿Qué es Docker?
Docker es un programa que permite ejecutar aplicaciones en un ambiente controlado llamado **contenedor**. El bot AlertaWTS corre dentro de un contenedor Docker. Esto significa que no hay que instalar Node.js ni librerías adicionales manualmente — Docker lo hace todo solo.

### ¿Qué es WSL2?
**WSL2** (Windows Subsystem for Linux 2) es una función de Windows que permite a Docker ejecutar contenedores de Linux dentro de Windows. **Sin WSL2 activo, Docker no funcionará.**

### a) Activar WSL2 en Windows

> ⚠️ **IMPORTANTE:** Hacer esto ANTES de instalar Docker Desktop.

1. Abrir **PowerShell como Administrador**
   - Abrir **PowerShell (Administrador)**

2. Ejecutar este comando:
   ```powershell
   wsl --install
   ```

3. Reiniciar el equipo cuando lo solicite.

4. Al reiniciar, se abrirá automáticamente una ventana de Ubuntu pidiendo crear un usuario. Escribir un nombre de usuario (cualquiera, ej: `admin`) y una contraseña. **Esta cuenta solo es para WSL y no afecta Windows.**

5. Verificar que quedó instalado:
   ```powershell
   wsl --list --verbose
   ```
   Debe aparecer algo como:
   ```
   NAME      STATE    VERSION
   Ubuntu    Running  2
   ```

> ✅ Si aparece `VERSION 2` — WSL2 está listo.
> Si da error, ver → **[4A. Docker no inicia](#4a--docker-desktop-no-inicia)**

### b) Instalar Docker Desktop

1. Descargar desde: **https://www.docker.com/products/docker-desktop**
   - Seleccionar **"Download for Windows"**

2. Ejecutar el instalador descargado (`Docker Desktop Installer.exe`)
   - En las opciones de instalación, asegurarse de que esté marcado: **"Use WSL 2 instead of Hyper-V"**
   
3. Al finalizar, reiniciar el equipo si lo solicita.

4. Abrir **Docker Desktop** desde el menú Inicio.
   - La primera vez tarda 1-2 minutos en iniciar
   - Cuando aparezca la pantalla principal con el logo de la ballena → Docker está listo

> ⚠️ **Docker Desktop debe estar abierto y corriendo siempre que quieras usar el bot.** Si se cierra, el bot se detiene.

---

## 1.3 — PostgreSQL (base de datos)

### ¿Qué es PostgreSQL?
Es el sistema de base de datos donde se almacenan todos los contactos, mensajes, plantillas y alertas del sistema.

### a) Descargar e instalar

1. Ir a: **https://www.postgresql.org/download/windows/**
2. Hacer clic en **"Download the installer"**
3. Seleccionar la versión **18** para Windows x86-64
4. Ejecutar el instalador descargado

### b) Durante la instalación

Cuando el instalador pregunte qué componentes instalar, asegurarse de que estén marcados:

- ✅ PostgreSQL Server
- ✅ pgAdmin 4
- ✅ Command Line Tools

Cuando pida **contraseña del superusuario**, escribir una contraseña segura y **anotarla** — se usará más adelante en la configuración.

> ⚠️ **ANOTA ESTA CONTRASEÑA.** Si la pierdes no podrás acceder a la base de datos.

Dejar el puerto en **5432** (valor por defecto).

### c) Verificar que PostgreSQL está corriendo

Abrir PowerShell **como Administrador** y ejecutar:
```powershell
Get-Service "postgresql-x64-18"
```
Debe aparecer `Status: Running`.

> Si no aparece como Running → ver **[4B. PostgreSQL no inicia](#4b--postgresql-no-inicia)**

---

## 1.4 — Copiar el proyecto al equipo

1. Copiar el archivo ZIP/RAR del proyecto al equipo nuevo

2. Descomprimir en la siguiente ruta:
   ```
   C:\bot-whatsapp\
   ```

3. Verificar que la estructura quedó así:
   ```
   C:\bot-whatsapp\
   ├── src\
   ├── migrations\
   │   └── base.sql
   ├── Dockerfile
   ├── docker-compose.yml
   ├── package.json
   └── grupos.txt
   ```

> ⚠️ Si la carpeta quedó dentro de otra carpeta (ej: `C:\bot-whatsapp\bot-whatsapp\`) moverla un nivel hacia arriba.

---
---

# 2. CONFIGURACIÓN

---

## 2.1 — Crear el archivo de configuración (.env)

El archivo `.env` contiene las claves y contraseñas del sistema. **Si no viene incluido en el ZIP** — hay que crearlo manualmente.

   ### a) Para crear .env -> Abrir el Bloc de Notas

   ### b) Pegar este contenido exacto:

   ```env:
   # ── Base de datos ──────────────────────────────────────────
   DB_HOST=host.docker.internal
   DB_PORT=5432
   DB_NAME=alerta_wts
   DB_USER=postgres
   DB_PASS=TU_CONTRASEÑA_POSTGRES

   # ── Bot ────────────────────────────────────────────────────
   INTERVALO_MINUTOS=1
   VENTANA_MINUTOS=15

   # ── API REST ───────────────────────────────────────────────
   PORT=3000
   API_KEY=TU_CLAVE_API_SECRETA

   # ── Panel Administrador ────────────────────────────────────
   JWT_SECRET=TU_CLAVE_JWT_SECRETA
   JWT_EXPIRES=8h
   ```
   ## EN POWER SHEEL PARA VERIFICAR CONTRASEÑA: docker exec bot-whatsapp printenv API_KEY

   ### c) Reemplazar los valores:

   | Valor a reemplazar | Por qué poner |
   |--------------------|--------------|
   | `TU_CONTRASEÑA_POSTGRES` | La contraseña que escribiste al instalar PostgreSQL |
   | `TU_CLAVE_API_SECRETA` | Inventar una clave larga, ej: `aX9$mKp2#nZu7vLq` |
   | `TU_CLAVE_JWT_SECRETA` | Inventar otra clave larga diferente, ej: `rW4@jYb8!sFe1kTh` |

   > ⚠️ **Las claves deben ser largas y difíciles.** Mezcla letras, números y símbolos. Mínimo 16 caracteres.

   ### d) Guardar el archivo

   - Menú **Archivo → Guardar como**
   - Navegar a `C:\bot-whatsapp\`
   - En **"Nombre de archivo"** escribir exactamente: `.env`
   - En **"Tipo"** seleccionar: `Todos los archivos (*.*)`
   - Hacer clic en **Guardar**

   > ✅ El archivo debe aparecer en la carpeta como `.env` (sin extensión .txt)

   ---

## 2.2 — Configurar PostgreSQL para aceptar conexiones de Docker

Docker y PostgreSQL son dos programas separados. Por seguridad, PostgreSQL no acepta conexiones externas por defecto — hay que habilitarlo.

### a) Abrir el archivo de configuración de PostgreSQL

1. Abrir el **Explorador de archivos**
2. Navegar a:
   ```
   C:\Program Files\PostgreSQL\18\data\
   ```
3. Abrir el archivo `pg_hba.conf` con el **Bloc de Notas**
   - Clic derecho sobre el archivo → Abrir con → Bloc de notas

### b) Agregar la regla para Docker

Ir al final del archivo y agregar esta línea:
```
host    all    postgres    172.17.0.0/16    scram-sha-256
```

Guardar el archivo (`Ctrl + S`).

> ⚠️ Si Windows dice "No tienes permiso para guardar aquí", abrir el Bloc de notas como Administrador y volver a abrir el archivo.

### c) Reiniciar PostgreSQL para aplicar el cambio

Abrir PowerShell **como Administrador** y ejecutar:
```powershell
Restart-Service "postgresql-x64-18"
```
Esperar que termine (5-10 segundos).

---

## 2.3 — Crear la base de datos

### a) Abrir pgAdmin 4 / manejador de bases preferido

   - Buscarlo en el menú Inicio → **pgAdmin 4**
   - La primera vez pedirá crear una contraseña maestra para pgAdmin (puede ser la misma de PostgreSQL)

   ### b) Conectarse al servidor

   - En el panel izquierdo, expandir **Servers**
   - Hacer doble clic en **PostgreSQL 18**
   - Ingresar la contraseña de PostgreSQL cuando la pida

   ### c) Crear la base de datos

   1. Clic derecho sobre **Databases** → **Create → Database**
   2. Completar:
      - **Database:** `alerta_wts`
      - **Owner:** `postgres`
   3. Ir a la pestaña **Definition** y completar:
      - **Encoding:** `UTF8`
   4. Hacer clic en **Save**

   > ✅ Debe aparecer `alerta_wts` en la lista de bases de datos.

   ---

   ## 2.4 — Restaurar la base de datos (estructura y datos)

   ### a) Abrir el Query Tool de pgAdmin

   1. En el panel izquierdo, hacer doble clic en **alerta_wts** para seleccionarla
   2. En el menú superior: **Tools → Query Tool**

   ### b) Abrir el archivo SQL base

   1. En el Query Tool, ir a **File → Open File**
   2. Navegar a `C:\bot-whatsapp\migrations\`
   3. Seleccionar **base.sql**
   4. Hacer clic en **Open**

   ### c) Ejecutar el script

   - Presionar **F5** o hacer clic en el botón ▶️ **Execute**
   - Esperar a que termine (puede tomar 30-60 segundos)

   > ✅ Al terminar, en la parte inferior debe aparecer: `Query returned successfully`
   > Si aparece error → ver **[4C. Error al ejecutar el SQL](#4c--error-al-ejecutar-el-sql-base)**

   ---

## 2.5 — Crear el usuario administrador del panel

El usuario administrador permite ingresar al panel web del sistema. Se crea manualmente siguiendo estos pasos:

### a) Generar la contraseña encriptada

Abrir PowerShell y ejecutar este comando (reemplazar `MI_CONTRASEÑA` con la contraseña que quieras):

```powershell
docker run --rm node:22-alpine node -e "const b=require('bcryptjs');b.hash('MI_CONTRASEÑA',10).then(h=>console.log(h))"
```

> ⚠️ Docker Desktop debe estar abierto antes de ejecutar este comando.

Copiar el resultado. Se verá así:
```
$2b$10$XyZ123abcDEF456ghiJKL.mno789pqrSTU012vwxYZ345abc678DEF9
```

### b) Insertar el usuario en la base de datos

En el **Query Tool** de pgAdmin (conectado a `alerta_wts`), ejecutar:

```sql
INSERT INTO sis_usuario (
  sis_usuario_nombre,
  sis_usuario_email,
  sis_usuario_clave,
  sis_perfil_id,
  sis_usuario_estado,
  user_crea,
  fecha_crea
) VALUES (
  'Administrador',
  'correo@dominio.com',
  '$2b$10$mgJY.hszPoSbtXdbVwlPpOx4mWXXUAMCn0Q9Q0yCUmYcttLq4J.0W', -- 276241
  1,
  1,
  'INSTALACION',
  NOW()
);
```

> Reemplazar:
> - `TU_EMAIL@ejemplo.com` → tu correo real (este será el usuario de acceso)
> - `$2b$10$PEGAR_AQUI_EL_HASH_GENERADO` → el hash que copiaste en el paso anterior

---

## 2.6 — Configurar la zona horaria de la base de datos

> ⚠️ **PASO CRÍTICO.** Sin este paso el bot enviará mensajes a destiempo.

En el Query Tool de pgAdmin ejecutar (reemplazar `alerta_wts` si cambiaste el nombre):

```sql
ALTER DATABASE alerta_wts SET timezone = 'America/Guayaquil';
```

> Si estás en otro país, cambiar `America/Guayaquil` por tu zona horaria.
> Ejemplos: `America/Bogota`, `America/Lima`, `America/Mexico_City`

---
---

# 3. PUESTA EN MARCHA

---

## 3.1 — Iniciar el bot por primera vez

### a) Verificar que Docker Desktop está abierto

- Buscar el ícono de la ballena en la barra de tareas (esquina inferior derecha)
- Si no está, abrirlo desde el menú Inicio

### b) Abrir PowerShell en la carpeta del proyecto

1. Abrir el **Explorador de archivos**
2. Navegar a `C:\bot-whatsapp\`
3. En la barra de dirección, escribir `powershell` y presionar Enter
   - Se abre PowerShell directamente en esa carpeta

### c) Construir e iniciar el bot

Ejecutar:
```powershell
docker compose up --build
```

> ⚠️ La primera vez descarga la imagen base de Node.js desde internet. Puede tardar **5 a 20 minutos** según la velocidad de internet. Es normal que parezca que no hace nada — está descargando.

### d) Señales de que está funcionando

Esperar hasta ver estas líneas en la pantalla:

```
✅  API REST escuchando en puerto 3000
✅  WhatsApp conectado   ← solo aparece DESPUÉS de escanear el QR
```

> Si aparece `Error` antes de estas líneas → ver **[sección 4. Corrección de Errores](#4-corrección-de-errores)**

---

## 3.2 — Vincular WhatsApp (escanear QR)

La primera vez que se inicia el bot, genera un código QR que debe escanearse con el celular de WhatsApp que enviará los mensajes.

### a) Abrir el código QR

Abrir una **nueva ventana de PowerShell** (sin cerrar la anterior) y ejecutar:
```powershell
start C:\bot-whatsapp\src\auth\qr.png
```
Se abrirá la imagen del código QR.

> ⚠️ El QR expira en **60 segundos**. Si expira antes de escanearlo, ver **[4D. QR expirado](#4d--el-qr-expiró-antes-de-escanearlo)**

### b) Escanear desde el celular

1. Abrir **WhatsApp** en el celular
2. Ir a **⋮ (tres puntos) → Dispositivos vinculados → Vincular dispositivo**
3. Apuntar la cámara al código QR en la pantalla del computador

### c) Confirmación de vinculación exitosa

En la pantalla de PowerShell debe aparecer:
```
✅  WhatsApp conectado
```

> ✅ **El bot está activo.** A partir de ahora enviará los mensajes programados automáticamente.

---

## 3.3 — Acceder al panel administrador

1. Abrir el navegador (Chrome, Edge, etc.)
2. Ir a la dirección:
   ```
   http://localhost:3000/admin
   ```
3. Ingresar con el email y contraseña creados en el **paso 2.5**

> ✅ Si carga la pantalla de inicio de sesión — el sistema está funcionando correctamente.
> Si da error de conexión → ver **[4E. El panel no carga](#4e--el-panel-no-carga)**

---

## 3.4 — Verificación completa del sistema

Dentro del panel, verificar uno por uno:

a) **Contactos** → crear un contacto de prueba con número real
b) **Plantillas** → crear una plantilla con texto de prueba
c) **Grupos** → hacer clic en **Sincronizar grupos** — debe listar los grupos del número vinculado
d) **Calendario** → crear un evento con alerta "Al momento del evento" para dentro de 2 minutos y verificar que llega el mensaje

> ✅ Si el mensaje llega al celular — **la instalación está completa y funcionando.**

---

## 3.5 — Dejar el bot corriendo en segundo plano

Una vez verificado que todo funciona, configurar el bot para que corra sin mantener la ventana de PowerShell abierta:

### a) Detener el bot actual

Presionar `Ctrl + C` en la ventana de PowerShell donde está corriendo.

### b) Iniciar en modo daemon (segundo plano)

```powershell
docker compose up -d
```

### c) Verificar que está corriendo

```powershell
docker ps
```
Debe aparecer `bot-whatsapp` con estado `Up`.

> ⚠️ **Docker Desktop debe seguir abierto.** Si se cierra Docker Desktop, el bot se detiene. Se puede configurar Docker Desktop para que inicie con Windows automáticamente en: **Settings → General → Start Docker Desktop when you sign in to your computer**.

---

## 3.6 — Usar la API REST para enviar mensajes

La API REST permite que sistemas externos (ERP, CRM, aplicaciones propias) envíen mensajes al bot sin necesidad de entrar al panel. Todos los ejemplos usan PowerShell.

### Configuración previa — API Key

Cada petición debe incluir en el header el valor de `API_KEY` definido en el archivo `.env`:

```
x-api-key: TU_CLAVE_API_SECRETA
```

> ⚠️ Desde el navegador siempre dará error 401 — usar **PowerShell**, Postman o Thunder Client.

---

### Rutas disponibles

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/estado` | Verifica que el bot y la API estén funcionando |
| `GET` | `/contactos` | Lista contactos activos |
| `POST` | `/contactos` | Crea un contacto nuevo |
| `GET` | `/plantillas` | Lista plantillas activas |
| `POST` | `/plantillas` | Crea una plantilla nueva |
| `POST` | `/mensajes` | Crea un mensaje en la cola de envío (envío diferido) |
| `GET` | `/mensajes/:id` | Consulta el estado de un mensaje |
| `POST` | `/mensaje-directo` | Envía de inmediato sin pasar por el scheduler |
| `POST` | `/calendario` | Crea un evento con alertas automáticas |
| `GET` | `/grupos` | Lista los grupos WhatsApp del número activo |

---

### GET `/estado`
Verifica si el bot y la API están funcionando.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/estado" `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"}
```

**Respuesta esperada:**
```json
{ "ok": true, "whatsapp": "conectado", "timestamp": "2026-06-22T17:00:00.000Z" }
```

---

### GET `/contactos`
Lista todos los contactos activos.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/contactos" `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"}
```

**Respuesta esperada:**
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

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/contactos" -Method POST `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"; "Content-Type"="application/json"} `
  -Body '{"nombres":"Ana","apellidos":"Gómez","celular":"593991234567","correo":"ana@ejemplo.com","permite_whatsapp":1}'
```

**Campos obligatorios:** `nombres`, `celular`

**Respuesta esperada:**
```json
{ "ok": true, "id": 3 }
```

---

### GET `/plantillas`
Lista las plantillas de mensaje activas.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/plantillas" `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"}
```

**Respuesta esperada:**
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
Crea una nueva plantilla de mensaje. Las variables disponibles son `{{nombre}}`, `{{titulo}}`, `{{fecha_evento}}`, `{{mensaje}}`, `{{celular}}`.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/plantillas" -Method POST `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"; "Content-Type"="application/json"} `
  -Body '{"nombre":"Recordatorio cita","texto":"Hola {{nombre}}, tienes pendiente: {{titulo}} el {{fecha_evento}}."}'
```

**Respuesta esperada:**
```json
{ "ok": true, "id": 1 }
```

---

### POST `/mensaje-directo`
Envía un mensaje de forma inmediata sin pasar por el scheduler. Si el bot está desconectado responde `503` con error claro, sin encolar nada.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/mensaje-directo" -Method POST `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"; "Content-Type"="application/json"} `
  -Body '{"destino":"593984103258@s.whatsapp.net","texto":"Mensaje urgente al instante","cuenta_id":1}'
```

**Campos obligatorios:** `destino`, `texto`
**Campos opcionales:** `cuenta_id` (default `1`), `contacto_id` (default `null`)

**Respuesta exitosa:**
```json
{ "ok": true, "id": 21, "cuenta_id": 1, "destino": "593984103258@s.whatsapp.net" }
```

**Respuesta si bot desconectado:**
```json
{ "ok": false, "error": "Cuenta 1 no está conectada a WhatsApp" }
```

---

### POST `/mensajes`
Crea un mensaje puntual en la cola de envío. El bot lo enviará en el próximo ciclo cuando llegue la fecha programada.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/mensajes" -Method POST `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"; "Content-Type"="application/json"} `
  -Body '{"contacto_id":1,"destino":"593984103258","texto":"Hola, este es un aviso.","fecha_programada":"2026-06-29T09:00:00","prioridad":5}'
```

**Campos obligatorios:** `contacto_id`, `destino`, `fecha_programada`

> Para enviar a un **grupo** usar el ID del grupo como `destino`: `"120363XXXXXX@g.us"` (ver GET `/grupos`)

**Respuesta esperada:**
```json
{ "ok": true, "id": 20 }
```

---

### GET `/mensajes/:id`
Consulta el estado de un mensaje. Reemplazar `:id` por el número devuelto al crearlo.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/mensajes/20" `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"}
```

**Estados posibles:** `1` Pendiente · `3` Enviado · `4` Error · `5` Cancelado

**Respuesta esperada:**
```json
{
  "ok": true,
  "mensaje": {
    "id": 20,
    "destino": "593984103258",
    "texto": "Hola, este es un aviso.",
    "estado": 3,
    "fecha_programada": "2026-06-29T09:00:00",
    "fecha_envio": "2026-06-29T09:00:45",
    "intentos": 1,
    "ultimo_error": null
  }
}
```

---

### POST `/calendario`
Crea un evento con alertas. Los mensajes se generan automáticamente — no es necesario crearlos uno por uno.

**Tipos de alerta:**
| `tipo` | Descripción | Ejemplo `valor` |
|--------|-------------|-----------------|
| `1` | Días antes del evento | `2` = 2 días antes |
| `2` | Horas antes del evento | `3` = 3 horas antes |
| `3` | Minutos antes del evento | `30` = 30 minutos antes |
| `4` | Hora fija el mismo día del evento | `"08:00"` |

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/calendario" -Method POST `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"; "Content-Type"="application/json"} `
  -Body '{
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
  }'
```

**Respuesta esperada:**
```json
{ "ok": true, "calendario_id": 5 }
```

---

### GET `/grupos`
Lista los grupos WhatsApp del número conectado. Útil para obtener el ID de grupo al enviar mensajes grupales.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/grupos" `
  -Headers @{"x-api-key"="TU_CLAVE_API_SECRETA"}
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "total": 3,
  "grupos": [
    { "nombre": "Sistemas HENTEL", "id": "120363XXXXXX@g.us" },
    { "nombre": "Familia",         "id": "120363YYYYYY@g.us" }
  ]
}
```

---

## 3.7 — Activar la recepción de mensajes entrantes (opcional)

Además de enviar, el bot puede **guardar en base de datos los mensajes que le escriben** a cualquier cuenta vinculada — incluyendo el chat "Yo" (self-chat).

### a) Activar/desactivar desde la base de datos

No requiere reiniciar el bot — se lee en cada mensaje que llega:

```sql
UPDATE wts_configuracion SET wts_configuracion_valor = 'SI' WHERE wts_configuracion_clave = 'LEER_MENSAJES';
UPDATE wts_configuracion SET wts_configuracion_valor = 'SI' WHERE wts_configuracion_clave = 'LEER_MENSAJES_MARCAR_LEIDO';
```

| Clave | Valores | Efecto |
|--------|---------|--------|
| `LEER_MENSAJES` | `SI` / `NO` | Activa/desactiva el guardado de mensajes entrantes |
| `LEER_MENSAJES_MARCAR_LEIDO` | `SI` / `NO` | Si `SI`, marca el mensaje como leído en WhatsApp (palomitas azules) |

### b) Tabla `wts_mensaje_recibido`

| Columna | Descripción |
|---------|-------------|
| `wts_cuenta_id` | Cuenta WhatsApp que recibió el mensaje |
| `wts_mensaje_recibido_jid` | JID del remitente: número, grupo (`@g.us`), estado (`status@broadcast`) o identificador de privacidad nuevo de WhatsApp (`@lid`) |
| `wts_mensaje_recibido_nombre` | Nombre del contacto según WhatsApp (pushName) |
| `wts_mensaje_recibido_texto` | Texto del mensaje (`null` si no es texto: audio, sticker, etc.) |
| `wts_mensaje_recibido_es_grupo` | `1` si viene de un grupo |
| `wts_mensaje_recibido_yo` | `1` si el mensaje es del propio chat "Yo" (self-chat) |
| `wts_mensaje_recibido_leido` | `1` si se marcó como leído en WhatsApp |

### c) Qué se ignora automáticamente

- Actualizaciones de Estado de WhatsApp (`status@broadcast`) — de cualquier contacto, no solo propias.
- Ecos de mensajes que el propio bot envía (scheduler, API, panel) — excepto el chat "Yo", que sí se guarda con `wts_mensaje_recibido_yo = 1`.

> ⚠️ WhatsApp introdujo un identificador de privacidad (`@lid`) que a veces reemplaza al número de teléfono tradicional en los mensajes entrantes. El bot ya maneja ambos formatos automáticamente — no requiere configuración adicional.

### d) ⚠️ IMPORTANTE — este flujo necesita reconstruir la imagen

`whatsapp.js`, `db.js` e `index.js` **no** están montados como volumen en `docker-compose.yml` (solo `src/auth` y `src/admin` lo están) — quedan copiados dentro de la imagen al construirla. Un simple `docker compose restart` **no** aplica cambios de código en estos archivos. Hay que reconstruir:

```powershell
docker compose up -d --build
```

### e) Verificar que está guardando

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

## Comandos de uso frecuente

```powershell
# Ver qué está haciendo el bot en tiempo real
docker logs -f bot-whatsapp

# Reiniciar el bot (después de cambios de configuración)
docker compose restart

# Detener el bot
docker compose down

# Iniciar el bot (si está detenido)
docker compose up -d
```

---
---

# 4. CORRECCIÓN DE ERRORES

> **Cómo usar esta sección:** Identifica la letra del error que coincide con tu problema y sigue los pasos indicados.

---

## 4A — Docker Desktop no inicia

**Síntoma:** Docker Desktop no abre o muestra error al iniciar.

a) Verificar que WSL2 está instalado:
   ```powershell
   wsl --list --verbose
   ```
   Si no aparece nada → ejecutar `wsl --install` y reiniciar el equipo
   → volver a **[1.2 Docker Desktop y WSL2](#12--docker-desktop-y-wsl2)**

b) Si WSL2 está instalado pero Docker no inicia, verificar que la virtualización está habilitada en el BIOS:
   - Abrir el **Administrador de tareas** (`Ctrl + Shift + Esc`)
   - Pestaña **Rendimiento → CPU**
   - Verificar que dice **Virtualización: Habilitada**
   - Si dice Deshabilitada → contactar al soporte técnico para activar virtualización en BIOS

c) Reinstalar Docker Desktop descargando la última versión desde **https://www.docker.com/products/docker-desktop**

---

## 4B — PostgreSQL no inicia

**Síntoma:** `Get-Service "postgresql-x64-18"` muestra `Stopped` o no encuentra el servicio.

a) Intentar iniciar el servicio manualmente:
   ```powershell
   Start-Service "postgresql-x64-18"
   ```

b) Si da error de nombre, listar todos los servicios PostgreSQL:
   ```powershell
   Get-Service | Where-Object {$_.Name -like "*postgresql*"}
   ```
   Usar el nombre exacto que aparezca.

c) Si el servicio no existe, PostgreSQL no está instalado correctamente
   → volver a **[1.3 PostgreSQL](#13--postgresql-base-de-datos)**

---

## 4C — Error al ejecutar el SQL base

**Síntoma:** Al ejecutar `base.sql` en pgAdmin aparece un error en rojo.

a) Verificar que la base de datos `alerta_wts` está seleccionada antes de ejecutar.
   En pgAdmin, el nombre de la base debe aparecer en la parte superior del Query Tool.

b) Si el error dice `already exists` (ya existe):
   - El script tiene un `DROP ... IF EXISTS` al inicio que limpia todo antes de crear
   - Si igual da error, clic derecho sobre la base de datos `alerta_wts` → **Delete/Drop** → volver a crearla
   → volver a **[2.3 Crear la base de datos](#23--crear-la-base-de-datos)**

c) Si el error dice `permission denied`:
   - Verificar que estás conectado con el usuario `postgres` (superusuario)

d) Si el error dice `encoding` o `collation`:
   - Eliminar la base y crearla sin especificar collation — dejar los valores por defecto del servidor

---

## 4D — El QR expiró antes de escanearlo

**Síntoma:** El QR aparece pero al escanearlo dice "código expirado" o ya no se puede escanear.

a) En la ventana de PowerShell donde corre el bot, esperar unos segundos — genera un nuevo QR automáticamente.

b) Abrir la imagen nuevamente:
   ```powershell
   start C:\bot-whatsapp\src\auth\qr.png
   ```

c) Si el QR no se regenera, reiniciar el bot:
   - Presionar `Ctrl + C` para detener
   - Volver a ejecutar `docker compose up --build`
   - Abrir el QR nuevamente

d) Tener el celular listo ANTES de abrir el QR para escanearlo dentro de los 60 segundos.

---

## 4E — El panel no carga

**Síntoma:** Al abrir `http://localhost:3000/admin` el navegador dice "No se puede acceder" o similar.

a) Verificar que el bot está corriendo:
   ```powershell
   docker ps
   ```
   Debe aparecer `bot-whatsapp`. Si no aparece:
   ```powershell
   docker compose up -d
   ```

b) Verificar que el puerto 3000 no está siendo usado por otro programa:
   ```powershell
   netstat -ano | findstr :3000
   ```
   Si aparece otra aplicación usando el puerto 3000, cambiar el puerto en `.env` a otro número (ej: 3001) y en `docker-compose.yml` cambiar `"3000:3000"` a `"3001:3000"`.
   → volver a **[2.1 Archivo .env](#21--crear-el-archivo-de-configuración-env)**

---

## 4F — El panel muestra "Error 401" al iniciar sesión

**Síntoma:** Al ingresar email y contraseña aparece error 401 o "No autorizado".

a) Verificar que `JWT_SECRET` está definido en el archivo `.env`
   → volver a **[2.1 Archivo .env](#21--crear-el-archivo-de-configuración-env)**

b) Después de crear o modificar el `.env`, siempre reiniciar el bot:
   ```powershell
   docker compose restart
   ```

c) Verificar que el usuario fue creado correctamente en la base de datos:
   En pgAdmin → Query Tool → ejecutar:
   ```sql
   SELECT wts_usuario_email, wts_usuario_estado FROM wts_usuario;
   ```
   Debe aparecer tu email con estado `1`.

---

## 4G — El bot no envía mensajes

**Síntoma:** Los mensajes aparecen como "Pendiente" pero nunca se envían.

a) Verificar que WhatsApp está vinculado:
   ```powershell
   docker logs bot-whatsapp --tail 20
   ```
   Debe aparecer `WhatsApp conectado`. Si no aparece → volver a **[3.2 Vincular WhatsApp](#32--vincular-whatsapp-escanear-qr)**

b) Verificar que la fecha programada del mensaje no haya expirado.
   Los mensajes solo se envían dentro de una ventana de 15 minutos de su hora programada.

c) Verificar que el bot está viendo los mensajes pendientes:
   En pgAdmin ejecutar:
   ```sql
   SELECT wts_mensaje_id, wts_mensaje_estado, wts_mensaje_fecha_programada, wts_mensaje_destino
   FROM wts_mensaje
   WHERE wts_mensaje_estado = 1
   ORDER BY wts_mensaje_fecha_programada DESC
   LIMIT 10;
   ```

d) Ver los logs del bot para detectar errores:
   ```powershell
   docker logs bot-whatsapp --tail 50
   ```

---

## 4H — Cambiar el número de WhatsApp vinculado

**Síntoma:** Necesitas vincular un número diferente al que está activo.

> ⚠️ **ADVERTENCIA:** Esto desvinculará el número actual. El nuevo número debe escanearse inmediatamente.

```powershell
docker compose down
Remove-Item "C:\bot-whatsapp\src\auth\*" -Recurse -Force
docker compose up -d
```

Luego abrir el QR:
```powershell
start C:\bot-whatsapp\src\auth\qr.png
```
→ volver a **[3.2 Vincular WhatsApp](#32--vincular-whatsapp-escanear-qr)**

---

## 4I — No se guardan los mensajes que me escriben

**Síntoma:** Activaste `LEER_MENSAJES = 'SI'` pero no aparecen registros en `wts_mensaje_recibido`.

a) Verificar que el parámetro está en `SI` y activo (`wts_configuracion_estado = 1`):
   ```sql
   SELECT wts_configuracion_clave, wts_configuracion_valor, wts_configuracion_estado
   FROM wts_configuracion
   WHERE wts_configuracion_clave IN ('LEER_MENSAJES','LEER_MENSAJES_MARCAR_LEIDO');
   ```

b) **Causa más común:** el código de este flujo se editó pero la imagen Docker no se reconstruyó. Verificar con:
   ```powershell
   docker exec bot-whatsapp grep -c "guardarMensajeRecibido" /app/src/whatsapp.js
   ```
   Si devuelve `0`, la imagen está desactualizada — reconstruir:
   ```powershell
   docker compose up -d --build
   ```
   → volver a **[3.7 Activar la recepción de mensajes entrantes](#37--activar-la-recepción-de-mensajes-entrantes-opcional)**

c) Revisar los logs en vivo mientras alguien envía un mensaje de prueba:
   ```powershell
   docker logs -f bot-whatsapp
   ```
   Debe aparecer `messages.upsert recibido` con `"type":"notify"`. Si el `type` es `"append"`, ese mensaje en particular no se procesa (sincronización, no mensaje nuevo en vivo).

d) Si el mensaje es al chat "Yo" y sigue sin guardarse, confirmar que el log `Mensaje recibido guardado` incluye `"esSelfChat":true` — si no, revisar que `src/whatsapp.js` tenga la comparación contra `sock.authState.creds.me` (número y LID propios), no un número fijo.

---
---

> **¿El error no aparece en esta lista?**
> Revisar los logs completos del bot:
> ```powershell
> docker logs bot-whatsapp --tail 100
> ```
> Y compartir el mensaje de error con el equipo de soporte técnico.

---

*AlertaWTS v2 — Guía de instalación generada el 2026-06-24*

# Uso de la API REST — Control de Gastos

Guía práctica para **consumir** la API desde otro programa. Para el diseño/arquitectura ver [README.md](README.md); para el detalle de cómo crear API keys ver también [API.md](API.md) (aquí se repite lo esencial para que este documento se baste solo).

## 0. Aclaración importante: aquí NO hay sesión que "validar"

Esta API **no usa sesión de navegador ni cookies** (a diferencia del resto del sistema, que sí depende de `$_SESSION`). Es completamente **sin estado**: cada request HTTP se autentica por sí solo, de forma independiente, con un header:

```
Authorization: Bearer <token>
```

No hay que "iniciar sesión" antes ni mantener nada entre llamadas — cada llamada a cada ruta lleva su propio header y punto. Para tu caso ("llamar esta API de reportes desde otro servicio de consultas"), lo que necesitas es:

1. Crear **una** API key de larga duración por SQL (una sola vez, ver sección 4).
2. Guardar esa API key como configuración fija en tu otro servicio (variable de entorno, config, etc.).
3. En cada llamada que ese servicio haga a esta API, mandar `Authorization: Bearer <esa API key>`. No expira en la práctica hasta la fecha que tú le pongas, no hace falta "renovarla" en cada request ni volver a autenticarse.

Eso es todo. No hay concepto de sesión activa/inactiva de por medio: mientras la API key exista con `estado = 1` y no haya pasado su `fecha_expira`, cada request individual pasa la validación por su cuenta.

## 1. Rutas disponibles

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth/token.php` | Login con usuario/clave → token corto (8h). Pensado para un usuario humano, no para un servicio automatizado. |
| `POST` | `/api/auth/revocar.php` | Invalida el token/API key enviado en `Authorization`. |
| `GET`  | `/api/reportes/gastos_mes_actual.php` | Gasto del mes en curso (día 1 → hoy), filtrando por texto de categoría/subcategoría. Params: `empresa_id` (obligatorio), `q` (opcional). |
| `GET`  | `/api/reportes/gastos_rango.php` | Gasto por rango de fechas libre. Params: `empresa_id`, `desde`, `hasta` (obligatorios), `q` (opcional). |
| `GET`  | `/api/reportes/historial_producto.php` | Historial de un producto por coincidencia parcial en el detalle. Params: `empresa_id`, `q` (obligatorio), `desde`/`hasta` (opcionales, deben ir juntos). |
| `POST` | `/api/compras/documento_manual.php` | Crea un gasto/compra manual (RUC + proveedor + líneas de producto). Sin categoría: queda `SIN_CLASIFICAR`/`PENDIENTE` para clasificar luego en el módulo Pendientes. Params body: `empresa_id`, `ruc`, `proveedor`, `productos` (obligatorios); `fecha`, `numero_documento`, `observacion` (opcionales). |

Todas las rutas cuelgan de `http://localhost:88/control_gastos` en tu entorno local (ajusta host/puerto según donde despliegues). Todas responden JSON con el formato:

```json
{ "ok": true, "data": { ... } }
```
o en error:
```json
{ "ok": false, "error": "MENSAJE" }
```
con el código HTTP correspondiente (`400`, `401`, `403`, `404`, `500`).

## 2. Uso desde PHP (JSON por cURL)

```php
<?php
/**
 * Cliente minimo para consumir la API desde otro servicio PHP.
 */
function api_llamar(string $url, string $metodo, ?array $cuerpo, string $apiKey): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
    ]);

    if ($cuerpo !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cuerpo, JSON_UNESCAPED_UNICODE));
    }

    $respuestaCruda = curl_exec($ch);
    $codigoHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'codigo' => $codigoHttp,
        'body' => json_decode((string) $respuestaCruda, true),
    ];
}

$baseUrl = 'http://localhost:88/control_gastos';
$apiKey = 'PON_AQUI_TU_API_KEY'; // la que creaste por SQL, ver seccion 4

// Reporte #1: gasto del mes en curso, filtrando por texto
$reporte1 = api_llamar(
    $baseUrl . '/api/reportes/gastos_mes_actual.php?' . http_build_query(['empresa_id' => 1, 'q' => 'alim']),
    'GET',
    null,
    $apiKey
);

if ($reporte1['codigo'] === 200 && $reporte1['body']['ok']) {
    foreach ($reporte1['body']['data']['filas'] as $fila) {
        echo $fila['categoria'] . ' / ' . $fila['subcategoria'] . ': $' . $fila['total'] . PHP_EOL;
    }
} else {
    echo 'ERROR: ' . ($reporte1['body']['error'] ?? 'DESCONOCIDO') . PHP_EOL;
}

// Reporte #3: historial de producto
$reporte3 = api_llamar(
    $baseUrl . '/api/reportes/historial_producto.php?' . http_build_query(['empresa_id' => 1, 'q' => 'tocineta']),
    'GET',
    null,
    $apiKey
);
print_r($reporte3['body']);
```

No hay ningún paso de "login" en este ejemplo porque `$apiKey` ya es una API key de larga duración creada directamente en la base (sección 4) — se manda de una vez en cada llamada.

## 3. Uso desde PowerShell

```powershell
$baseUrl = "http://localhost:88/control_gastos"
$apiKey  = "PON_AQUI_TU_API_KEY"
$headers = @{ Authorization = "Bearer $apiKey" }
$empresaId = 1

# Reporte #1
$reporte1 = Invoke-RestMethod -Uri "$baseUrl/api/reportes/gastos_mes_actual.php?empresa_id=$empresaId&q=alim" -Headers $headers
$reporte1.data.filas | Format-Table

# Reporte #2
$reporte2 = Invoke-RestMethod -Uri "$baseUrl/api/reportes/gastos_rango.php?empresa_id=$empresaId&desde=2020-01-01&hasta=2026-12-31&q=alim" -Headers $headers
$reporte2.data.filas | Format-Table

# Reporte #3
$reporte3 = Invoke-RestMethod -Uri "$baseUrl/api/reportes/historial_producto.php?empresa_id=$empresaId&q=tocineta" -Headers $headers
$reporte3.data | ConvertTo-Json -Depth 5

# Crear documento manual (RUC + proveedor + productos) -> queda SIN_CLASIFICAR/PENDIENTE
$documentoBody = @{
    empresa_id       = $empresaId
    ruc              = "0999999999005"
    proveedor        = "PROVEEDOR PRUEBA POWERSHELL"
    numero_documento = "001-001-000000888"
    observacion      = "prueba desde powershell"
    productos        = @(
        @{ descripcion = "PRODUCTO PS A"; cantidad = 3; precio_unitario = 2.50 },
        @{ descripcion = "PRODUCTO PS B"; cantidad = 1; precio_unitario = 7.00 }
    )
} | ConvertTo-Json -Depth 5

$documento = Invoke-RestMethod -Uri "$baseUrl/api/compras/documento_manual.php" -Method Post -ContentType "application/json" -Headers $headers -Body $documentoBody
$documento | ConvertTo-Json -Depth 5

# Confirmar viendo el historial de esos productos
Invoke-RestMethod -Uri "$baseUrl/api/reportes/historial_producto.php?empresa_id=$empresaId&q=PRODUCTO%20PS" -Headers $headers | ConvertTo-Json -Depth 6

# Probar el duplicado (mismo RUC + mismo numero_documento -> debe fallar con 409)
try {
    Invoke-RestMethod -Uri "$baseUrl/api/compras/documento_manual.php" -Method Post -ContentType "application/json" -Headers $headers -Body $documentoBody
} catch {
    Write-Output "Error esperado: $($_.Exception.Response.StatusCode.value__)"
    $_.ErrorDetails.Message
}
```

`Invoke-RestMethod` lanza una excepción de PowerShell cuando el servidor responde con código de error (400/401/403/409) — por eso la prueba del duplicado usa `try/catch`; `$_.ErrorDetails.Message` trae el JSON de error (`{"ok":false,"error":"..."}`).

Si en vez de una API key fija quieres usar login interactivo (usuario/clave humanos, token de 8h), el flujo es el que ya probamos antes:

```powershell
$loginBody = @{ usuario = "cescorp@hotmail.es"; clave = "50245058" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/token.php" -Method Post -ContentType "application/json" -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.data.token)" }
```

Para un servicio automatizado que llama sin intervención humana, usa la **API key fija** (sección 4), no el login — evita depender de guardar una contraseña real en el otro servicio.

## 4. Cómo crear una API key en la base

```sql
INSERT INTO sis_api_tokens (
    sis_usuarios_id,
    sis_api_tokens_token,
    sis_api_tokens_fecha_expira,
    sis_api_tokens_estado
) VALUES (
    1, -- sis_usuarios_id: usuario dueño de la key (hereda su perfil y sus empresas)
    'REEMPLAZA_ESTO_POR_UN_VALOR_LARGO_Y_UNICO',
    DATE_ADD(NOW(), INTERVAL 1 YEAR), -- vigencia; la tabla exige una fecha, no admite "sin expiracion"
    1
);
```

El valor de `sis_api_tokens_token` es literalmente lo que se manda como `Authorization: Bearer <eso>`. Puedes escribir cualquier texto (para pruebas locales) pero para un integrador real usa algo largo y aleatorio — por ejemplo, generado en PHP con `bin2hex(random_bytes(32))`, o cualquier generador de contraseñas largas. La columna `sis_api_tokens_token_hash` se calcula sola (ver sección 5), no hay que tocarla.

**Revocar una API key:**
```sql
UPDATE sis_api_tokens
SET sis_api_tokens_estado = 0,
    sis_fecha_modifica = NOW()
WHERE sis_api_tokens_token = 'LA_QUE_QUIERAS_REVOCAR';
```

## 5. Diccionario de campos — `sis_api_tokens`

| Campo | Tipo | Para qué sirve |
|---|---|---|
| `sis_api_tokens_id` | `INT` (PK) | Identificador interno del registro. |
| `sis_usuarios_id` | `INT` (FK → `sis_usuarios`) | Usuario dueño de la key. **Determina los permisos y las empresas que la API key puede consultar** — no hay permisos propios de la key, hereda exactamente los del usuario (perfil, `sis_perfil_ver_todas_empresas`, filas en `fin_empresa_usuarios`). |
| `sis_api_tokens_token` | `VARCHAR(255)` | El token/API key **en texto plano**. Es el valor que se manda en `Authorization: Bearer <esto>`. Se guarda plano a propósito para poder crearlo a mano por SQL sin calcular ningún hash. |
| `sis_api_tokens_token_hash` | `CHAR(64)`, columna **generada** (`GENERATED ALWAYS AS (SHA2(sis_api_tokens_token, 256)) STORED`) | Se calcula sola a partir de `sis_api_tokens_token`; es lo que usa `api_validar_token()` para buscar el token en cada request. No se inserta ni se edita manualmente — MariaDB la mantiene sincronizada siempre. |
| `sis_api_tokens_fecha_expira` | `DATETIME` | A partir de esta fecha/hora el token deja de aceptarse, aunque `estado` siga en 1. Campo obligatorio: no existe "sin expiración", solo poner una fecha muy lejana si se quiere de facto indefinido. |
| `sis_api_tokens_estado` | `TINYINT` (0/1) | `1` = activo y utilizable. `0` = revocado (manualmente por SQL o vía `POST /api/auth/revocar.php`); una vez en `0` nunca se reactiva, hay que crear uno nuevo. |
| `sis_fecha_crea` | `DATETIME` | Fecha de creación del registro (automática, `CURRENT_TIMESTAMP`). |
| `sis_user_crea` | `INT` | Quién generó el token — al pasar por `/api/auth/token.php` queda el mismo `sis_usuarios_id`; si lo insertas tú a mano por SQL, queda como lo pongas (o `NULL` si no lo indicas). |
| `sis_fecha_modifica` / `sis_user_modifica` | `DATETIME` / `INT` | Se llenan cuando se revoca el token (fecha y quién lo revocó), quedan `NULL` mientras el token nunca se ha tocado. |

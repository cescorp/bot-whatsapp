// Consola de comandos del chat "Yo" — ver Activar_Consola_Comando.md
const { buscarComando, crearRecordatorioDesdeComando } = require('./db')

// Parsea un mensaje tipo formulario "Clave: valor" (una por línea) a un objeto plano.
// Devuelve {} si el texto no tiene ninguna línea con ese formato.
function parsearCampos(texto) {
  const campos = {}
  for (const linea of texto.split('\n')) {
    const idx = linea.indexOf(':')
    if (idx === -1) continue
    const clave = linea.slice(0, idx).trim()
    const valor = linea.slice(idx + 1).trim().replace(/;$/, '')
    if (clave) campos[clave] = valor
  }
  return campos
}

// 'DD-MM-YYYY' o 'DD-MM-YYYY HH:mm' → Date. null si no matchea el formato.
function parsearFecha(texto) {
  const m = texto.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!m) return null
  const [, dia, mes, anio, hora = '0', min = '0'] = m
  return new Date(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(min))
}

// 'N dias/horas/minutos antes' o 'HH:MM' → { tipo, valor } de wts_calendario_alerta.
// tipo: 1=dias antes, 2=horas antes, 3=minutos antes, 4=hora fija. null si no se reconoce.
function parsearRecordatorio(texto) {
  const t = texto.trim().toLowerCase()

  const horaFija = t.match(/^(\d{1,2}):(\d{2})$/)
  if (horaFija) return { tipo: 4, valor: t }

  const antes = t.match(/^(\d+)\s*(dias?|horas?|minutos?)\s*antes$/)
  if (antes) {
    const valor = Number(antes[1])
    if (antes[2].startsWith('dia'))    return { tipo: 1, valor }
    if (antes[2].startsWith('hora'))   return { tipo: 2, valor }
    if (antes[2].startsWith('minuto')) return { tipo: 3, valor }
  }
  return null
}

function formatearFecha(fecha) {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Campo opcional "Periodo: hoy | mes | año" → { desde, hasta }. null si no viene o no se reconoce
// (equivale a "sin fechas" — el llamador debe omitir esos parámetros en ese caso).
function resolverPeriodo(periodo) {
  const hoy = formatearFecha(new Date())
  const t   = periodo?.trim().toLowerCase()
  if (!t) return null
  if (t === 'hoy') return { desde: hoy, hasta: hoy }
  if (t === 'mes') return { desde: formatearFecha(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), hasta: hoy }
  if (t === 'año' || t === 'ano') return { desde: formatearFecha(new Date(new Date().getFullYear(), 0, 1)), hasta: hoy }
  return null
}

// Sustituye {{Campo}}, {{Campo|hoy}} (fecha: usa "hoy" si el campo vino vacío o es literalmente "hoy")
// y variables especiales ({{primer_dia_mes}}, {{periodo_desde}}, {{periodo_hasta}}) dentro de un
// objeto de query plano. Las variables que resuelven a '' se omiten después en ejecutarApiExterna.
function sustituirVariables(obj, campos) {
  const especiales = {
    primer_dia_mes: () => formatearFecha(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    periodo_desde:  () => resolverPeriodo(campos.Periodo)?.desde ?? '',
    periodo_hasta:  () => resolverPeriodo(campos.Periodo)?.hasta ?? '',
  }

  const resolver = (valor) => valor.replace(/\{\{(\w+)(\|hoy)?\}\}/g, (_match, clave, esFecha) => {
    if (clave in especiales) return especiales[clave]()

    const original = campos[clave]
    if (esFecha) {
      if (!original || original.trim().toLowerCase() === 'hoy') return formatearFecha(new Date())
      const fecha = parsearFecha(original)
      return fecha ? formatearFecha(fecha) : original
    }
    return original ?? ''
  })

  const resultado = {}
  for (const [clave, valor] of Object.entries(obj)) {
    resultado[clave] = typeof valor === 'string' ? resolver(valor) : valor
  }
  return resultado
}

// Formatea la respuesta según su forma — no se asume un solo esquema porque cada
// endpoint de la API devuelve una estructura distinta.
function formatearResultado(data) {
  // [{ producto, movimientos: [{fecha, precio_unitario, cantidad, precio_total, proveedor}] }]
  if (Array.isArray(data) && data.length && data.every(d => Array.isArray(d?.movimientos))) {
    if (data.length === 0) return 'sin resultados'
    return data.map(grupo => {
      const encabezado = `*${grupo.producto}*`
      const lineas = grupo.movimientos.map(m =>
        `${m.cantidad} de $${m.precio_unitario} - Total: $${m.precio_total} el ${m.fecha} -  ${m.proveedor.length > 10 ? m.proveedor.slice(0, 12) + '...' : m.proveedor}`
      )
      return [encabezado, ...lineas].join('\n')
    }).join('\n\n')
  }

  // { filas: [...] } — reportes tipo gastos_rango/gastos_mes_actual
  if (Array.isArray(data?.filas)) {
    if (data.filas.length === 0) return 'sin resultados'
    return data.filas.map(fila => Object.values(fila).join(' — ')).join('\n')
  }

  if (Array.isArray(data) && data.length === 0) return 'sin resultados'
  return typeof data === 'string' ? data : JSON.stringify(data)
}

function renderizar(plantilla, datos) {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_match, clave) => datos[clave] ?? '')
}

// ── Handlers por tipo (catálogo fijo — nuevos tipos se agregan aquí una vez) ──

async function ejecutarCalendario(cuentaId, comando, campos) {
  const { Titulo, Mensaje, Fecha, Recordatorio } = campos
  if (!Titulo || !Fecha) throw new Error('faltan campos obligatorios: Titulo y Fecha')

  const fechaEvento = parsearFecha(Fecha)
  if (!fechaEvento) throw new Error(`fecha invalida: "${Fecha}"`)

  let alerta = null
  if (Recordatorio) {
    alerta = parsearRecordatorio(Recordatorio)
    if (!alerta) throw new Error(`recordatorio no reconocido: "${Recordatorio}"`)
  }

  await crearRecordatorioDesdeComando({ cuentaId, titulo: Titulo, mensajeTexto: Mensaje, fechaEvento, alerta })

  return { Titulo, Fecha, RecordatorioTexto: Recordatorio ? `, aviso ${Recordatorio}` : '' }
}

async function ejecutarApiExterna(comando, campos) {
  const partes = []
  for (const llamada of comando.config?.llamadas || []) {
    if (!(llamada.si_campo in campos)) continue

    const query = sustituirVariables(llamada.query || {}, campos)
    const url   = new URL(llamada.url)
    for (const [clave, valor] of Object.entries(query)) {
      if (valor === '') continue   // omitir parametros vacios (ej. sin "Periodo" -> sin fechas)
      url.searchParams.set(clave, valor)
    }

    const resp = await fetch(url, {
      method: llamada.metodo || 'GET',
      headers: { Authorization: `Bearer ${process.env.API_GASTOS_TOKEN}` },
    })
    const body = await resp.json().catch(() => null)

    partes.push((resp.ok && body?.ok)
      ? formatearResultado(body.data)
      : `error consultando ${llamada.resultado}: ${body?.error || resp.status}`)
  }
  // Solo se incluyen las secciones de las llamadas que realmente se ejecutaron
  // (si no mandaste "Gastos:", no aparece ninguna línea de total vacía, etc.)
  return { mensaje: partes.join('\n\n') }
}

async function ejecutarComando(cuentaId, comando, campos) {
  switch (comando.tipo) {
    case 'CALENDARIO':  return ejecutarCalendario(cuentaId, comando, campos)
    case 'API_EXTERNA':  return ejecutarApiExterna(comando, campos)
    default: throw new Error(`tipo de comando desconocido: ${comando.tipo}`)
  }
}

// Punto de entrada único desde whatsapp.js.
// Devuelve null si el texto no matchea ningún comando (se guarda como mensaje normal),
// o el texto de confirmación/error a responder si sí matcheó uno.
async function procesarComando(cuentaId, texto) {
  const campos = parsearCampos(texto)
  if (Object.keys(campos).length === 0) return null

  const comando = await buscarComando(cuentaId, campos)
  if (!comando) return null

  try {
    const resultado = await ejecutarComando(cuentaId, comando, campos)
    return renderizar(comando.respuesta, resultado)
  } catch (err) {
    return `❌ Error ejecutando "${comando.nombre}": ${err.message}`
  }
}

module.exports = { procesarComando }

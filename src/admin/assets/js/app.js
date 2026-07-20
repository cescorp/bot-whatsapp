// Utilidades globales del panel

const ESTADOS_MENSAJE = {
  1: { label: 'Pendiente',  badge: 'warning' },
  2: { label: 'Procesando', badge: 'info' },
  3: { label: 'Enviado',    badge: 'success' },
  4: { label: 'Error',      badge: 'danger' },
  5: { label: 'Cancelado',  badge: '' },
}

function badgeEstado(estado) {
  const e = ESTADOS_MENSAJE[estado] || { label: estado, badge: 'secondary' }
  return '<span class="badge badge-' + e.badge + '">' + e.label + '</span>'
}

function badgeActivo(estado) {
  return estado == 1
    ? '<span class="badge badge-success">Activo</span>'
    : '<span class="badge badge-secondary">Inactivo</span>'
}

function fechaLocal(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// SweetAlert2 con tema oscuro
const Alerta = {
  _base: {
    background:           '#1a2234',
    color:                '#b0c4de',
    confirmButtonColor:   '#00d4ff',
    cancelButtonColor:    '#6c757d',
    customClass: { confirmButton: 'btn-swal-confirm', cancelButton: 'btn-swal-cancel' },
  },

  confirmar(titulo, texto, icono = 'question') {
    return Swal.fire({
      ...this._base,
      title:             titulo,
      text:              texto,
      icon:              icono,
      showCancelButton:  true,
      confirmButtonText: 'Si, continuar',
      cancelButtonText:  'Cancelar',
    })
  },

  exito(msg) {
    return Swal.fire({ ...this._base, icon: 'success', title: msg, timer: 1800, showConfirmButton: false })
  },

  error(msg) {
    return Swal.fire({ ...this._base, icon: 'error', title: 'Error', text: msg })
  },
}

// Modal helper — 100% manual, sin Bootstrap JS para evitar backdrop zombie
const Modal = {
  show(id) {
    const modal = document.getElementById(id)
    if (!modal) return
    // Crear backdrop propio con clase distinta a Bootstrap
    const bd = document.createElement('div')
    bd.dataset.wtsBackdrop = id
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:1040'
    document.body.appendChild(bd)
    // Mostrar modal
    modal.style.display = 'block'
    document.body.style.overflow = 'hidden'
  },
  hide(id) {
    // Ocultar modal
    const modal = document.getElementById(id)
    if (modal) modal.style.display = 'none'
    // Eliminar backdrop propio
    document.querySelectorAll('[data-wts-backdrop]').forEach(b => b.remove())
    // Por si Bootstrap dejó algo
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove())
    document.body.style.overflow = ''
    document.body.classList.remove('modal-open')
  }
}

// Dropdown navbar manual (Bootstrap data-toggle no aplica show en este setup)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.navbar [data-toggle="dropdown"]').forEach(trigger => {
    trigger.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      const menu = trigger.parentElement.querySelector('.dropdown-menu')
      if (!menu) return
      const abierto = menu.classList.contains('show')
      document.querySelectorAll('.navbar .dropdown-menu.show').forEach(m => m.classList.remove('show'))
      if (!abierto) menu.classList.add('show')
    })
  })
  document.addEventListener('click', () => {
    document.querySelectorAll('.navbar .dropdown-menu.show').forEach(m => m.classList.remove('show'))
  })
})

// Registra errores del frontend en /log_errores/error_[fecha].log
async function logFrontendError(contexto, err) {
  try {
    await fetch(CONFIG.BASE_URL + '/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('wts_token') },
      body: JSON.stringify({ contexto, mensaje: err?.stack || String(err) })
    })
  } catch (_) {}
}

function cargarNavbar() {
  const u = Auth.usuario()
  if (!u) return
  const el = document.getElementById('nav-usuario')
  if (el) el.textContent = u.nombre
  const perf = document.getElementById('nav-perfil')
  if (perf) perf.textContent = u.perfil
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.location.pathname.endsWith('login.html')) {
    if (!Auth.requerirLogin()) return
    cargarNavbar()
  }
})

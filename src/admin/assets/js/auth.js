// Manejo de sesión JWT en sessionStorage
const Auth = {
  TOKEN_KEY: 'wts_token',
  USER_KEY:  'wts_user',

  guardar(token, usuario) {
    sessionStorage.setItem(this.TOKEN_KEY, token)
    sessionStorage.setItem(this.USER_KEY, JSON.stringify(usuario))
  },

  token() {
    return sessionStorage.getItem(this.TOKEN_KEY)
  },

  usuario() {
    try { return JSON.parse(sessionStorage.getItem(this.USER_KEY)) } catch { return null }
  },

  cerrar() {
    sessionStorage.removeItem(this.TOKEN_KEY)
    sessionStorage.removeItem(this.USER_KEY)
    window.location.href = CONFIG.BASE_URL + '/login.html'
  },

  requerirLogin() {
    if (!this.token()) {
      window.location.href = CONFIG.BASE_URL + '/login.html'
      return false
    }
    return true
  },

  // Fetch autenticado — redirige al login si el token expira
  async fetch(url, opciones = {}) {
    opciones.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + this.token(),
      ...(opciones.headers || {}),
    }
    const resp = await fetch(url, opciones)
    if (resp.status === 401) {
      this.cerrar()
      throw new Error('Sesión expirada')
    }
    return resp
  },
}

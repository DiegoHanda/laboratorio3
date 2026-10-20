const CLAVE = 'reservas.sesion';

export const sesion = {
  leer() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE));
    } catch {
      return null;
    }
  },
  guardar(s) {
    localStorage.setItem(CLAVE, JSON.stringify(s));
  },
  borrar() {
    localStorage.removeItem(CLAVE);
  },
};

export async function api(metodo, ruta, body) {
  const s = sesion.leer();
  const res = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && ruta !== '/login') {
    sesion.borrar();
    window.location.reload();
  }
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!res.ok) throw new Error(datos?.error || `Error ${res.status}`);
  return datos;
}

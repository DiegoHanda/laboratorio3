export const horaLabel = (h) => `${String(h).padStart(2, '0')}:00`;

// Fecha local de hoy como YYYY-MM-DD (para el selector de día).
export function hoyISO(ahora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`;
}

// ¿Están libres todas las franjas desde `desde` (incluida) hasta `hasta` (excluida)?
export function rangoLibre(franjas, desde, hasta) {
  const tramo = franjas.filter((f) => f.hora >= desde && f.hora < hasta);
  return tramo.length === hasta - desde && tramo.every((f) => f.libre);
}

export function rangoLabel(inicio, fin) {
  const a = new Date(inicio);
  const b = new Date(fin);
  const dia = a.toLocaleDateString('es-UY', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const h = (d) => d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dia} ${h(a)}–${h(b)}`;
}

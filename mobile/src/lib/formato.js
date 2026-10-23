// Formatos chilenos para mostrar en pantalla
export const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;

export const hora = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

export const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) + ' · ' + hora(iso);

// "jue 15 oct · 10:00" (para la fecha de la visita)
export const diaYHora = (iso) =>
  new Date(iso).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '') + ' · ' + hora(iso);

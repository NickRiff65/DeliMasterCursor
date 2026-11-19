// Apariencia del panel: 'sistema' (la del equipo), 'claro' u 'oscuro'. Se guarda en este navegador y se
// aplica con data-tema en <html>; los colores de cada una están en estilos.css.
const CLAVE = 'delimaster.admin.tema';
export const OPCIONES_TEMA = [['sistema', 'Automática'], ['claro', 'Clara'], ['oscuro', 'Oscura']];

export function leerTema() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    return OPCIONES_TEMA.some(([v]) => v === guardado) ? guardado : 'sistema';
  } catch {
    return 'sistema';   // sin almacenamiento (navegación privada): se usa la del equipo
  }
}

export function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro' || tema === 'oscuro') raiz.dataset.tema = tema;
  else delete raiz.dataset.tema;
  // Color de la barra del navegador en el celular, según la apariencia que quedó
  const oscuro = tema === 'oscuro' || (tema !== 'claro' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#000000' : '#FFFFFF');
}

export function guardarTema(tema) {
  try { localStorage.setItem(CLAVE, tema); } catch { /* sin almacenamiento: dura hasta recargar */ }
  aplicarTema(tema);
}

import { Platform, StyleSheet } from 'react-native';

// Identidad visual de DeliMaster: verde azulado (confianza) con acento ámbar (reputación).
// Dos paletas con los mismos nombres; la vigente la elige TemaProvider (context/tema.js) según
// la preferencia de "Mi cuenta": automático (la del teléfono), claro u oscuro.
export const paletas = {
  claro: {
    primario: '#0F766E',
    primarioOscuro: '#115E59',     // texto verde sobre fondos claros (precios, avatares)
    primarioSuave: '#CCFBF1',
    sobrePrimario: '#FFFFFF',      // texto e íconos sobre el color primario
    acento: '#F59E0B',
    texto: '#1F2937',
    textoSuave: '#6B7280',
    borde: '#E5E7EB',
    estrellaVacia: '#9CA3AF',      // estrellas sin marcar al calificar
    fondo: '#F9FAFB',
    superficie: '#FFFFFF',
    logoPro: '#1F2937',
    error: '#DC2626',
    errorSuave: '#FEE2E2',
    errorBorde: '#FCA5A5',
    errorTexto: '#991B1B',
    verificado: '#047857',
    exitoFondo: '#F0FDF4',
    exitoBorde: '#BBF7D0',
    exitoTexto: '#166534',
    exitoInsignia: '#DCFCE7',
    exitoSuave: '#ECFDF5',
    avisoFondo: '#FFFBEB',
    avisoBorde: '#FDE68A',
    avisoTexto: '#92400E',
    avisoInsignia: '#FEF3C7',
    infoFondo: '#E0F2FE',
    infoTexto: '#075985',
    indigoFondo: '#E0E7FF',
    indigoTexto: '#3730A3',
    neutroFondo: '#F3F4F6',
    neutroTexto: '#374151',
    // Diseño: degradados (de más oscuro arriba a más claro abajo), sombras y tarjetas
    fondoArriba: '#CCFBF1',        // color del encabezado: continúa el degradado del fondo
    degradadoFondo: 'linear-gradient(180deg, #CCFBF1 0%, #E3F8F3 26%, #F3F9F8 58%, #FFFFFF 100%)',
    degradadoHeroe: 'linear-gradient(135deg, #0B4F4A 0%, #0F766E 52%, #14B8A6 100%)',
    degradadoHeroePro: 'linear-gradient(135deg, #0F172A 0%, #1F2937 55%, #0F766E 100%)',
    degradadoBoton: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
    sombra: '0px 8px 24px rgba(15, 118, 110, 0.10)',
    sombraFuerte: '0px 12px 28px rgba(15, 118, 110, 0.30)',
    bordeTarjeta: 'rgba(15, 118, 110, 0.08)',
    campoFondo: '#FFFFFF',
    sobreHeroe: '#FFFFFF',
    sobreHeroeSuave: 'rgba(255, 255, 255, 0.82)',
    burbujaHeroe: 'rgba(255, 255, 255, 0.10)',
  },
  oscuro: {
    primario: '#2DD4BF',
    primarioOscuro: '#5EEAD4',
    primarioSuave: '#134E4A',
    sobrePrimario: '#042F2E',      // texto oscuro: el blanco no contrasta con el verde claro
    acento: '#FBBF24',
    texto: '#F3F4F6',
    textoSuave: '#9CA3AF',
    borde: '#374151',
    estrellaVacia: '#6B7280',
    fondo: '#111827',
    superficie: '#1F2937',
    logoPro: '#374151',
    error: '#F87171',
    errorSuave: '#450A0A',
    errorBorde: '#7F1D1D',
    errorTexto: '#FCA5A5',
    verificado: '#34D399',
    exitoFondo: '#052E16',
    exitoBorde: '#166534',
    exitoTexto: '#86EFAC',
    exitoInsignia: '#14532D',
    exitoSuave: '#064E3B',
    avisoFondo: '#422006',
    avisoBorde: '#92400E',
    avisoTexto: '#FCD34D',
    avisoInsignia: '#451A03',
    infoFondo: '#0C4A6E',
    infoTexto: '#BAE6FD',
    indigoFondo: '#312E81',
    indigoTexto: '#C7D2FE',
    neutroFondo: '#374151',
    neutroTexto: '#E5E7EB',
    fondoArriba: '#042F2E',
    degradadoFondo: 'linear-gradient(180deg, #042F2E 0%, #0A2A2F 28%, #111827 62%, #1E293B 100%)',
    degradadoHeroe: 'linear-gradient(135deg, #062E2B 0%, #115E59 55%, #0D9488 100%)',
    degradadoHeroePro: 'linear-gradient(135deg, #020617 0%, #1E293B 55%, #115E59 100%)',
    degradadoBoton: 'linear-gradient(135deg, #14B8A6 0%, #5EEAD4 100%)',
    sombra: '0px 8px 24px rgba(0, 0, 0, 0.35)',
    sombraFuerte: '0px 12px 28px rgba(45, 212, 191, 0.22)',
    bordeTarjeta: 'rgba(255, 255, 255, 0.07)',
    campoFondo: '#111827',
    sobreHeroe: '#FFFFFF',
    sobreHeroeSuave: 'rgba(255, 255, 255, 0.80)',
    burbujaHeroe: 'rgba(255, 255, 255, 0.08)',
  },
};

let vigente = paletas.claro;

// Solo TemaProvider la cambia, antes de dibujar las pantallas
export function usarPaleta(paleta) {
  vigente = paleta;
}

// `colores.primario` siempre entrega el color de la paleta vigente al momento de dibujar
export const colores = {};
for (const nombre of Object.keys(paletas.claro)) {
  Object.defineProperty(colores, nombre, { get: () => vigente[nombre], enumerable: true });
}

// Estilos que dependen de la paleta: se calculan una vez por paleta y se entregan los de la vigente.
//   const estilos = crearEstilos((colores) => ({ caja: { backgroundColor: colores.superficie } }));
export function crearEstilos(fabrica) {
  const calculados = new Map();
  const actuales = () => {
    if (!calculados.has(vigente)) calculados.set(vigente, StyleSheet.create(fabrica(vigente)));
    return calculados.get(vigente);
  };
  return new Proxy({}, { get: (_objeto, nombre) => actuales()[nombre] });
}

// Fondo degradado (CSS linear-gradient): React Native lo dibuja de forma nativa y la web con CSS
export const degradado = (css) => (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css });

export const espacio = { xs: 4, s: 8, m: 16, l: 24, xl: 32 };

// Esquinas redondeadas: tarjetas suaves y botones tipo píldora
export const radio = { s: 12, m: 20, l: 28, pildora: 999 };

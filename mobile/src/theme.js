import { Platform, StyleSheet } from 'react-native';

// Identidad visual de DeliMaster: verde azulado profundo (confianza) con acento ámbar
// (reputación), neutros cálidos y sombras suaves en capas. Rediseño 2026: paleta más pulida,
// con la escala tipográfica `fuente` y espaciados de 4 pt consistentes en toda la app.
// Dos paletas con los mismos nombres; la vigente la elige TemaProvider (context/tema.js) según
// la preferencia de "Mi cuenta": automático (la del teléfono), claro u oscuro.
export const paletas = {
  claro: {
    primario: '#0B7568',
    primarioOscuro: '#095E54',     // texto verde sobre fondos claros (precios, avatares)
    primarioSuave: '#D9F2EA',
    sobrePrimario: '#FFFFFF',      // texto e íconos sobre el color primario
    acento: '#E8930C',
    texto: '#182230',
    textoSuave: '#5F6B7A',
    borde: '#E3E7EC',
    estrellaVacia: '#A3ACB9',      // estrellas sin marcar al calificar
    fondo: '#F6F7F5',
    superficie: '#FFFFFF',
    logoPro: '#182230',
    error: '#C92A2A',
    errorSuave: '#FDECEC',
    errorBorde: '#F3B3B3',
    errorTexto: '#8F1D1D',
    verificado: '#06755A',
    exitoFondo: '#EFFAF3',
    exitoBorde: '#B9E8CB',
    exitoTexto: '#17603A',
    exitoInsignia: '#D8F3E2',
    exitoSuave: '#EAF7F0',
    avisoFondo: '#FFF8E6',
    avisoBorde: '#F5D67B',
    avisoTexto: '#8A5A00',
    avisoInsignia: '#FCEFC7',
    infoFondo: '#E1F0FA',
    infoTexto: '#0B5B7E',
    indigoFondo: '#E2E6FA',
    indigoTexto: '#37348F',
    neutroFondo: '#EEF1F4',
    neutroTexto: '#3D4756',
    // Diseño: degradados (de más oscuro arriba a más claro abajo), sombras y tarjetas
    fondoArriba: '#D9F2EA',        // color del encabezado: continúa el degradado del fondo
    degradadoFondo: 'linear-gradient(180deg, #D9F2EA 0%, #E7F5EF 26%, #F4F8F6 58%, #FFFFFF 100%)',
    degradadoHeroe: 'linear-gradient(135deg, #074A42 0%, #0B7568 52%, #12A594 100%)',
    degradadoHeroePro: 'linear-gradient(135deg, #0D1526 0%, #182230 55%, #0B7568 100%)',
    degradadoBoton: 'linear-gradient(135deg, #0B7568 0%, #12A594 100%)',
    sombra: '0px 6px 20px rgba(11, 117, 104, 0.08)',
    sombraFuerte: '0px 10px 26px rgba(11, 117, 104, 0.26)',
    bordeTarjeta: 'rgba(11, 117, 104, 0.10)',
    campoFondo: '#FFFFFF',
    sobreHeroe: '#FFFFFF',
    sobreHeroeSuave: 'rgba(255, 255, 255, 0.82)',
    burbujaHeroe: 'rgba(255, 255, 255, 0.10)',
  },
  oscuro: {
    primario: '#2EC4B6',
    primarioOscuro: '#5FE3D0',
    primarioSuave: '#12473F',
    sobrePrimario: '#03211D',      // texto oscuro: el blanco no contrasta con el verde claro
    acento: '#F5B83D',
    texto: '#F2F4F7',
    textoSuave: '#A3ACB9',
    borde: '#333E4E',
    estrellaVacia: '#66707E',
    fondo: '#0F1622',
    superficie: '#1B2536',
    logoPro: '#333E4E',
    error: '#F28080',
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
    avisoTexto: '#F5CD6B',
    avisoInsignia: '#451A03',
    infoFondo: '#0C4A6E',
    infoTexto: '#BAE6FD',
    indigoFondo: '#312E81',
    indigoTexto: '#C7D2FE',
    neutroFondo: '#374151',
    neutroTexto: '#E5E7EB',
    fondoArriba: '#03211D',
    degradadoFondo: 'linear-gradient(180deg, #03211D 0%, #0A2724 28%, #0F1622 62%, #1B2536 100%)',
    degradadoHeroe: 'linear-gradient(135deg, #052A26 0%, #095E54 55%, #0E9C8A 100%)',
    degradadoHeroePro: 'linear-gradient(135deg, #020617 0%, #1E293B 55%, #115E59 100%)',
    degradadoBoton: 'linear-gradient(135deg, #12A594 0%, #5FE3D0 100%)',
    sombra: '0px 8px 24px rgba(0, 0, 0, 0.35)',
    sombraFuerte: '0px 12px 28px rgba(45, 212, 191, 0.22)',
    bordeTarjeta: 'rgba(255, 255, 255, 0.07)',
    campoFondo: '#0F1622',
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

// Espaciados en escala de 4 pt: todas las pantallas respiran con el mismo ritmo
export const espacio = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 40 };

// Escala tipográfica: tamaños de letra consistentes para toda la app
export const fuente = { xs: 12, s: 14, m: 16, l: 20, xl: 24, xxl: 32 };

// Esquinas redondeadas: tarjetas suaves y botones tipo píldora
export const radio = { s: 12, m: 20, l: 28, pildora: 999 };

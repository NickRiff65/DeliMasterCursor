import { Platform, StyleSheet } from 'react-native';

// Identidad visual de DeliMaster: neutro editorial y plano. Superficies blancas y grises
// cálidos, bordes discretos de 1 px, jerarquía por tipografía y espaciado. Un solo acento
// sobrio (verde profundo desaturado) usado con cuentagotas; el ámbar queda solo como color
// semántico apagado (estrellas y avisos). Sin gradientes de color, sin burbujas decorativas
// y con sombras casi nulas: manda el borde. Los «degradados» se conservan como tokens por
// compatibilidad, pero son colores planos.
// Dos paletas con los mismos nombres; la vigente la elige TemaProvider (context/tema.js)
// según la preferencia de "Mi cuenta": automático (la del teléfono), claro u oscuro.
export const paletas = {
  claro: {
    primario: '#166B5D',
    primarioOscuro: '#0E4A40',     // texto verde sobre fondos claros (precios, enlaces)
    primarioSuave: '#E9EFEC',
    sobrePrimario: '#FFFFFF',      // texto e íconos sobre el color primario
    acento: '#A87C22',             // ámbar apagado: solo estrellas y avisos
    texto: '#1C1917',
    textoSuave: '#57534E',
    borde: '#E7E5E4',
    estrellaVacia: '#C7C2BC',      // estrellas sin marcar al calificar
    fondo: '#FAFAF9',
    superficie: '#FFFFFF',
    logoPro: '#1C1917',
    error: '#B3261E',
    errorSuave: '#FAEFED',
    errorBorde: '#E7C8C3',
    errorTexto: '#8A2A23',
    verificado: '#166B5D',
    exitoFondo: '#F0F5F1',
    exitoBorde: '#CBDACF',
    exitoTexto: '#2C5B40',
    exitoInsignia: '#E4EFE7',
    exitoSuave: '#F0F5F1',
    avisoFondo: '#FAF6EA',
    avisoBorde: '#E4D6AE',
    avisoTexto: '#7A5C13',
    avisoInsignia: '#F3ECD4',
    infoFondo: '#EEF2F5',
    infoTexto: '#3D5A73',
    indigoFondo: '#F1F0EE',
    indigoTexto: '#44403C',
    neutroFondo: '#F5F5F4',
    neutroTexto: '#44403C',
    // Superficies «degradado»: hoy son colores planos (el fondo y los héroes no degradan)
    fondoArriba: '#FAFAF9',        // color del encabezado: el mismo fondo neutro
    degradadoFondo: 'linear-gradient(180deg, #FAFAF9 0%, #FAFAF9 100%)',
    degradadoHeroe: 'linear-gradient(135deg, #166B5D 0%, #166B5D 100%)',
    degradadoHeroePro: 'linear-gradient(135deg, #1C1917 0%, #1C1917 100%)',
    degradadoBoton: 'linear-gradient(135deg, #166B5D 0%, #166B5D 100%)',
    sombra: '0px 1px 2px rgba(28, 25, 23, 0.04)',
    sombraFuerte: '0px 2px 8px rgba(28, 25, 23, 0.07)',
    bordeTarjeta: '#E7E5E4',
    campoFondo: '#FFFFFF',
    sobreHeroe: '#FFFFFF',
    sobreHeroeSuave: 'rgba(255, 255, 255, 0.72)',
    burbujaHeroe: 'rgba(255, 255, 255, 0.05)',
  },
  oscuro: {
    primario: '#3E9C86',
    primarioOscuro: '#8FCBBB',
    primarioSuave: '#22302B',
    sobrePrimario: '#0C1512',      // texto oscuro: el blanco no contrasta con el verde claro
    acento: '#C69A3F',
    texto: '#F5F2EF',
    textoSuave: '#A8A29E',
    borde: '#35312C',
    estrellaVacia: '#57534E',
    fondo: '#141210',
    superficie: '#1E1B18',
    logoPro: '#0C0B0A',
    error: '#E08A80',
    errorSuave: '#3A2320',
    errorBorde: '#6E3A34',
    errorTexto: '#F0B4AC',
    verificado: '#3E9C86',
    exitoFondo: '#1D2A22',
    exitoBorde: '#38543F',
    exitoTexto: '#A7CDB2',
    exitoInsignia: '#24382B',
    exitoSuave: '#1D2A22',
    avisoFondo: '#2E2817',
    avisoBorde: '#5C4E22',
    avisoTexto: '#DEC887',
    avisoInsignia: '#38311B',
    infoFondo: '#22303A',
    infoTexto: '#AEC6D8',
    indigoFondo: '#2A2724',
    indigoTexto: '#CFC9C2',
    neutroFondo: '#2A2724',
    neutroTexto: '#D6D0C8',
    fondoArriba: '#141210',
    degradadoFondo: 'linear-gradient(180deg, #141210 0%, #141210 100%)',
    degradadoHeroe: 'linear-gradient(135deg, #1C6656 0%, #1C6656 100%)',
    degradadoHeroePro: 'linear-gradient(135deg, #0C0B0A 0%, #0C0B0A 100%)',
    degradadoBoton: 'linear-gradient(135deg, #2E7D6B 0%, #2E7D6B 100%)',
    sombra: '0px 1px 2px rgba(0, 0, 0, 0.40)',
    sombraFuerte: '0px 2px 8px rgba(0, 0, 0, 0.45)',
    bordeTarjeta: '#35312C',
    campoFondo: '#141210',
    sobreHeroe: '#FFFFFF',
    sobreHeroeSuave: 'rgba(255, 255, 255, 0.72)',
    burbujaHeroe: 'rgba(255, 255, 255, 0.05)',
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

// Fondo degradado (CSS linear-gradient): React Native lo dibuja de forma nativa y la web con CSS.
// Hoy los degradados del tema son planos; la función se mantiene para las pantallas que la usan.
export const degradado = (css) => (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css });

// Espaciados en escala de 4 pt: todas las pantallas respiran con el mismo ritmo
export const espacio = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 40 };

// Escala tipográfica: tamaños de letra consistentes para toda la app
export const fuente = { xs: 12, s: 14, m: 16, l: 20, xl: 24, xxl: 32 };

// Esquinas redondeadas: moderadas en tarjetas (12) y píldora solo en chips y botones
export const radio = { s: 8, m: 12, l: 16, pildora: 999 };

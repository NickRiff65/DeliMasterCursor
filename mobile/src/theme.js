import { Platform, StyleSheet } from 'react-native';
import { ES_PRO } from './lib/variante';

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
    sombraHoja: '0px -8px 24px rgba(11, 117, 104, 0.12)',   // hoja inferior: la sombra sube hacia el contenido
    bordeTarjeta: 'rgba(11, 117, 104, 0.10)',
    campoFondo: '#FFFFFF',
    sobreHeroe: '#FFFFFF',
    sobreHeroeSuave: 'rgba(255, 255, 255, 0.82)',
    // Botón y logo sobre el encabezado de color; avatares con un degradado por prestador
    sobreHeroeBoton: '#FFFFFF',
    sobreHeroeBotonTexto: '#0B7568',
    logoFondo: '#FFFFFF',
    logoTexto: '#0B7568',
    logoLetraPro: '#182230',       // la «D» de DeliMaster Pro en el inicio de sesión
    avatares: [
      'linear-gradient(135deg, #0B7568 0%, #2EC4B6 100%)',
      'linear-gradient(135deg, #6D28D9 0%, #C084FC 100%)',
      'linear-gradient(135deg, #C2410C 0%, #FBBF24 100%)',
      'linear-gradient(135deg, #1D4ED8 0%, #60A5FA 100%)',
      'linear-gradient(135deg, #BE185D 0%, #F472B6 100%)',
      'linear-gradient(135deg, #047857 0%, #A3E635 100%)',
    ],
    avatarRespaldo: ['#0B7568', '#6D28D9', '#C2410C', '#1D4ED8', '#BE185D', '#06755A'],
  },
  oscuro: {
    primario: '#FFFFFF',           // botones y acciones principales: blancos sobre negro
    primarioOscuro: '#E4E4E7',
    primarioSuave: '#27272A',
    sobrePrimario: '#000000',      // texto negro sobre los botones blancos
    acento: '#F5B83D',
    texto: '#F5F6F7',
    textoSuave: '#A1A1AA',
    borde: '#262626',
    estrellaVacia: '#66707E',
    fondo: '#000000',
    superficie: '#141414',
    logoPro: '#262626',
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
    fondoArriba: '#000000',
    degradadoFondo: 'linear-gradient(180deg, #000000 0%, #000000 100%)',
    degradadoHeroe: 'linear-gradient(135deg, #1C1C1E 0%, #0A0A0A 100%)',
    degradadoHeroePro: 'linear-gradient(135deg, #1C1C1E 0%, #0A0A0A 100%)',
    degradadoBoton: 'linear-gradient(135deg, #FFFFFF 0%, #E4E4E7 100%)',
    sombra: '0px 8px 24px rgba(0, 0, 0, 0.6)',
    sombraFuerte: '0px 12px 28px rgba(255, 255, 255, 0.10)',
    sombraHoja: '0px -8px 24px rgba(0, 0, 0, 0.7)',
    bordeTarjeta: 'rgba(255, 255, 255, 0.07)',
    campoFondo: '#141414',
    sobreHeroe: '#FFFFFF',
    sobreHeroeSuave: 'rgba(255, 255, 255, 0.80)',
    // Negro y blanco: el botón y el logo son blancos o grises; los avatares son grises
    sobreHeroeBoton: '#FFFFFF',
    sobreHeroeBotonTexto: '#000000',
    logoFondo: '#1C1C1E',
    logoTexto: '#FFFFFF',
    logoLetraPro: '#FFFFFF',
    avatares: [
      'linear-gradient(135deg, #3F3F46 0%, #71717A 100%)',
      'linear-gradient(135deg, #27272A 0%, #52525B 100%)',
      'linear-gradient(135deg, #404040 0%, #737373 100%)',
      'linear-gradient(135deg, #2A2A2A 0%, #5C5C5C 100%)',
      'linear-gradient(135deg, #353540 0%, #6B6B78 100%)',
      'linear-gradient(135deg, #1F1F1F 0%, #4B4B4B 100%)',
    ],
    avatarRespaldo: ['#3F3F46', '#27272A', '#404040', '#2A2A2A', '#353540', '#1F1F1F'],
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

// Letra más grande (recomendación del profesor): muchos maestros son mayores y usan el celular con las
// manos grandes, ocupadas o sucias. Toda la app agranda la letra en esta proporción, y con ella la
// altura mínima de botones, campos y chips (más fáciles de tocar): bastante en la de maestros y un
// poco en la de clientes.
export const ESCALA_LETRA_PRO = 1.15;
export const ESCALA_LETRA_LITE = 1.1;
const escalaLetra = () => (ES_PRO ? ESCALA_LETRA_PRO : ESCALA_LETRA_LITE);

// Tamaño de letra para estilos escritos directamente en una pantalla (fuera de crearEstilos)
export const letra = (tamano) => Math.round(tamano * escalaLetra());

function agrandarLetras(estilos, escala) {
  if (escala === 1) return estilos;
  const agrandados = {};
  for (const [nombre, estilo] of Object.entries(estilos)) {
    agrandados[nombre] = { ...estilo };
    for (const medida of ['fontSize', 'lineHeight', 'minHeight']) {
      if (typeof estilo[medida] === 'number') agrandados[nombre][medida] = Math.round(estilo[medida] * escala);
    }
  }
  return agrandados;
}

// Estilos que dependen de la paleta: se calculan una vez por paleta y se entregan los de la vigente.
// Las letras salen agrandadas según la app (ESCALA_LETRA_PRO o ESCALA_LETRA_LITE).
//   const estilos = crearEstilos((colores) => ({ caja: { backgroundColor: colores.superficie } }));
export function crearEstilos(fabrica) {
  const calculados = new Map();
  const actuales = () => {
    if (!calculados.has(vigente)) {
      calculados.set(vigente, StyleSheet.create(agrandarLetras(fabrica(vigente), escalaLetra())));
    }
    return calculados.get(vigente);
  };
  return new Proxy({}, { get: (_objeto, nombre) => actuales()[nombre] });
}

// Fondo degradado (CSS linear-gradient): React Native lo dibuja de forma nativa y la web con CSS
// En Android, el degradado experimental de React Native (experimental_backgroundImage) cierra la app con
// IllegalArgumentException (BackgroundImageDrawable.draw) cuando una vista con degradado se dibuja con tamaño cero:
// pasaba al terminar o calificar un trabajo, cuando desaparecen los botones (26-11-2026). En la app nativa se usa un
// color sólido tomado del propio degradado; la versión web (y el iPhone, que la usa) mantiene el degradado.
const coloresDe = (css) => css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? [];
export const degradado = (css) => {
  if (Platform.OS === 'web') return { backgroundImage: css };
  const c = coloresDe(css);
  return c.length ? { backgroundColor: c.length >= 3 ? c[1] : c[0] } : {};
};

// Espaciados en escala de 4 pt: todas las pantallas respiran con el mismo ritmo
export const espacio = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 40 };

// Escala tipográfica: tamaños de letra consistentes para toda la app
export const fuente = { xs: 12, s: 14, m: 16, l: 20, xl: 24, xxl: 32 };

// Esquinas redondeadas: tarjetas suaves y botones tipo píldora
export const radio = { s: 12, m: 20, l: 28, pildora: 999 };

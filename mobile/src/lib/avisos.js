// Cómo se muestra un aviso (lista de avisos y aviso flotante): un ícono de línea según de qué trata,
// en vez del emoji que traían los títulos. Los avisos antiguos guardados con emoji se muestran sin él.
const ICONOS = {
  campana: require('../../assets/iconos/app/campana.png'),
  dinero: require('../../assets/iconos/app/cartera.png'),
  verificado: require('../../assets/iconos/perfil/verificaciones.png'),
  advertencia: require('../../assets/iconos/app/advertencia.png'),
  protegido: require('../../assets/iconos/app/protegido.png'),
  reloj: require('../../assets/iconos/app/reloj.png'),
  ubicacion: require('../../assets/iconos/app/ubicacion.png'),
  trabajador: require('../../assets/iconos/app/trabajador.png'),
};

// Emojis y símbolos al comienzo del título (incluye los pares sustitutos de los emojis de color)
const EMOJI_INICIAL = /^(?:[←-⯿]|[\uD83C-\uD83E][\uDC00-\uDFFF]|️|‍|\s)+/;

export const tituloSinEmoji = (titulo = '') => titulo.replace(EMOJI_INICIAL, '');

export function iconoDeAviso({ tipo, titulo = '' }) {
  const t = tituloSinEmoji(titulo);
  if (/bloquead|último aviso|reportó un problema/i.test(t)) return ICONOS.advertencia;
  if (tipo === 'verificacion') return /venci|vencer|no pudimos/i.test(t) ? ICONOS.advertencia : ICONOS.verificado;
  if (tipo === 'pago') return ICONOS.dinero;
  if (/reclamo/i.test(t)) return ICONOS.protegido;
  if (/no respondió/i.test(t)) return ICONOS.reloj;
  if (/dirección/i.test(t)) return ICONOS.ubicacion;
  if (/maestro|solicitud|aceptó|terminó|eligió|cotización/i.test(t)) return ICONOS.trabajador;
  return ICONOS.campana;
}

export const presentarAviso = (aviso) => ({ titulo: tituloSinEmoji(aviso.titulo), icono: iconoDeAviso(aviso) });

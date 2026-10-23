// HU-04: filtro anti-fuga del chat.
// Mientras el pago no está asegurado, impide compartir datos que permitan cerrar el trato
// por fuera de la plataforma (teléfonos, correos, datos bancarios, redes de mensajería).
// Está pensado para resistir los trucos habituales: espacios o guiones entre dígitos,
// números escritos en palabras, "arroba" en vez de @, abreviaturas como "wsp".

const DIGITOS_EN_PALABRAS = {
  cero: '0', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4',
  cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9',
};

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// "nueve ocho siete" → "9 8 7"
function palabrasADigitos(texto) {
  return texto.replace(/\b(cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g, (p) => DIGITOS_EN_PALABRAS[p]);
}

const REGLAS = [
  {
    motivo: 'telefono',
    // 8 o más dígitos seguidos, aunque estén separados por CUALQUIER símbolo (espacios, puntos,
    // guiones, asteriscos, comas…). Cubre celulares, fijos, RUT y números de cuenta.
    probar: (t) => secuenciasDeDigitos(t).some((s) => s.digitos >= 8 && !s.pareceListaDeMontos),
  },
  {
    motivo: 'correo',
    probar: (t) => /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\barroba\b)\s*[a-z0-9-]+\s*(?:\.|\bpunto\b)\s*[a-z]{2,}/.test(t),
  },
  {
    motivo: 'datos_bancarios',
    probar: (t) => /\b(cuenta\s*(?:rut|corriente|vista)|cuentarut|cta\.?\s*(?:cte|rut|vista)|n(?:u|ú)mero\s+de\s+cuenta|n(?:ro|°|º)\.?\s+de\s+cuenta|transfer(?:encia|ir|ime|ile|i|ido)|transfiere|deposit(?:o|a|ar|ame|ale)|bancoestado|banco\s+estado|rut\s*:?\s*\d|mi\s+rut)/.test(t),
  },
  {
    motivo: 'contacto_externo',
    probar: (t) => /\b(whats?app|wsp|wasap|guasap|wa\.me|telegram|instagram|insta|facebook|messenger|mi\s+(?:numero|fono|cel(?:u|ular)?|whats?app|wsp|correo|mail|instagram|insta)|llam(?:a|e)me|te\s+llamo)\b/.test(t),
  },
  {
    // Intención de cerrar el trato por fuera, aunque no se comparta ningún dato
    motivo: 'pago_externo',
    probar: (t) => /\b((sin|fuera\s+de|por\s+fuera\s+de)\s+(la\s+|esta\s+)?(app|aplicacion|plataforma|delimaster)|pag\w*\s+(en\s+|al\s+)?(efectivo|contado|mano)|en\s+efectivo|ahorr\w*\s+(la\s+)?comision|sin\s+(la\s+)?comision)\b/.test(t),
  },
  {
    motivo: 'enlace',
    probar: (t) => /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|cl|net|org|me|ly)\b)/.test(t),
  },
];

const MENSAJES = {
  telefono: 'números de teléfono o de cuenta',
  correo: 'correos electrónicos',
  datos_bancarios: 'datos bancarios o de transferencia',
  contacto_externo: 'contactos por otras aplicaciones',
  enlace: 'enlaces',
  pago_externo: 'acuerdos de pago por fuera de la plataforma',
};

// Agrupa los dígitos del texto en secuencias: grupos de dígitos separados por hasta 3 símbolos
// que NO sean letras ("2*1*2*3" o "21.344.451-1" son una sola secuencia; "20 minutos, 2 ayudantes" no).
function secuenciasDeDigitos(texto) {
  const secuencias = [];
  let actual = null;
  for (const m of texto.matchAll(/\d+/g)) {
    const separador = actual ? texto.slice(actual.fin, m.index) : null;
    if (actual && separador.length <= 3 && !/[a-z]/.test(separador)) {
      actual.grupos.push(m[0]);
      actual.separadores.push(separador);
    } else {
      actual = { grupos: [m[0]], separadores: [] };
      secuencias.push(actual);
    }
    actual.fin = m.index + m[0].length;
  }
  return secuencias.map(({ grupos, separadores }) => ({
    digitos: grupos.join('').length,
    // "Cobro 45000, materiales 20000" no es un teléfono: montos de 4+ dígitos separados por ", "
    pareceListaDeMontos: grupos.length > 1 && grupos.every((g) => g.length >= 4)
      && separadores.every((sep) => /^[,;]\s+$/.test(sep)),
  }));
}

// Una vez que el pago está protegido, las partes pueden compartir su teléfono para coordinarse,
// pero siguen bloqueadas las propuestas de pagar por fuera y los datos bancarios: así no se
// desvían trabajos adicionales fuera de la plataforma (Gu y Zhu, 2021; regla RN-08).
export const MOTIVOS_TRAS_PAGO = ['pago_externo', 'datos_bancarios'];

export function analizarMensaje(texto, { trasPago = false } = {}) {
  // Los montos con signo $ son parte normal de la conversación ("$45.000"): no cuentan como número.
  const base = palabrasADigitos(normalizar(texto)).replace(/\$\s*[\d.,]+/g, ' ');
  const reglas = trasPago ? REGLAS.filter((r) => MOTIVOS_TRAS_PAGO.includes(r.motivo)) : REGLAS;
  const motivos = reglas.filter((r) => r.probar(base)).map((r) => r.motivo);
  let aviso = null;
  if (motivos.length) {
    aviso = trasPago
      ? 'Los trabajos y pagos con personas que conociste en DeliMaster se hacen por la app: así tu dinero queda protegido.'
      : `Por tu seguridad, no se pueden compartir ${motivos.map((m) => MENSAJES[m]).join(', ')} hasta que el pago esté protegido en DeliMaster.`;
  }
  return { bloqueado: motivos.length > 0, motivos, aviso };
}

// Mismo análisis, pero considerando también los mensajes recientes de la misma persona:
// detecta datos enviados "por partes" ("ese" / "es" / "mi" / "rut" / "2" / "1" / …).
export function analizarConContexto(texto, mensajesAnteriores = [], opciones = {}) {
  const individual = analizarMensaje(texto, opciones);
  if (individual.bloqueado || !mensajesAnteriores.length) return individual;
  const combinado = analizarMensaje([...mensajesAnteriores, texto].join(' '), opciones);
  if (!combinado.bloqueado) return individual;
  return {
    ...combinado,
    aviso: `${combinado.aviso} Esto también aplica si los datos se envían en varios mensajes.`,
  };
}

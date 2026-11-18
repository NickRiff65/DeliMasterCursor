// Resumen corto del perfil de un maestro para elegirlo al pedir un servicio.
// No muestra la descripción completa: extrae lo que más le importa a un cliente (experiencia,
// puntualidad, urgencias, garantía, verificación y trabajos cerrados) con reglas simples y explicables.
// Lo que dice el maestro en su ficha es lo único que se lee: no se inventa nada.

const MAX_PUNTOS = 3;

// «15 años de experiencia» o «experiencia de 15 años»
function anosDeExperiencia(texto) {
  const m = texto.match(/(\d{1,2})\s*a[ñn]os\s+(?:de\s+)?(?:experiencia|trabajando|en el oficio|en el rubro)/i)
    ?? texto.match(/experiencia\s+de\s+(\d{1,2})\s*a[ñn]os/i);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 60 ? n : null;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Puntos clave en orden de importancia para el cliente; como máximo MAX_PUNTOS
export function puntosClave(prestador) {
  const texto = prestador.descripcion ?? '';
  const puntos = [];
  if ((prestador.categorias ?? []).some((c) => c.verificada)) puntos.push('Verificado');
  const anos = anosDeExperiencia(texto);
  if (anos) puntos.push(`${anos} años de experiencia`);
  if (/puntual/i.test(texto)) puntos.push('Puntual');
  if (/urgenc|emergenc/i.test(texto)) puntos.push('Atiende urgencias');
  if (/garant[ií]a/i.test(texto)) puntos.push('Da garantía');
  const cerrados = Number(prestador.trabajos_cerrados ?? 0);
  if (cerrados >= 1) puntos.push(plural(cerrados, 'trabajo cerrado', 'trabajos cerrados'));
  return puntos.slice(0, MAX_PUNTOS);
}

// La primera frase de la descripción, recortada si es muy larga
export function descripcionBreve(texto, max = 110) {
  if (!texto) return null;
  const primera = texto.trim().split(/(?<=[.!?])\s+|\n+/)[0].trim();
  if (!primera) return null;
  return primera.length > max ? `${primera.slice(0, max - 1).trimEnd()}…` : primera;
}

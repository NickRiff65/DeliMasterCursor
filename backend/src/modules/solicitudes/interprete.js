// HU-08: interpretación de solicitudes escritas en lenguaje natural.
// Enfoque por palabras clave (definido en el informe): simple, explicable y sin costo por uso.
import { clave, COMUNAS, COMUNAS_NUBLE } from '../../utils/comunas.js';

// Separa el texto normalizado en palabras ("¿Podar el árbol?" → ["podar", "el", "arbol"])
function palabras(texto) {
  return clave(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

// Una palabra clave coincide con una palabra del texto si es igual, o si la clave es raíz de la
// palabra ("enchufe" ~ "enchufes", "canal" ~ "canales"). Las claves de 4 letras o menos exigen
// coincidencia exacta para evitar falsos positivos ("auto" no debe coincidir con "automatico").
function coincide(palabraTexto, palabraClave) {
  if (palabraTexto === palabraClave) return true;
  return palabraClave.length >= 5 && palabraTexto.startsWith(palabraClave);
}

// Las claves de varias palabras ("cortar arbol") deben aparecer en orden, admitiendo hasta
// MAX_SEPARACION palabras intermedias ("cortar UN arbol", "cortar UNOS arboles").
const MAX_SEPARACION = 2;

function contieneFrase(tokens, partes) {
  for (let i = 0; i < tokens.length; i++) {
    if (!coincide(tokens[i], partes[0])) continue;
    let pos = i;
    const completa = partes.slice(1).every((parte) => {
      for (let j = pos + 1; j <= pos + 1 + MAX_SEPARACION && j < tokens.length; j++) {
        if (coincide(tokens[j], parte)) { pos = j; return true; }
      }
      return false;
    });
    if (completa) return true;
  }
  return false;
}

// Puntaje de una categoría para un texto: cuántas de sus palabras clave aparecen
// (las frases pesan el doble porque son más específicas).
export function puntaje(texto, palabrasClave) {
  const tokens = palabras(texto);
  let total = 0;
  for (const pc of palabrasClave) {
    const partes = palabras(pc);
    if (partes.length > 1) {
      if (contieneFrase(tokens, partes)) total += 2;
    } else if (tokens.some((t) => coincide(t, partes[0]))) {
      total += 1;
    }
  }
  return total;
}

// Detecta las categorías mencionadas. `categorias` = [{ slug, nombre, palabras_clave, activa }]
export function detectarCategorias(texto, categorias) {
  return categorias
    .map((c) => ({ ...c, puntaje: puntaje(texto, c.palabras_clave) }))
    .filter((c) => c.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje);
}

// Comuna de Ñuble mencionada en el texto ("... en Coihueco"). Se buscan primero los nombres más
// largos para que "Chillán Viejo" gane sobre "Chillán".
const comunasPorLargo = [...COMUNAS_NUBLE].sort((a, b) => b.length - a.length);

function comunaMencionada(texto) {
  const normalizado = ` ${palabras(texto).join(' ')} `;
  return comunasPorLargo.find((c) => normalizado.includes(` ${palabras(c).join(' ')} `)) ?? null;
}

// La comuna mencionada, solo si DeliMaster opera en ella (Chillán o Coihueco)
export function detectarComuna(texto) {
  const c = comunaMencionada(texto);
  return COMUNAS.includes(c) ? c : null;
}

// Una comuna mencionada en la que DeliMaster aún no opera (para avisarle al cliente)
export function comunaFueraDeCobertura(texto) {
  const c = comunaMencionada(texto);
  return c && !COMUNAS.includes(c) ? c : null;
}

export function interpretar(texto, categorias) {
  const detectadas = detectarCategorias(texto, categorias);
  return {
    categorias: detectadas.filter((c) => c.activa).map(({ slug, nombre }) => ({ slug, nombre })),
    // Mencionadas pero aún no habilitadas en la fase actual del lanzamiento
    no_disponibles: detectadas.filter((c) => !c.activa).map(({ slug, nombre }) => ({ slug, nombre })),
    comuna: detectarComuna(texto),
    fuera_de_cobertura: comunaFueraDeCobertura(texto),
  };
}

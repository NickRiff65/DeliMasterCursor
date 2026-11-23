// Mide cuánto acierta la detección del problema por foto con fotos reales, con el proveedor de IA
// configurado (Claude o Gemini). Corriéndolo con ambos se comparan acierto, tiempo y costo.
//
//   npm run evaluar-fotos                          → carpeta fotos-ia/ y el proveedor de backend/.env
//   npm run evaluar-fotos -- --proveedor gemini    → fuerza un proveedor (claude o gemini)
//   npm run evaluar-fotos -- <carpeta>             → otra carpeta con la misma estructura
//
// La carpeta tiene una subcarpeta por servicio esperado (electricidad, gasfiteria, cerrajeria, techumbre,
// vidrieria, poda-altura) y una llamada «ninguna» para fotos que no muestran un problema de esos oficios.
// Cada foto (JPG, PNG o WebP) es un caso. Necesita la clave del proveedor en backend/.env: con Claude cada
// foto cuesta unos 2 centavos de dólar (el script muestra el costo real); el nivel gratuito de Gemini no
// cobra, pero tiene un tope de consultas por minuto y por día (el script espera y reintenta si lo alcanza).
//
// Resultado: una tabla en la consola y un CSV en la misma carpeta (resultados-<proveedor>-<fecha>.csv), para
// el informe: acierto general y por servicio, cuántas veces la IA prefirió no decidir y el tiempo medio.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectarEnFotos, elegirProveedor, CATEGORIAS_FOTO, PROVEEDORES } from '../src/modules/solicitudes/interpreteFoto.js';
import { PRECIO_CLAUDE } from '../src/modules/solicitudes/ia/claude.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argumentos = process.argv.slice(2);
const iProveedor = argumentos.indexOf('--proveedor');
if (iProveedor >= 0) {
  process.env.IA_PROVEEDOR = argumentos[iProveedor + 1] ?? '';
  argumentos.splice(iProveedor, 2);
}
const carpeta = path.resolve(argumentos[0] ?? path.join(RAIZ, 'fotos-ia'));
const ESPERADOS = [...Object.keys(CATEGORIAS_FOTO), 'ninguna'];
const EXTENSIONES = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const proveedor = elegirProveedor();
if (!proveedor) {
  console.error(process.env.IA_PROVEEDOR
    ? `El proveedor «${process.env.IA_PROVEEDOR}» no existe o le falta su clave en backend/.env (claude: ANTHROPIC_API_KEY · gemini: GEMINI_API_KEY).`
    : 'Falta la clave de un proveedor en backend/.env: ANTHROPIC_API_KEY (Claude) o GEMINI_API_KEY (Gemini).');
  process.exit(1);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Si el proveedor pide bajar el ritmo (429: tope por minuto del nivel gratuito), espera y reintenta
async function detectarConReintentos(base64) {
  for (let intento = 1; ; intento++) {
    try {
      return await detectarEnFotos([base64]);
    } catch (err) {
      if (err.status !== 429 || intento === 3) throw err;
      console.log(`    (el proveedor pidió esperar: reintento en ${20 * intento} s)`);
      await espera(20_000 * intento);
    }
  }
}

const casos = [];
for (const esperado of ESPERADOS) {
  let archivos = [];
  try {
    archivos = (await readdir(path.join(carpeta, esperado))).filter((a) => EXTENSIONES.has(path.extname(a).toLowerCase()));
  } catch { /* la subcarpeta no existe: ese servicio no se evalúa */ }
  for (const archivo of archivos.sort()) casos.push({ esperado, archivo });
}
if (!casos.length) {
  console.error(`No hay fotos en ${carpeta}. Crea subcarpetas con estos nombres y pon las fotos dentro: ${ESPERADOS.join(', ')}.`);
  process.exit(1);
}

console.log(`Evaluando ${casos.length} fotos con ${PROVEEDORES[proveedor].nombre} (${PROVEEDORES[proveedor].modelo()})…\n`);
const filas = [];
let modeloUsado = PROVEEDORES[proveedor].modelo();
let tokensEntrada = 0;
let tokensSalida = 0;
for (const [i, c] of casos.entries()) {
  const base64 = (await readFile(path.join(carpeta, c.esperado, c.archivo))).toString('base64');
  const inicio = Date.now();
  let fila;
  try {
    const { resultado, uso, modelo } = await detectarConReintentos(base64);
    if (modelo) modeloUsado = modelo;
    tokensEntrada += uso?.entrada ?? 0;
    tokensSalida += uso?.salida ?? 0;
    // Con confianza baja la app no preselecciona el servicio: cuenta como «no decidió»
    const detectado = !resultado ? 'declinó' : resultado.confianza === 'baja' ? 'ninguna' : resultado.categoria;
    fila = {
      ...c, detectado, confianza: resultado?.confianza ?? '', acierto: detectado === c.esperado,
      ms: Date.now() - inicio, descripcion: resultado?.descripcion ?? '', peligro: resultado?.peligro ?? '',
    };
  } catch (err) {
    // El tope persiste aun tras esperar (tope diario del nivel gratuito): se detiene y resume lo evaluado,
    // en vez de anotar como error cada foto que falta
    if (err.status === 429) {
      console.log(`\nEl proveedor alcanzó su tope de consultas: se evaluaron ${filas.length} de ${casos.length} fotos.`
        + ' Vuelve a correrlo más tarde (o mañana, si es el tope diario) o elige otro modelo con GEMINI_MODELO.');
      break;
    }
    const motivo = PROVEEDORES[proveedor].describirError(err) ?? err.message;
    fila = { ...c, detectado: 'error', confianza: '', acierto: false, ms: Date.now() - inicio, descripcion: motivo, peligro: '' };
  }
  filas.push(fila);
  console.log(`${String(i + 1).padStart(3)}. ${fila.acierto ? '✔' : '✖'} ${c.esperado}/${c.archivo} → ${fila.detectado}`
    + `${fila.confianza ? ` (${fila.confianza})` : ''} · ${(fila.ms / 1000).toFixed(1)} s`);
}
if (!filas.length) process.exit(1);

// ------------------------------------------------------------------ resumen
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const aciertos = filas.filter((f) => f.acierto).length;
console.log('\nServicio          Fotos  Aciertos');
for (const esperado of ESPERADOS) {
  const delServicio = filas.filter((f) => f.esperado === esperado);
  if (!delServicio.length) continue;
  const ok = delServicio.filter((f) => f.acierto).length;
  console.log(`${esperado.padEnd(17)} ${String(delServicio.length).padStart(5)}  ${String(ok).padStart(4)} (${pct(ok, delServicio.length)})`);
}
const conProblema = filas.filter((f) => f.esperado !== 'ninguna');
const noDecidio = conProblema.filter((f) => ['ninguna', 'declinó'].includes(f.detectado)).length;
const equivocadas = conProblema.filter((f) => !f.acierto && !['ninguna', 'declinó', 'error'].includes(f.detectado)).length;
console.log(`\nModelo: ${modeloUsado}`);
console.log(`Acierto general: ${aciertos} de ${filas.length} (${pct(aciertos, filas.length)})`);
console.log(`Fotos con problema en que no decidió (el cliente elige el servicio): ${noDecidio} de ${conProblema.length}`);
console.log(`Fotos con problema en que eligió un servicio equivocado: ${equivocadas} de ${conProblema.length}`);
console.log(`Tiempo medio por foto: ${(filas.reduce((t, f) => t + f.ms, 0) / filas.length / 1000).toFixed(1)} s`);
const tokens = `${tokensEntrada.toLocaleString('es-CL')} tokens de entrada y ${tokensSalida.toLocaleString('es-CL')} de salida`;
if (proveedor === 'claude') {
  const costo = (tokensEntrada * PRECIO_CLAUDE.entrada + tokensSalida * PRECIO_CLAUDE.salida) / 1_000_000;
  console.log(`Costo: US$${costo.toFixed(3)} (${tokens}) · US$${(costo / filas.length).toFixed(4)} por foto`);
} else {
  console.log(`Costo: sin cobro en el nivel gratuito de Gemini (${tokens}; en el nivel pagado, ver los precios de Google)`);
}

const csv = (v) => `"${String(v).replaceAll('"', '""')}"`;
const sello = new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).slice(0, 16).replace(' ', '-').replace(':', '');
const destino = path.join(carpeta, `resultados-${proveedor}-${sello}.csv`);
await writeFile(destino, [
  'proveedor,modelo,servicio_esperado,archivo,servicio_detectado,confianza,acierto,segundos,descripcion,peligro',
  ...filas.map((f) => [proveedor, modeloUsado, f.esperado, f.archivo, f.detectado, f.confianza, f.acierto ? 'si' : 'no', (f.ms / 1000).toFixed(1), f.descripcion, f.peligro].map(csv).join(',')),
].join('\n'), 'utf8');
console.log(`\nDetalle guardado en ${destino}`);
process.exit(0);

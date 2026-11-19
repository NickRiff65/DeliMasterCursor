// Medición de laboratorio del KPI técnico «sincronización de la cola sin conexión».
// Simula lo que hace la app cuando vuelve la señal: reenvía la solicitud guardada en el teléfono (con el
// UUID que generó sin conexión) hasta que el servidor la confirma. Se prueban los tres casos reales:
//   A) la primera vez llega y se confirma;
//   B) el servidor la recibió pero el teléfono no alcanzó a ver la respuesta, y la reenvía;
//   C) la app la envía dos veces a la vez (doble toque o reintento solapado).
// Una sincronización es exitosa si la solicitud queda registrada exactamente una vez.
//   node rendimiento/sincronizacion.js [cantidad]      (contra el servidor de pruebas, puerto 3001)
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
if (/:3000\b/.test(BASE) || /ts\.net/.test(BASE)) {
  console.error('✘ Esta medición no se ejecuta contra el servidor real.');
  process.exit(1);
}
const TOTAL = Number(process.argv[2] ?? 300);
const EN_PARALELO = 15;
const sufijo = Date.now().toString(36);
const clave = `Sinc${randomBytes(6).toString('hex')}9`;
const ip = (n) => `10.${200 + Math.floor(n / 250)}.${n % 250}.9`;
const NECESIDADES = ['Se me quemó un enchufe y saltó el automático', 'Necesito podar un árbol muy alto', 'Se rompió una cañería en la cocina'];

async function llamar(n, metodo, ruta, cuerpo, token) {
  const r = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(n), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// Preparación (fuera de la medición): una cuenta de cliente por teléfono simulado
const tokens = [];
async function registrar(n) {
  const registro = await llamar(n, 'POST', '/auth/registro', {
    rol: 'cliente', nombre: 'Cola', apellido: 'Prueba', email: `cola${n}.${sufijo}@carga.test`, password: clave,
    acepta_terminos: true, comuna: n % 4 === 0 ? 'Coihueco' : 'Chillán',
  });
  tokens[n] = registro.status === 201 ? registro.body.token : null;
}

async function sincronizar(n) {
  const caso = 'ABC'[n % 3];
  const token = tokens[n];
  if (!token) return { caso, exito: false, motivo: 'sin cuenta' };
  // La solicitud se creó sin señal hace un rato: el identificador y la hora los puso el teléfono
  const solicitud = {
    id: randomUUID(), descripcion: NECESIDADES[n % NECESIDADES.length], comuna: n % 4 === 0 ? 'Coihueco' : 'Chillán',
    direccion: `Camino a Coihueco km ${n + 1}`, creado_en_dispositivo: new Date(Date.now() - 45 * 60_000).toISOString(),
  };
  const inicio = performance.now();
  const estados = [];
  if (caso === 'C') {
    const [a, b] = await Promise.all([llamar(n, 'POST', '/solicitudes', solicitud, token), llamar(n, 'POST', '/solicitudes', solicitud, token)]);
    estados.push(a.status, b.status);
  } else {
    estados.push((await llamar(n, 'POST', '/solicitudes', solicitud, token)).status);
  }
  // B y C: la app no vio (o no confía en) la respuesta y reenvía hasta recibir la confirmación
  let intentos = 0;
  let confirmada = caso === 'A' && estados[0] === 201;
  while (!confirmada && intentos < 5) {
    intentos++;
    const r = await llamar(n, 'POST', '/solicitudes', solicitud, token);
    estados.push(r.status);
    confirmada = r.status === 200 || r.status === 201;
  }
  const ms = performance.now() - inicio;
  // Verificación: la solicitud existe una sola vez para ese cliente
  const mias = await llamar(n, 'GET', '/solicitudes', null, token);
  const copias = (mias.body.solicitudes ?? []).filter((s) => s.id === solicitud.id).length;
  const total = (mias.body.solicitudes ?? []).length;
  return { caso, exito: confirmada && copias === 1 && total === 1, copias, total, estados: estados.join(','), ms };
}

let pendiente = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (pendiente < TOTAL) await registrar(pendiente++);
}));

const resultados = [];
let siguiente = 0;
await Promise.all(Array.from({ length: EN_PARALELO }, async () => {
  while (siguiente < TOTAL) {
    const n = siguiente++;
    try {
      resultados.push(await sincronizar(n));
    } catch (err) {
      resultados.push({ caso: 'ABC'[n % 3], exito: false, motivo: err.message });
    }
  }
}));

const p = (lista, q) => { const o = [...lista].sort((a, b) => a - b); return o.length ? o[Math.min(o.length - 1, Math.floor(q * o.length))] : 0; };
const resumen = { fecha: new Date().toISOString(), total: TOTAL, exitosas: resultados.filter((r) => r.exito).length, duplicadas: resultados.filter((r) => (r.copias ?? 0) > 1 || (r.total ?? 0) > 1).length, por_caso: {} };
for (const caso of 'ABC') {
  const rs = resultados.filter((r) => r.caso === caso);
  const tiempos = rs.filter((r) => r.ms).map((r) => r.ms);
  resumen.por_caso[caso] = {
    cantidad: rs.length, exitosas: rs.filter((r) => r.exito).length,
    respuestas: Object.entries(rs.reduce((t, r) => { t[r.estados ?? r.motivo] = (t[r.estados ?? r.motivo] ?? 0) + 1; return t; }, {})).map(([e, c]) => `${e} ×${c}`).join(' · '),
    mediana_ms: Math.round(p(tiempos, 0.5)), p95_ms: Math.round(p(tiempos, 0.95)),
  };
}
resumen.tasa_exito = `${((resumen.exitosas / TOTAL) * 100).toFixed(2)} %`;
resumen.p95_ms = Math.round(p(resultados.filter((r) => r.ms).map((r) => r.ms), 0.95));
console.log(JSON.stringify(resumen, null, 1));
const salida = path.join(import.meta.dirname, 'resultados');
mkdirSync(salida, { recursive: true });
writeFileSync(path.join(salida, 'sincronizacion.json'), JSON.stringify({ resumen, fallidas: resultados.filter((r) => !r.exito).slice(0, 20) }, null, 1));

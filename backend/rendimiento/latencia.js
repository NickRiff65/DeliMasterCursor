// Mide la latencia de red desde este equipo (en Ñuble) hasta las regiones de nube candidatas para producción.
// Para cada región hace varias peticiones HTTPS sobre una misma conexión y descarta las primeras
// (que incluyen el saludo TLS): lo que queda es, en la práctica, el viaje de ida y vuelta.
//   node rendimiento/latencia.js
import { mkdirSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const DESTINOS = [
  ['Google Cloud · Santiago (southamerica-west1)', 'https://southamerica-west1-5tkroniexa-tl.a.run.app/api/ping'],
  ['Google Cloud · São Paulo (southamerica-east1)', 'https://southamerica-east1-5tkroniexa-rj.a.run.app/api/ping'],
  ['Google Cloud · Virginia (us-east4)', 'https://us-east4-5tkroniexa-uk.a.run.app/api/ping'],
  ['Google Cloud · Oregón (us-west1)', 'https://us-west1-5tkroniexa-uw.a.run.app/api/ping'],
  ['AWS · São Paulo (sa-east-1)', 'https://dynamodb.sa-east-1.amazonaws.com/ping'],
  ['AWS · Virginia (us-east-1)', 'https://dynamodb.us-east-1.amazonaws.com/ping'],
  ['AWS · Oregón (us-west-2)', 'https://dynamodb.us-west-2.amazonaws.com/ping'],
];
const MUESTRAS = 20;
const DESCARTAR = 3;

function pedir(url, agente) {
  return new Promise((resolver, rechazar) => {
    const inicio = performance.now();
    const req = https.get(url, { agent: agente, timeout: 8000 }, (res) => {
      res.resume();
      res.on('end', () => resolver(performance.now() - inicio));
    });
    req.on('timeout', () => req.destroy(new Error('sin respuesta')));
    req.on('error', rechazar);
  });
}

const filas = [];
for (const [nombre, url] of DESTINOS) {
  const agente = new https.Agent({ keepAlive: true, maxSockets: 1 });
  const tiempos = [];
  try {
    for (let i = 0; i < MUESTRAS + DESCARTAR; i++) {
      const ms = await pedir(url, agente);
      if (i >= DESCARTAR) tiempos.push(ms);
      await new Promise((r) => setTimeout(r, 150));
    }
    tiempos.sort((a, b) => a - b);
    filas.push({ destino: nombre, mediana_ms: Math.round(tiempos[Math.floor(tiempos.length / 2)]), minimo_ms: Math.round(tiempos[0]),
      p95_ms: Math.round(tiempos[Math.floor(tiempos.length * 0.95)]), muestras: tiempos.length });
  } catch (err) {
    filas.push({ destino: nombre, error: err.message });
  }
  agente.destroy();
}
console.table(filas);
const salida = path.join(import.meta.dirname, 'resultados');
mkdirSync(salida, { recursive: true });
writeFileSync(path.join(salida, 'latencia.json'), JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 1));

// CP-13 · Prueba de carga: 100 usuarios virtuales simultáneos durante 10 minutos.
// Criterio de aceptación: percentil 95 del tiempo de respuesta < 500 ms y menos de 1 % de errores.
//   npm run rendimiento -- carga
import { prepararDatos, recorrido, PUNTOS } from './escenario.js';

const USUARIOS = Number(__ENV.USUARIOS || 100);

export const options = {
  setupTimeout: '10m',
  scenarios: {
    carga: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.SUBIDA || '1m', target: USUARIOS },       // llegan de a poco
        { duration: __ENV.SOSTENIDA || '10m', target: USUARIOS },   // carga sostenida
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    // se informa el percentil 95 de cada punto de la API (el umbral global es el criterio de aceptación)
    ...Object.fromEntries(PUNTOS.map((p) => [`http_req_duration{punto:${p}}`, ['p(95)<2000']])),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  return prepararDatos(USUARIOS);
}

export default recorrido;

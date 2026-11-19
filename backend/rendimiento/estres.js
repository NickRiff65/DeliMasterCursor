// CP-14 · Prueba de estrés: se sube de 100 a 300 usuarios virtuales simultáneos para ver dónde se degrada
// el servicio, y luego se baja la carga para comprobar que se recupera solo y sin perder datos.
// No tiene umbral de aprobación por tiempo: lo que se busca es el punto de degradación.
//   npm run rendimiento -- estres
import { prepararDatos, recorrido, PUNTOS } from './escenario.js';

const USUARIOS = Number(__ENV.USUARIOS || 300);

export const options = {
  setupTimeout: '15m',
  scenarios: {
    estres: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '2m', target: 200 },
        { duration: '1m', target: 300 },
        { duration: '3m', target: 300 },
        { duration: '1m', target: 0 },           // recuperación
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Sin criterio de tiempo; estos umbrales solo sirven para que el resumen informe cada punto
    http_req_failed: ['rate<1'],
    ...Object.fromEntries(PUNTOS.map((p) => [`http_req_duration{punto:${p}}`, ['p(95)<60000']])),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  return prepararDatos(USUARIOS);
}

export default recorrido;

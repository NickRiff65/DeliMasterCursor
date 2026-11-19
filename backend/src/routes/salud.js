import { Router } from 'express';
import { pool } from '../db/pool.js';

export const rutasSalud = Router();

const ESPERA_BD_MS = 2000;
const conPlazo = (promesa, ms) => Promise.race([
  promesa,
  new Promise((_, rechazar) => { setTimeout(() => rechazar(new Error('sin respuesta')), ms).unref(); }),
]);

// Verifica que la API está arriba y que puede hablar con PostgreSQL (SELECT 1).
// La usan el monitoreo externo, la prueba de humo tras cada despliegue y el proveedor PaaS:
// 200 = todo operativo; 503 = la API responde pero la base de datos no (servicio degradado).
rutasSalud.get('/', async (_req, res) => {
  const inicio = Date.now();
  const base = { servicio: 'delimaster-api', fecha: new Date().toISOString() };
  try {
    await conPlazo(pool.query('SELECT 1'), ESPERA_BD_MS);
    res.json({ estado: 'ok', ...base, base_datos: 'ok', latencia_bd_ms: Date.now() - inicio });
  } catch {
    res.status(503).json({ estado: 'degradado', ...base, base_datos: 'sin conexión' });
  }
});

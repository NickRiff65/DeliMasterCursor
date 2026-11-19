// Cuenta los registros de las tablas principales de la base de pruebas de carga (antes y después del estrés)
import { pool } from '../src/db/pool.js';
const { rows: [c] } = await pool.query(`
  SELECT current_database() AS base,
         (SELECT count(*)::int FROM usuarios) AS usuarios,
         (SELECT count(*)::int FROM solicitudes) AS solicitudes,
         (SELECT count(*)::int FROM solicitud_eventos) AS eventos,
         (SELECT count(*)::int FROM solicitudes s WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = s.cliente_id)) AS solicitudes_huerfanas,
         (SELECT count(*)::int FROM (SELECT id FROM solicitudes GROUP BY id HAVING count(*) > 1) d) AS solicitudes_duplicadas`);
console.log(JSON.stringify(c));
await pool.end();

// Crea (o reactiva) una cuenta de administración para el Panel Web.
// Los administradores no se registran por la API: se crean con este script.
//
//   npm.cmd run crear-admin -- --email equipo@delimaster.cl --nombre "Equipo DeliMaster"
//
// La contraseña se pide por teclado (no queda en el historial de la terminal).
// En procesos automáticos se puede entregar en la variable de entorno ADMIN_PASSWORD.
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { pool } from './pool.js';

const { values } = parseArgs({ options: { email: { type: 'string' }, nombre: { type: 'string' } } });
const email = values.email?.trim().toLowerCase();
const nombre = values.nombre?.trim() || 'Equipo DeliMaster';

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: npm.cmd run crear-admin -- --email correo@dominio.cl --nombre "Nombre"');
  process.exit(1);
}

// Lee la contraseña sin mostrarla en pantalla
function preguntarOculto(texto) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(texto)) process.stdout.write(s); };
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); resolve(r); });
  });
}

const password = process.env.ADMIN_PASSWORD ?? await preguntarOculto('Contraseña (mínimo 10 caracteres): ');
if (password.length < 10) {
  console.error('La contraseña del administrador debe tener al menos 10 caracteres.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const { rows: [u] } = await pool.query(
  `INSERT INTO usuarios (rol, nombre, email, password_hash)
   VALUES ('admin', $1, $2, $3)
   ON CONFLICT ((lower(email))) DO UPDATE
     SET password_hash = EXCLUDED.password_hash, nombre = EXCLUDED.nombre, activo = true
     WHERE usuarios.rol = 'admin'
   RETURNING id, (xmax = 0) AS creado`,
  [nombre, email, hash]);

if (!u) {
  console.error(`Ya existe una cuenta de cliente o prestador con ${email}; usa otro correo para el administrador.`);
} else {
  console.log(u.creado ? `Administrador creado: ${email}` : `Contraseña actualizada para el administrador ${email}`);
}
await pool.end();

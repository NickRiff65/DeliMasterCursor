// Número de cuenta bancaria del maestro: se guarda cifrado en la base (AES-256-GCM, con una clave
// derivada del secreto del servidor), igual que el identificador de las tarjetas guardadas.
// Quien copie la base de datos sin el .env no puede leer las cuentas (Ley 21.719: datos personales
// protegidos en reposo). Solo se descifra para mostrársela a su dueño y al equipo que le transfiere.
import { cifrar, descifrar } from './cifrado.js';

const PROPOSITO = 'cuenta-bancaria';
const EN_CLARO = /^\d{4,20}$/;   // así se guardaban antes del cifrado

export const cifrarCuenta = (numero) => (numero == null ? null : cifrar(String(numero), PROPOSITO));

// Devuelve el número legible, o null si no hay o si no se puede descifrar (cambió el secreto del servidor):
// en ese caso el maestro debe volver a registrar su cuenta.
export function leerCuenta(valor) {
  if (valor == null) return null;
  if (EN_CLARO.test(valor)) return valor;
  try {
    return descifrar(valor, PROPOSITO);
  } catch {
    return null;
  }
}

// Cifra las cuentas que quedaron en texto plano (registros anteriores a este cambio). Se puede
// ejecutar las veces que sea: solo toca las que siguen en claro. Devuelve cuántas cifró.
export async function cifrarCuentasEnClaro(db) {
  const { rows } = await db.query(
    `SELECT usuario_id, numero_cuenta FROM prestadores WHERE numero_cuenta ~ '^[0-9]{4,20}$'`);
  for (const p of rows) {
    await db.query('UPDATE prestadores SET numero_cuenta = $2 WHERE usuario_id = $1 AND numero_cuenta = $3',
      [p.usuario_id, cifrarCuenta(p.numero_cuenta), p.numero_cuenta]);
  }
  return rows.length;
}

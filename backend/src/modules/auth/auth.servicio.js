import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { pool, enTransaccion } from '../../db/pool.js';
import { config } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { HORARIO_POR_DEFECTO } from '../prestadores/horario.js';
import { quitarTarjeta } from '../pagos/pagos.servicio.js';
import { registrarEventoSeguridad, ocultarCorreo } from '../../utils/seguridad.js';
import { enviarCorreo } from '../../utils/correo.js';

const COSTO_BCRYPT = 12;
// Hash de referencia: se compara contra él cuando el correo no existe, para que la respuesta
// tarde lo mismo y no revele qué correos están registrados.
const HASH_FICTICIO = bcrypt.hashSync('contraseña-ficticia-para-tiempos', COSTO_BCRYPT);

// Versión vigente de los Términos de uso y la Política de privacidad. Al publicar una nueva,
// las apps vuelven a pedir la aceptación a cada persona.
export const VERSION_TERMINOS = '1.4';

// Recuperación de contraseña: código de 6 dígitos, 15 minutos de vigencia y 5 intentos
const MINUTOS_CODIGO = 15;
const INTENTOS_CODIGO = 5;

// Datos que se pueden devolver al propio usuario. Nunca incluye password_hash.
const COLUMNAS_PUBLICAS = 'id, rol, nombre, nombres, apellidos, email, telefono, comuna, creado_en, terminos_version';

// Nombre y apellido por separado. Las cuentas anteriores a la migración 018 solo tienen el nombre completo:
// la primera palabra se toma como nombre y el resto como apellido.
function separarNombre(u) {
  if (u.nombres) return { nombres: u.nombres, apellidos: u.apellidos ?? '' };
  const [primero, ...resto] = (u.nombre ?? '').split(' ');
  return { nombres: primero, apellidos: resto.join(' ') };
}

const publico = (u) => ({ ...u, ...separarNombre(u), terminos_pendientes: u.terminos_version !== VERSION_TERMINOS });

export function firmarToken(usuario) {
  return jwt.sign({ rol: usuario.rol }, config.jwtSecret, {
    subject: usuario.id,
    // La sesión de administración dura menos (8 h por defecto) que la de las apps (7 días)
    expiresIn: usuario.rol === 'admin' ? config.jwtExpiraAdmin : config.jwtExpira,
    algorithm: 'HS256',
  });
}

export async function registrar({ rol, nombre, apellido, email, password, telefono, comuna, horario }) {
  const passwordHash = await bcrypt.hash(password, COSTO_BCRYPT);
  try {
    const usuario = await enTransaccion(async (db) => {
      // "nombre" guarda el nombre completo, que es el que se muestra en la app
      const { rows } = await db.query(
        `INSERT INTO usuarios (rol, nombre, nombres, apellidos, email, telefono, password_hash, comuna, terminos_version, terminos_aceptados_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         RETURNING ${COLUMNAS_PUBLICAS}`,
        [rol, `${nombre} ${apellido}`, nombre, apellido, email, telefono ?? null, passwordHash, comuna ?? null, VERSION_TERMINOS],
      );
      // Un prestador tiene además su ficha profesional (se completa después en su perfil).
      if (rol === 'prestador') {
        // Días y horario de atención: los que eligió o, si no, todos los días de 08:00 a medianoche
        const h = { ...HORARIO_POR_DEFECTO, ...horario };
        await db.query(
          `INSERT INTO prestadores (usuario_id, dias_atencion, hora_inicio, hora_fin) VALUES ($1, $2, $3, $4)`,
          [rows[0].id, h.dias, h.desde, h.hasta]);
      }
      return rows[0];
    });
    return { usuario: publico(usuario), token: firmarToken(usuario) };
  } catch (err) {
    if (err.code === '23505') { // violación de índice único: el correo ya existe
      throw new AppError('Ya existe una cuenta con ese correo', 409, 'EMAIL_REGISTRADO');
    }
    throw err;
  }
}

export async function iniciarSesion({ email, password }) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS_PUBLICAS}, password_hash, activo FROM usuarios WHERE lower(email) = $1`,
    [email],
  );
  const encontrado = rows[0];
  const coincide = await bcrypt.compare(password, encontrado?.password_hash ?? HASH_FICTICIO);

  // Mismo mensaje si el correo no existe o la contraseña es incorrecta (no revela cuentas).
  if (!encontrado || !coincide) {
    registrarEventoSeguridad('login_fallido', { email: ocultarCorreo(email), cuenta_existe: Boolean(encontrado) });
    throw new AppError('Correo o contraseña incorrectos', 401, 'CREDENCIALES_INVALIDAS');
  }
  if (!encontrado.activo) {
    registrarEventoSeguridad('login_cuenta_desactivada', { usuario: encontrado.id });
    throw new AppError('Esta cuenta está desactivada', 403, 'CUENTA_DESACTIVADA');
  }
  const { password_hash: _h, activo: _a, ...usuario } = encontrado;
  return { usuario: publico(usuario), token: firmarToken(usuario) };
}

export async function obtenerPerfil(id) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1 AND activo`,
    [id],
  );
  if (!rows[0]) throw new AppError('La cuenta no existe o fue desactivada', 401, 'SESION_INVALIDA');
  return publico(rows[0]);
}

// ------------------------------------------------------------------ términos y perfil
export async function aceptarTerminos(id, { version }) {
  if (version !== VERSION_TERMINOS) {
    throw new AppError('Hay una versión más reciente de los términos; vuelve a abrirlos', 409, 'TERMINOS_DESACTUALIZADOS');
  }
  await pool.query(
    'UPDATE usuarios SET terminos_version = $2, terminos_aceptados_en = now() WHERE id = $1', [id, version]);
  return obtenerPerfil(id);
}

// Nombre, apellido, celular y comuna (el correo identifica la cuenta y no se cambia aquí)
export async function actualizarPerfil(id, datos) {
  const cambios = { ...datos };
  if ('nombre' in datos || 'apellido' in datos) {
    // Se completa la parte que no cambió y se vuelve a armar el nombre completo
    const { rows: [u] } = await pool.query('SELECT nombre, nombres, apellidos FROM usuarios WHERE id = $1', [id]);
    const actual = separarNombre(u);
    const nombres = datos.nombre ?? actual.nombres;
    const apellidos = datos.apellido ?? actual.apellidos;
    if (!apellidos) {
      const err = new AppError('Ingresa tu apellido', 422, 'DATOS_INVALIDOS');
      err.campos = { apellido: 'Ingresa tu apellido' };
      throw err;
    }
    Object.assign(cambios, { nombre: `${nombres} ${apellidos}`, nombres, apellidos });
    delete cambios.apellido;
  }
  const campos = [];
  const valores = [id];
  for (const columna of ['nombre', 'nombres', 'apellidos', 'telefono', 'comuna']) {
    if (columna in cambios) {
      valores.push(cambios[columna]);
      campos.push(`${columna} = $${valores.length}`);
    }
  }
  await pool.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = $1`, valores);
  return obtenerPerfil(id);
}

// ------------------------------------------------------------------ contraseña
// Guarda la nueva contraseña y cierra todas las sesiones anteriores (los tokens emitidos antes
// dejan de valer). Devuelve un token nuevo para que quien la cambió siga con su sesión.
async function guardarPassword(db, id, nueva) {
  const hash = await bcrypt.hash(nueva, COSTO_BCRYPT);
  const { rows } = await db.query(
    `UPDATE usuarios SET password_hash = $2, sesiones_desde = date_trunc('second', now())
      WHERE id = $1 RETURNING ${COLUMNAS_PUBLICAS}`, [id, hash]);
  return { usuario: publico(rows[0]), token: firmarToken(rows[0]) };
}

export async function cambiarPassword(id, { actual, nueva }) {
  const { rows } = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [id]);
  if (!rows[0] || !(await bcrypt.compare(actual, rows[0].password_hash))) {
    registrarEventoSeguridad('cambio_password_fallido', { usuario: id });
    const err = new AppError('La contraseña actual no es correcta', 422, 'DATOS_INVALIDOS');
    err.campos = { actual: 'La contraseña actual no es correcta' };
    throw err;
  }
  const resultado = await guardarPassword(pool, id, nueva);
  registrarEventoSeguridad('password_cambiada', { usuario: id });
  return resultado;
}

const hashCodigo = (usuarioId, codigo) => createHash('sha256').update(`${usuarioId}:${codigo}`).digest('hex');

// Paso 1: se envía un código al correo. La respuesta es siempre la misma, exista o no la cuenta.
export async function solicitarRecuperacion({ email }) {
  const { rows } = await pool.query('SELECT id, nombre FROM usuarios WHERE lower(email) = $1 AND activo', [email]);
  const usuario = rows[0];
  registrarEventoSeguridad('recuperacion_solicitada', { email: ocultarCorreo(email), cuenta_existe: Boolean(usuario) });
  if (!usuario) return;

  // Un código nuevo anula los anteriores
  await pool.query('UPDATE codigos_recuperacion SET usado_en = now() WHERE usuario_id = $1 AND usado_en IS NULL', [usuario.id]);
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await pool.query(
    `INSERT INTO codigos_recuperacion (usuario_id, codigo_hash, expira_en)
     VALUES ($1, $2, now() + make_interval(mins => $3))`, [usuario.id, hashCodigo(usuario.id, codigo), MINUTOS_CODIGO]);
  try {
    await enviarCorreo({
      para: email,
      asunto: `Tu código de DeliMaster: ${codigo}`,
      texto: `Hola ${usuario.nombre.split(' ')[0]}:\n\nTu código para crear una nueva contraseña es ${codigo}.\n`
        + `Vence en ${MINUTOS_CODIGO} minutos y solo se puede usar una vez.\n\n`
        + 'Si no lo pediste, ignora este correo: tu contraseña no cambia.\n\nEquipo DeliMaster',
    });
  } catch (err) {
    registrarEventoSeguridad('correo_no_enviado', { usuario: usuario.id, error: err.message });
  }
}

// Paso 2: con el código y la nueva contraseña se recupera la cuenta (y se inicia sesión)
export async function restablecerPassword({ email, codigo, nueva }) {
  const invalido = () => new AppError('El código no es válido o ya venció. Pide uno nuevo.', 400, 'CODIGO_INVALIDO');
  const { rows: [usuario] } = await pool.query('SELECT id FROM usuarios WHERE lower(email) = $1 AND activo', [email]);
  if (!usuario) throw invalido();
  const { rows: [registro] } = await pool.query(
    `SELECT id, codigo_hash, intentos FROM codigos_recuperacion
      WHERE usuario_id = $1 AND usado_en IS NULL AND expira_en > now()
      ORDER BY creado_en DESC LIMIT 1`, [usuario.id]);
  if (!registro) throw invalido();

  const esperado = Buffer.from(registro.codigo_hash);
  const recibido = Buffer.from(hashCodigo(usuario.id, codigo));
  if (!timingSafeEqual(esperado, recibido)) {
    // Cada intento fallido cuenta; al quinto, el código queda anulado
    await pool.query(
      `UPDATE codigos_recuperacion SET intentos = intentos + 1,
              usado_en = CASE WHEN intentos + 1 >= $2 THEN now() ELSE usado_en END
        WHERE id = $1`, [registro.id, INTENTOS_CODIGO]);
    registrarEventoSeguridad('codigo_recuperacion_incorrecto', { usuario: usuario.id, intento: registro.intentos + 1 });
    throw invalido();
  }

  return enTransaccion(async (db) => {
    // Marcar como usado y cambiar la contraseña en la misma transacción: el código sirve una sola vez
    const { rowCount } = await db.query(
      'UPDATE codigos_recuperacion SET usado_en = now() WHERE id = $1 AND usado_en IS NULL', [registro.id]);
    if (!rowCount) throw invalido();
    const resultado = await guardarPassword(db, usuario.id, nueva);
    registrarEventoSeguridad('password_restablecida', { usuario: usuario.id });
    return resultado;
  });
}

// ------------------------------------------------------------------ eliminar la cuenta
// Ley N.º 21.719 (derecho de supresión): la persona elimina su cuenta desde la app. Se borran sus datos
// personales y la cuenta queda cerrada; los registros de pagos, el libro contable, los mensajes y las
// fotos de los trabajos se conservan sin su nombre (obligaciones contables y respaldo de reclamos).
const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;

// Lo que impide eliminar la cuenta ahora (null si se puede)
async function pendientesDe(usuario) {
  const campo = usuario.rol === 'prestador' ? 'prestador_id' : 'cliente_id';
  const { rows: [s] } = await pool.query(
    `SELECT count(*)::int AS n FROM solicitudes WHERE ${campo} = $1 AND estado NOT IN ('cerrada', 'cancelada')`, [usuario.id]);
  if (s.n === 1) return 'Tienes una solicitud en curso. Ciérrala o cancélala antes de eliminar tu cuenta.';
  if (s.n > 1) return `Tienes ${s.n} solicitudes en curso. Ciérralas o cancélalas antes de eliminar tu cuenta.`;
  if (usuario.rol === 'prestador') {
    const { rows: [m] } = await pool.query(
      `SELECT COALESCE(sum(monto_neto), 0)::int AS monto FROM ledger_movimientos
        WHERE prestador_id = $1 AND estado IN ('retenido', 'liberado')`, [usuario.id]);
    if (m.monto) return `Tienes ${pesos(m.monto)} por recibir. Podrás eliminar tu cuenta cuando el equipo te los transfiera.`;
  }
  return null;
}

export async function puedeEliminar(usuario) {
  if (usuario.rol === 'admin') return { puede_eliminar: false, motivo: 'Las cuentas de administración no se eliminan desde aquí.' };
  const motivo = await pendientesDe(usuario);
  return { puede_eliminar: !motivo, motivo };
}

export async function eliminarCuenta(usuario, { password }) {
  const { rows: [u] } = await pool.query('SELECT rol, password_hash FROM usuarios WHERE id = $1', [usuario.id]);
  if (u.rol === 'admin') throw new AppError('Las cuentas de administración no se eliminan desde aquí', 422, 'ACCION_NO_PERMITIDA');
  if (!(await bcrypt.compare(password, u.password_hash))) {
    registrarEventoSeguridad('eliminacion_cuenta_fallida', { usuario: usuario.id });
    const err = new AppError('La contraseña no es correcta', 422, 'DATOS_INVALIDOS');
    err.campos = { password: 'La contraseña no es correcta' };
    throw err;
  }
  const pendiente = await pendientesDe(usuario);
  if (pendiente) throw new AppError(pendiente, 409, 'CUENTA_CON_PENDIENTES');

  // Nadie podrá volver a entrar: la contraseña se reemplaza por una al azar que nadie conoce
  const inservible = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  await enTransaccion(async (db) => {
    await db.query(
      `UPDATE usuarios SET nombre = 'Cuenta eliminada', nombres = NULL, apellidos = NULL, email = $2, telefono = NULL,
              comuna = NULL, password_hash = $3,
              activo = false, desactivado_motivo = 'Eliminada por su titular', desactivado_por = NULL,
              desactivado_en = now(), eliminada_en = now(), sesiones_desde = now()
        WHERE id = $1`,
      // El correo queda libre: la persona puede crear una cuenta nueva más adelante si quiere
      [usuario.id, `eliminada-${usuario.id}@cuentas.delimaster.invalid`, inservible]);
    await db.query('DELETE FROM codigos_recuperacion WHERE usuario_id = $1', [usuario.id]);
    await db.query('DELETE FROM inscripciones WHERE usuario_id = $1', [usuario.id]);
    if (u.rol === 'prestador') {
      // Sale del catálogo y se borran su ficha y sus datos bancarios
      await db.query(
        `UPDATE prestadores SET descripcion = NULL, comunas_atendidas = '{}', disponible = false,
                rut = NULL, banco = NULL, tipo_cuenta = NULL, numero_cuenta = NULL
          WHERE usuario_id = $1`, [usuario.id]);
      await db.query('DELETE FROM prestador_categorias WHERE prestador_id = $1', [usuario.id]);
    }
  });
  await quitarTarjeta(usuario);   // la tarjeta guardada se elimina también en Transbank
  registrarEventoSeguridad('cuenta_eliminada', { usuario: usuario.id, rol: u.rol });
  return { eliminada: true };
}

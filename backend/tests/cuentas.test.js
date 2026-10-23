import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase } from './helpers/db.js';
import { VERSION_TERMINOS } from '../src/modules/auth/auth.servicio.js';

describe('Cuentas · términos, perfil y contraseña', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarTransporteCorreo;
  const correos = [];
  let ana;   // { id, token }

  before(async () => {
    pool = await prepararBase();
    ({ usarTransporteCorreo } = await import('../src/utils/correo.js'));
    usarTransporteCorreo(async (m) => { correos.push(m); });
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => { usarTransporteCorreo(null); await pool.end(); });

  const DATOS = { rol: 'cliente', nombre: 'Ana', apellido: 'Pérez', email: 'ana@test.cl', password: 'clave1234', comuna: 'Chillán' };
  const como = (token) => (req) => req.set('Authorization', `Bearer ${token}`);
  const login = (password) => request(app).post('/api/auth/login').send({ email: 'ana@test.cl', password });
  const codigoDelCorreo = () => correos.at(-1).texto.match(/\b(\d{6})\b/)[1];

  beforeEach(async () => {
    await limpiarBase(pool);
    correos.length = 0;
    const { body } = await request(app).post('/api/auth/registro').send({ ...DATOS, acepta_terminos: true });
    ana = { id: body.usuario.id, token: body.token };
  });

  // ------------------------------------------------------------------ términos
  test('el registro exige aceptar los términos y deja constancia de la versión', async () => {
    const sin = await request(app).post('/api/auth/registro').send({ ...DATOS, email: 'otra@test.cl' });
    assert.equal(sin.status, 422);
    assert.ok(sin.body.error.campos.acepta_terminos);
    const falso = await request(app).post('/api/auth/registro').send({ ...DATOS, email: 'otra@test.cl', acepta_terminos: false });
    assert.equal(falso.status, 422);

    const { rows: [u] } = await pool.query('SELECT terminos_version, terminos_aceptados_en FROM usuarios WHERE id = $1', [ana.id]);
    assert.equal(u.terminos_version, VERSION_TERMINOS);
    assert.ok(u.terminos_aceptados_en);
    const yo = await como(ana.token)(request(app).get('/api/auth/yo'));
    assert.equal(yo.body.usuario.terminos_pendientes, false);
  });

  test('quien no ha aceptado la versión vigente debe aceptarla', async () => {
    await pool.query('UPDATE usuarios SET terminos_version = NULL WHERE id = $1', [ana.id]);
    assert.equal((await login('clave1234')).body.usuario.terminos_pendientes, true);

    const vieja = await como(ana.token)(request(app).post('/api/auth/terminos')).send({ version: '0.9' });
    assert.equal(vieja.status, 409);
    const res = await como(ana.token)(request(app).post('/api/auth/terminos')).send({ version: VERSION_TERMINOS });
    assert.equal(res.status, 200);
    assert.equal(res.body.usuario.terminos_pendientes, false);
  });

  // ------------------------------------------------------------------ perfil
  test('cada persona edita su nombre, celular y comuna', async () => {
    const res = await como(ana.token)(request(app).put('/api/auth/yo'))
      .send({ nombre: 'Ana María', telefono: '9 8765 4321', comuna: 'coihueco' });
    assert.equal(res.status, 200);
    assert.equal(res.body.usuario.nombre, 'Ana María Pérez');   // el apellido que ya tenía se conserva
    assert.deepEqual([res.body.usuario.nombres, res.body.usuario.apellidos], ['Ana María', 'Pérez']);
    const apellido = await como(ana.token)(request(app).put('/api/auth/yo')).send({ apellido: 'Pérez Soto' });
    assert.equal(apellido.body.usuario.nombre, 'Ana María Pérez Soto');
    assert.equal(res.body.usuario.telefono, '987654321');
    assert.equal(res.body.usuario.comuna, 'Coihueco');
    assert.equal(res.body.usuario.email, 'ana@test.cl');

    // Vacío quita el celular; el correo y el rol no se pueden cambiar por aquí
    const quitar = await como(ana.token)(request(app).put('/api/auth/yo')).send({ telefono: '', email: 'x@test.cl', rol: 'admin' });
    assert.equal(quitar.body.usuario.telefono, null);
    assert.equal(quitar.body.usuario.email, 'ana@test.cl');
    assert.equal(quitar.body.usuario.nombre, 'Ana María Pérez Soto');
    assert.equal(quitar.body.usuario.rol, 'cliente');

    assert.equal((await como(ana.token)(request(app).put('/api/auth/yo')).send({ comuna: 'Santiago' })).status, 422);
    assert.equal((await como(ana.token)(request(app).put('/api/auth/yo')).send({ comuna: 'Chillán Viejo' })).status, 422);
    assert.equal((await como(ana.token)(request(app).put('/api/auth/yo')).send({})).status, 422);
    assert.equal((await request(app).put('/api/auth/yo').send({ nombre: 'Sin sesión' })).status, 401);
  });

  // ------------------------------------------------------------------ cambiar contraseña
  test('cambiar la contraseña exige la actual y cierra las demás sesiones', async () => {
    const mala = await como(ana.token)(request(app).put('/api/auth/password')).send({ actual: 'otraClave1', nueva: 'nuevaClave2' });
    assert.equal(mala.status, 422);
    assert.ok(mala.body.error.campos.actual);
    const igual = await como(ana.token)(request(app).put('/api/auth/password')).send({ actual: 'clave1234', nueva: 'clave1234' });
    assert.equal(igual.status, 422);

    // El token anterior debe ser de un segundo previo al cambio para que se note la diferencia
    await new Promise((r) => setTimeout(r, 1100));
    const res = await como(ana.token)(request(app).put('/api/auth/password')).send({ actual: 'clave1234', nueva: 'nuevaClave2' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);

    const vieja = await como(ana.token)(request(app).get('/api/auth/yo'));
    assert.equal(vieja.status, 401);
    assert.equal(vieja.body.error.codigo, 'SESION_EXPIRADA');
    assert.equal((await como(res.body.token)(request(app).get('/api/auth/yo'))).status, 200);
    assert.equal((await login('clave1234')).status, 401);
    assert.equal((await login('nuevaClave2')).status, 200);
  });

  // ------------------------------------------------------------------ recuperar contraseña
  test('recuperar: la respuesta no revela si el correo existe', async () => {
    const existe = await request(app).post('/api/auth/recuperar').send({ email: 'ana@test.cl' });
    const noExiste = await request(app).post('/api/auth/recuperar').send({ email: 'nadie@test.cl' });
    assert.equal(existe.status, 200);
    assert.deepEqual(existe.body, noExiste.body);
    assert.equal(correos.length, 1);              // solo se envió a la cuenta real
    assert.equal(correos[0].para, 'ana@test.cl');
    assert.match(correos[0].texto, /\b\d{6}\b/);
    // En la base solo queda el hash del código
    const { rows: [c] } = await pool.query('SELECT codigo_hash FROM codigos_recuperacion WHERE usuario_id = $1', [ana.id]);
    assert.doesNotMatch(c.codigo_hash, new RegExp(codigoDelCorreo()));
  });

  test('recuperar: con el código se crea una nueva contraseña, una sola vez', async () => {
    await new Promise((r) => setTimeout(r, 1100));
    await request(app).post('/api/auth/recuperar').send({ email: 'ana@test.cl' });
    const codigo = codigoDelCorreo();
    const res = await request(app).post('/api/auth/restablecer').send({ email: 'ana@test.cl', codigo, nueva: 'recuperada9' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal((await login('recuperada9')).status, 200);
    assert.equal((await como(ana.token)(request(app).get('/api/auth/yo'))).status, 401);   // sesiones anteriores cerradas

    const otraVez = await request(app).post('/api/auth/restablecer').send({ email: 'ana@test.cl', codigo, nueva: 'otraMas123' });
    assert.equal(otraVez.status, 400);
    assert.equal(otraVez.body.error.codigo, 'CODIGO_INVALIDO');
  });

  test('recuperar: tras 5 códigos incorrectos se anula, y un código nuevo reemplaza al anterior', async () => {
    await request(app).post('/api/auth/recuperar').send({ email: 'ana@test.cl' });
    const codigo = codigoDelCorreo();
    const otro = codigo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      assert.equal((await request(app).post('/api/auth/restablecer').send({ email: 'ana@test.cl', codigo: otro, nueva: 'intento123' })).status, 400);
    }
    const tarde = await request(app).post('/api/auth/restablecer').send({ email: 'ana@test.cl', codigo, nueva: 'intento123' });
    assert.equal(tarde.status, 400);   // ni el correcto sirve ya

    await request(app).post('/api/auth/recuperar').send({ email: 'ana@test.cl' });
    const primero = codigoDelCorreo();
    await request(app).post('/api/auth/recuperar').send({ email: 'ana@test.cl' });
    const segundo = codigoDelCorreo();
    if (primero !== segundo) {
      assert.equal((await request(app).post('/api/auth/restablecer').send({ email: 'ana@test.cl', codigo: primero, nueva: 'intento123' })).status, 400);
    }
    assert.equal((await request(app).post('/api/auth/restablecer').send({ email: 'ana@test.cl', codigo: segundo, nueva: 'intento123' })).status, 200);
  });

  test('recuperar: un código vencido no sirve', async () => {
    await request(app).post('/api/auth/recuperar').send({ email: 'ana@test.cl' });
    await pool.query("UPDATE codigos_recuperacion SET expira_en = now() - interval '1 minute'");
    const res = await request(app).post('/api/auth/restablecer').send({ email: 'ana@test.cl', codigo: codigoDelCorreo(), nueva: 'vencida123' });
    assert.equal(res.status, 400);
    const formato = await request(app).post('/api/auth/restablecer').send({ email: 'ana@test.cl', codigo: '12ab', nueva: 'vencida123' });
    assert.equal(formato.status, 422);
  });
});

import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase } from './helpers/db.js';

describe('HU-10 · Registro e inicio de sesión', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app;
  let pool;

  const cliente = {
    rol: 'cliente',
    nombre: 'Ana',
    apellido: 'Pérez',
    email: 'Ana.Perez@Correo.cl',
    password: 'clave1234', acepta_terminos: true,
    telefono: '9 1234 5678',
    comuna: 'Chillán',
  };

  before(async () => {
    pool = await prepararBase();
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  beforeEach(() => limpiarBase(pool));
  after(() => pool.end());

  test('registra un cliente y devuelve token sin exponer la contraseña', async () => {
    const res = await request(app).post('/api/auth/registro').send(cliente);
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.usuario.email, 'ana.perez@correo.cl'); // normalizado
    assert.equal(res.body.usuario.telefono, '912345678');
    assert.equal(res.body.usuario.password_hash, undefined);
    // Nombre y apellido por separado; "nombre" es el nombre completo que se muestra
    assert.deepEqual([res.body.usuario.nombre, res.body.usuario.nombres, res.body.usuario.apellidos], ['Ana Pérez', 'Ana', 'Pérez']);

    const { rows } = await pool.query('SELECT password_hash FROM usuarios');
    assert.notEqual(rows[0].password_hash, cliente.password);
    assert.match(rows[0].password_hash, /^\$2[aby]\$12\$/); // Bcrypt con costo 12
  });

  test('el apellido es obligatorio y va en su propio campo', async () => {
    const { apellido: _a, ...sinApellido } = cliente;
    const res = await request(app).post('/api/auth/registro').send({ ...sinApellido, nombre: 'Ana Pérez' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.campos.apellido, 'Ingresa tu apellido');
    const corto = await request(app).post('/api/auth/registro').send({ ...cliente, apellido: ' ' });
    assert.equal(corto.status, 422);
  });

  test('registrar un prestador crea también su ficha profesional', async () => {
    const res = await request(app).post('/api/auth/registro')
      .send({ ...cliente, rol: 'prestador', email: 'maestro@correo.cl' });
    assert.equal(res.status, 201);
    const { rowCount } = await pool.query('SELECT 1 FROM prestadores WHERE usuario_id = $1', [res.body.usuario.id]);
    assert.equal(rowCount, 1);
  });

  test('no permite registrarse como administrador', async () => {
    const res = await request(app).post('/api/auth/registro').send({ ...cliente, rol: 'admin' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.campos.rol);
  });

  test('rechaza un correo ya registrado, aunque cambien mayúsculas', async () => {
    await request(app).post('/api/auth/registro').send(cliente);
    const res = await request(app).post('/api/auth/registro')
      .send({ ...cliente, email: 'ANA.PEREZ@correo.cl' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'EMAIL_REGISTRADO');
  });

  test('exige contraseña con letras y números', async () => {
    const res = await request(app).post('/api/auth/registro').send({ ...cliente, password: '12345678' });
    assert.equal(res.status, 422);
    assert.match(res.body.error.campos.password, /letra/);
  });

  test('inicia sesión con credenciales correctas', async () => {
    await request(app).post('/api/auth/registro').send(cliente);
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'ana.perez@correo.cl', password: 'clave1234', acepta_terminos: true });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test('responde lo mismo si el correo no existe o la contraseña es incorrecta', async () => {
    await request(app).post('/api/auth/registro').send(cliente);
    const malaClave = await request(app).post('/api/auth/login')
      .send({ email: cliente.email, password: 'otraClave99' });
    const sinCuenta = await request(app).post('/api/auth/login')
      .send({ email: 'nadie@correo.cl', password: 'otraClave99' });
    assert.equal(malaClave.status, 401);
    assert.deepEqual(malaClave.body, sinCuenta.body);
  });

  test('GET /api/auth/yo devuelve el perfil con un token válido', async () => {
    const { body } = await request(app).post('/api/auth/registro').send(cliente);
    const res = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${body.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.usuario.id, body.usuario.id);
  });

  test('GET /api/auth/yo rechaza peticiones sin token o con token alterado', async () => {
    const sinToken = await request(app).get('/api/auth/yo');
    assert.equal(sinToken.status, 401);
    const alterado = await request(app).get('/api/auth/yo').set('Authorization', 'Bearer abc.def.ghi');
    assert.equal(alterado.status, 401);
    assert.equal(alterado.body.error.codigo, 'SESION_INVALIDA');
  });
});

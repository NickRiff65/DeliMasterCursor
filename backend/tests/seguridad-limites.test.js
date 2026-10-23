// OWASP API4 (consumo de recursos) y API2 (fuerza bruta): los límites de uso se activan
// solo en este archivo (cada archivo de pruebas corre en su propio proceso).
process.env.PROBAR_LIMITES = '1';

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase } from './helpers/db.js';

describe('Seguridad · límites de uso', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool;
  let cliente, prestador, solicitudId;

  before(async () => {
    pool = await prepararBase();
    await limpiarBase(pool);
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
    const registrar = async (rol, email) => {
      const { body } = await request(app).post('/api/auth/registro')
        .send({ rol, nombre: 'Usuario', apellido: 'Prueba', email, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
      return { id: body.usuario.id, token: body.token };
    };
    cliente = await registrar('cliente', 'limite.cliente@test.cl');
    prestador = await registrar('prestador', 'limite.prestador@test.cl');
    await request(app).put('/api/prestadores/yo').set('Authorization', `Bearer ${prestador.token}`)
      .send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    solicitudId = randomUUID();
    const como = (req) => req.set('Authorization', `Bearer ${cliente.token}`);
    await como(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto' });
    await como(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
  });
  after(() => pool.end());

  test('API2 · tras 5 contraseñas incorrectas la cuenta se bloquea 15 minutos, aunque cambie la IP', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'limite.cliente@test.cl', password: `mala${i}xx1` });
      assert.equal(res.status, 401);
    }
    const bloqueada = await request(app).post('/api/auth/login').send({ email: 'limite.cliente@test.cl', password: 'clave1234', acepta_terminos: true });
    assert.equal(bloqueada.status, 429);   // ni siquiera con la contraseña correcta
    assert.equal(bloqueada.body.error.codigo, 'DEMASIADOS_INTENTOS');
    // Otras cuentas no se ven afectadas
    const otra = await request(app).post('/api/auth/login').send({ email: 'limite.prestador@test.cl', password: 'clave1234', acepta_terminos: true });
    assert.equal(otra.status, 200);
  });

  test('API4 · un usuario no puede inundar el chat (30 mensajes por minuto)', async () => {
    const enviar = () => request(app).post(`/api/solicitudes/${solicitudId}/mensajes`)
      .set('Authorization', `Bearer ${cliente.token}`).send({ contenido: 'hola' });
    for (let i = 0; i < 30; i++) assert.equal((await enviar()).status, 201);
    const res = await enviar();
    assert.equal(res.status, 429);
    assert.ok(res.headers['ratelimit-policy'] || res.headers.ratelimit);
  });
});

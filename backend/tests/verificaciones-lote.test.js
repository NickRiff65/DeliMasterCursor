import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase } from './helpers/db.js';

// Revisión en lote: cada decisión se aplica con las mismas reglas que la individual, y un fallo no detiene a las demás
describe('Revisión en lote de verificaciones', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app;
  let pool;
  let firmarToken;
  let admin;
  let n = 0;

  before(async () => {
    pool = await prepararBase();
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  beforeEach(async () => {
    await limpiarBase(pool);
    const { rows } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Admin', 'admin-lote@test.cl', 'x') RETURNING id, rol");
    admin = { id: rows[0].id, token: firmarToken(rows[0]) };
  });

  // Fecha AAAA-MM-DD a n días de hoy (vencimiento del certificado SEC)
  const enDias = (d) => { const f = new Date(); f.setDate(f.getDate() + d); return f.toLocaleDateString('sv-SE'); };

  // Un maestro con una solicitud SEC pendiente; devuelve el id de la verificación
  async function prestadorConVerificacion(nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro').send({
      rol: 'prestador', nombre, apellido: 'Prueba', email: `lote${n}@test.cl`, password: 'clave1234', acepta_terminos: true,
    });
    const token = body.token;
    await request(app).put('/api/prestadores/yo').set('Authorization', `Bearer ${token}`).send({ comunas_atendidas: ['Chillán'] });
    const sol = await request(app).post('/api/prestadores/yo/verificaciones').set('Authorization', `Bearer ${token}`)
      .send({ categoria: 'electricidad', numero_registro: `SEC-${20000 + n}`, codigo_certificado: `QR-${8000 + n}-2211` });
    assert.equal(sol.status, 201, JSON.stringify(sol.body));
    return sol.body.verificacion.id;
  }

  const lote = (decisiones) => request(app).post('/api/admin/verificaciones/lote')
    .set('Authorization', `Bearer ${admin.token}`).send({ decisiones });

  test('cada decisión se aplica por separado: una sin fecha SEC no impide a las demás', async () => {
    const a = await prestadorConVerificacion('Ana');
    const b = await prestadorConVerificacion('Beto');
    const c = await prestadorConVerificacion('Carla');
    const res = await lote([
      { id: a, decision: 'aprobada', vence_en: enDias(80) },
      { id: b, decision: 'aprobada' },   // la SEC exige la fecha del certificado: esta no se aprueba
      { id: c, decision: 'rechazada', observacion: 'El código no aparece en el sitio de la SEC' },
    ]);
    assert.equal(res.status, 200);
    assert.equal(res.body.aplicadas, 2);
    const porId = Object.fromEntries(res.body.resultados.map((r) => [r.id, r]));
    assert.equal(porId[a].ok, true);
    assert.equal(porId[b].ok, false);
    assert.equal(porId[b].codigo, 'DATOS_INVALIDOS');
    assert.equal(porId[c].ok, true);

    const { rows } = await pool.query('SELECT id, estado FROM verificaciones WHERE id = ANY($1::uuid[])', [[a, b, c]]);
    const estado = Object.fromEntries(rows.map((r) => [r.id, r.estado]));
    assert.deepEqual([estado[a], estado[b], estado[c]], ['aprobada', 'pendiente', 'rechazada']);
  });

  test('un lote solo lo puede usar un administrador', async () => {
    const id = await prestadorConVerificacion('Dani');
    const { body } = await request(app).post('/api/auth/registro').send({
      rol: 'prestador', nombre: 'Otro', apellido: 'Prueba', email: 'lote-otro@test.cl', password: 'clave1234', acepta_terminos: true,
    });
    const res = await request(app).post('/api/admin/verificaciones/lote')
      .set('Authorization', `Bearer ${body.token}`).send({ decisiones: [{ id, decision: 'aprobada', vence_en: enDias(80) }] });
    assert.equal(res.status, 403);
  });

  test('una misma verificación repetida en el lote se resuelve una vez; la otra queda como ya resuelta', async () => {
    const id = await prestadorConVerificacion('Eva');
    const res = await lote([
      { id, decision: 'aprobada', vence_en: enDias(80) },
      { id, decision: 'aprobada', vence_en: enDias(80) },
    ]);
    assert.equal(res.body.aplicadas, 1);
    assert.equal(res.body.resultados[0].ok, true);
    assert.equal(res.body.resultados[1].ok, false);
    assert.equal(res.body.resultados[1].codigo, 'YA_RESUELTA');
  });

  test('un identificador que no existe o no es válido se informa en su resultado', async () => {
    const res = await lote([
      { id: 'no-es-un-id', decision: 'aprobada', vence_en: enDias(80) },
      { id: randomUUID(), decision: 'aprobada', vence_en: enDias(80) },
    ]);
    assert.equal(res.status, 200);
    assert.equal(res.body.aplicadas, 0);
    assert.equal(res.body.resultados[0].codigo, 'VERIFICACION_NO_ENCONTRADA');
    assert.equal(res.body.resultados[1].codigo, 'VERIFICACION_NO_ENCONTRADA');
  });

  test('el lote acepta como máximo 50 verificaciones y al menos una', async () => {
    const demasiadas = Array.from({ length: 51 }, () => ({ id: randomUUID(), decision: 'rechazada', observacion: 'Prueba de límite' }));
    assert.equal((await lote(demasiadas)).status, 422);
    assert.equal((await lote([])).status, 422);
  });
});

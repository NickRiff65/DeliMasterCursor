import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase } from './helpers/db.js';

describe('HU-11 · Verificación de prestadores', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app;
  let pool;
  let firmarToken;
  let prestador;   // { id, token }
  let admin;       // { id, token }

  before(async () => {
    pool = await prepararBase();
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  beforeEach(async () => {
    await limpiarBase(pool);
    const { body } = await request(app).post('/api/auth/registro').send({
      rol: 'prestador', nombre: 'Juan', apellido: 'Soto', email: 'juan@test.cl', password: 'clave1234', acepta_terminos: true,
    });
    prestador = { id: body.usuario.id, token: body.token };
    await request(app).put('/api/prestadores/yo').set('Authorization', `Bearer ${prestador.token}`)
      .send({ comunas_atendidas: ['Chillán'] });

    // Los administradores no se registran por la API; se crean directamente.
    const { rows } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Admin', 'admin@test.cl', 'x') RETURNING id, rol");
    admin = { id: rows[0].id, token: firmarToken(rows[0]) };
  });

  const comoPrestador = (req) => req.set('Authorization', `Bearer ${prestador.token}`);
  const comoAdmin = (req) => req.set('Authorization', `Bearer ${admin.token}`);
  // Fecha AAAA-MM-DD a n días de hoy (vencimiento del certificado SEC)
  const enDias = (n) => { const f = new Date(); f.setDate(f.getDate() + n); return f.toLocaleDateString('sv-SE'); };
  const APROBAR = () => ({ decision: 'aprobada', vence_en: enDias(80) });
  const solicitar = (datos = { categoria: 'electricidad', numero_registro: 'SEC-12345', codigo_certificado: 'QR-8899-2211' }) =>
    comoPrestador(request(app).post('/api/prestadores/yo/verificaciones')).send(datos);
  const enCatalogo = async () =>
    (await request(app).get('/api/prestadores?categoria=electricidad')).body.prestadores.map((p) => p.id);

  test('el prestador recibe un aviso cuando aprueban o rechazan su solicitud', async () => {
    const avisos = async () => (await comoPrestador(request(app).get('/api/notificaciones'))).body.notificaciones;
    const { body: { verificacion: primera } } = await solicitar();
    assert.equal((await avisos()).length, 0, 'solicitar no genera aviso');

    const rechazo = await comoAdmin(request(app).patch(`/api/admin/verificaciones/${primera.id}`))
      .send({ decision: 'rechazada', observacion: 'El código no aparece en el sitio de la SEC.' });
    assert.equal(rechazo.status, 200);
    let lista = await avisos();
    assert.equal(lista.length, 1);
    assert.match(lista[0].titulo, /No pudimos verificarte en /);
    assert.match(lista[0].texto, /El código no aparece en el sitio de la SEC\./);
    assert.equal(lista[0].solicitud_id, null);

    const { body: { verificacion: segunda } } = await solicitar();
    const aprobada = await comoAdmin(request(app).patch(`/api/admin/verificaciones/${segunda.id}`)).send(APROBAR());
    assert.equal(aprobada.status, 200);
    lista = await avisos();
    assert.equal(lista.length, 2);
    assert.match(lista[0].titulo, /Quedaste verificado en /);
  });

  test('si la fecha no sirve no se aprueba ni se avisa', async () => {
    const { body: { verificacion: v } } = await solicitar();
    const patch = (datos) => comoAdmin(request(app).patch(`/api/admin/verificaciones/${v.id}`)).send(datos);
    assert.equal((await patch({ decision: 'aprobada' })).status, 422);
    assert.equal((await patch({ decision: 'aprobada', vence_en: enDias(120) })).status, 422);
    const avisos = await comoPrestador(request(app).get('/api/notificaciones'));
    assert.equal(avisos.body.notificaciones.length, 0);
    assert.equal((await patch(APROBAR())).status, 200);
  });

  test('el prestador solicita verificación SEC y queda pendiente', async () => {
    const res = await solicitar();
    assert.equal(res.status, 201);
    assert.equal(res.body.verificacion.estado, 'pendiente');
    assert.equal(res.body.verificacion.organismo, 'SEC');

    const propias = await comoPrestador(request(app).get('/api/prestadores/yo/verificaciones'));
    assert.equal(propias.body.verificaciones.length, 1);
  });

  test('no permite dos solicitudes pendientes para la misma categoría', async () => {
    await solicitar();
    const res = await solicitar();
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'SOLICITUD_PENDIENTE');
  });

  test('rechaza categorías que no requieren verificación', async () => {
    const res = await solicitar({ categoria: 'poda-altura', numero_registro: '123' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.codigo, 'NO_REQUIERE_VERIFICACION');
  });

  test('flujo completo: al aprobarse, el prestador aparece en el catálogo', async () => {
    const { body } = await solicitar();
    assert.deepEqual(await enCatalogo(), []);   // pendiente: aún no aparece

    const pendientes = await comoAdmin(request(app).get('/api/admin/verificaciones'));
    assert.equal(pendientes.status, 200);
    assert.equal(pendientes.body.verificaciones[0].prestador_nombre, 'Juan Soto');
    assert.equal(pendientes.body.verificaciones[0].fuente_sugerida, 'https://wlhttp.sec.cl/validadorInstaladores/');

    const res = await comoAdmin(request(app).patch(`/api/admin/verificaciones/${body.verificacion.id}`))
      .send(APROBAR());
    assert.equal(res.status, 200);
    assert.equal(res.body.verificacion.estado, 'aprobada');
    assert.equal(res.body.verificacion.vence_en, enDias(80));
    assert.equal(res.body.verificacion.fuente_url, 'https://wlhttp.sec.cl/validadorInstaladores/');

    // Queda registro de quién revisó
    const { rows } = await pool.query('SELECT revisado_por, revisado_en FROM verificaciones WHERE id = $1', [body.verificacion.id]);
    assert.equal(rows[0].revisado_por, admin.id);
    assert.ok(rows[0].revisado_en);

    assert.deepEqual(await enCatalogo(), [prestador.id]);
  });

  test('un rechazo exige motivo y el prestador no aparece en el catálogo', async () => {
    const { body } = await solicitar();
    const sinMotivo = await comoAdmin(request(app).patch(`/api/admin/verificaciones/${body.verificacion.id}`))
      .send({ decision: 'rechazada' });
    assert.equal(sinMotivo.status, 422);
    assert.ok(sinMotivo.body.error.campos.observacion);

    const res = await comoAdmin(request(app).patch(`/api/admin/verificaciones/${body.verificacion.id}`))
      .send({ decision: 'rechazada', observacion: 'El número no figura en el buscador de la SEC' });
    assert.equal(res.status, 200);
    assert.deepEqual(await enCatalogo(), []);

    // Tras un rechazo puede volver a solicitar con otro número
    assert.equal((await solicitar({ categoria: 'electricidad', numero_registro: 'SEC-99999', codigo_certificado: 'QR-1234' })).status, 201);
  });

  test('una solicitud ya resuelta no se puede volver a resolver', async () => {
    const { body } = await solicitar();
    const url = `/api/admin/verificaciones/${body.verificacion.id}`;
    await comoAdmin(request(app).patch(url)).send(APROBAR());
    const res = await comoAdmin(request(app).patch(url))
      .send({ decision: 'rechazada', observacion: 'Cambio de opinión' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'YA_RESUELTA');
  });

  test('si ya está verificado no puede volver a solicitar', async () => {
    const { body } = await solicitar();
    await comoAdmin(request(app).patch(`/api/admin/verificaciones/${body.verificacion.id}`)).send(APROBAR());
    const res = await solicitar();
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'YA_VERIFICADO');
  });

  test('solo un administrador puede ver y resolver solicitudes', async () => {
    const { body } = await solicitar();
    const ver = await comoPrestador(request(app).get('/api/admin/verificaciones'));
    assert.equal(ver.status, 403);
    const resolver = await comoPrestador(request(app).patch(`/api/admin/verificaciones/${body.verificacion.id}`))
      .send({ decision: 'aprobada' });
    assert.equal(resolver.status, 403);
    assert.equal((await request(app).get('/api/admin/verificaciones')).status, 401);
  });

  test('resolver una solicitud inexistente responde 404', async () => {
    const res = await comoAdmin(request(app).patch(`/api/admin/verificaciones/${randomUUID()}`))
      .send({ decision: 'aprobada' });
    assert.equal(res.status, 404);
  });

  // ------------------------------------------------------------------ HU-17: certificado SEC con vencimiento
  test('la SEC exige el código del certificado y la fecha de vencimiento al aprobar', async () => {
    const sinCodigo = await solicitar({ categoria: 'electricidad', numero_registro: 'SEC-12345' });
    assert.equal(sinCodigo.status, 422);
    assert.ok(sinCodigo.body.error.campos.codigo_certificado);

    const { body } = await solicitar();
    assert.equal(body.verificacion.codigo_certificado, 'QR-8899-2211');
    const url = `/api/admin/verificaciones/${body.verificacion.id}`;
    const sinFecha = await comoAdmin(request(app).patch(url)).send({ decision: 'aprobada' });
    assert.equal(sinFecha.status, 422);
    assert.ok(sinFecha.body.error.campos.vence_en);
    // El certificado dura tres meses: una fecha a un año es un error de digitación
    assert.equal((await comoAdmin(request(app).patch(url)).send({ decision: 'aprobada', vence_en: enDias(365) })).status, 422);
    assert.equal((await comoAdmin(request(app).patch(url)).send({ decision: 'aprobada', vence_en: enDias(-1) })).status, 422);
    assert.equal((await comoAdmin(request(app).patch(url)).send(APROBAR())).status, 200);
  });

  test('una verificación vencida saca al prestador del catálogo y se puede renovar', async () => {
    const { body } = await solicitar();
    await comoAdmin(request(app).patch(`/api/admin/verificaciones/${body.verificacion.id}`)).send(APROBAR());
    assert.deepEqual(await enCatalogo(), [prestador.id]);

    // Pasa el tiempo: el certificado vence
    await pool.query("UPDATE verificaciones SET vence_en = current_date - 1 WHERE id = $1", [body.verificacion.id]);
    assert.deepEqual(await enCatalogo(), []);
    const ficha = await comoPrestador(request(app).get('/api/prestadores/yo'));
    assert.equal(ficha.body.ficha.categorias.find((c) => c.slug === 'electricidad').verificacion, 'vencida');
    const propias = await comoPrestador(request(app).get('/api/prestadores/yo/verificaciones'));
    assert.equal(propias.body.verificaciones[0].estado, 'vencida');

    // Con el certificado vencido puede pedir la renovación
    assert.equal((await solicitar()).status, 201);
  });

  test('puede renovar cuando faltan pocos días para el vencimiento, no antes', async () => {
    const { body } = await solicitar();
    await comoAdmin(request(app).patch(`/api/admin/verificaciones/${body.verificacion.id}`)).send(APROBAR());
    assert.equal((await solicitar()).status, 409);
    await pool.query("UPDATE verificaciones SET vence_en = current_date + 10 WHERE id = $1", [body.verificacion.id]);
    assert.equal((await solicitar()).status, 201);
    assert.deepEqual(await enCatalogo(), [prestador.id]);   // mientras tanto sigue vigente
  });

  test('la fuente de una verificación solo puede ser un enlace http o https', async () => {
    const { body } = await solicitar();
    const res = await comoAdmin(request(app).patch(`/api/admin/verificaciones/${body.verificacion.id}`))
      .send({ ...APROBAR(), fuente_url: 'javascript:alert(document.cookie)' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.campos.fuente_url);
  });
});

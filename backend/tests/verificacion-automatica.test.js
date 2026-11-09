import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('Verificación automática contra la SEC', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarValidadorSec, servicio, firmarToken;
  let n = 0;
  let maestro, admin;

  // Registro simulado: responde lo que cada prueba configure
  const simulado = {
    respuesta: null,
    llamadas: [],
    async consultar(datos) {
      simulado.llamadas.push(datos);
      if (simulado.respuesta instanceof Error) throw simulado.respuesta;
      return simulado.respuesta;
    },
  };
  const VIGENTE = { resultado: 'vigente', nombre: 'JUAN ANDRÉS SOTO PÉREZ' };
  const RUT = '12345678-5';

  before(async () => {
    pool = await prepararBase();
    ({ usarValidadorSec } = await import('../src/modules/verificaciones/validadorSec.js'));
    servicio = await import('../src/modules/verificaciones/verificaciones.servicio.js');
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
    usarValidadorSec(simulado);
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => { usarValidadorSec(null); await pool.end(); });

  async function registrar(nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro').send({
      rol: 'prestador', ...partirNombre(nombre), email: `v${n}@test.cl`, password: 'clave1234', acepta_terminos: true,
    });
    const u = { id: body.usuario.id, token: body.token };
    await como(u)(request(app).put('/api/prestadores/yo')).send({ comunas_atendidas: ['Chillán'] });
    return u;
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const DATOS = { categoria: 'electricidad', numero_registro: 'SEC-12345', codigo_certificado: 'QR-8899-2211', rut: '12.345.678-5', apellido_paterno: 'Soto', apellido_materno: 'Pérez' };
  const solicitar = (u = maestro, datos = DATOS) => como(u)(request(app).post('/api/prestadores/yo/verificaciones')).send(datos);
  const fila = async (id) => (await pool.query('SELECT * FROM verificaciones WHERE id = $1', [id])).rows[0];
  const pendientes = async () => (await como(admin)(request(app).get('/api/admin/verificaciones?estado=pendiente'))).body.verificaciones;
  const avisos = async (u = maestro) => (await como(u)(request(app).get('/api/notificaciones'))).body.notificaciones;
  const enCatalogo = async () => (await request(app).get('/api/prestadores?categoria=electricidad')).body.prestadores.map((p) => p.id);
  const diasDeVigencia = async (id) => (await pool.query('SELECT vence_en - current_date AS dias FROM verificaciones WHERE id = $1', [id])).rows[0].dias;
  const hace = (id, dias) => pool.query("UPDATE verificaciones SET revalidado_en = now() - make_interval(days => $2) WHERE id = $1", [id, dias]);

  beforeEach(async () => {
    await limpiarBase(pool);
    simulado.respuesta = VIGENTE;
    simulado.llamadas = [];
    maestro = await registrar('Juan Soto Pérez');
    const { rows: [a] } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Admin', 'admin@test.cl', 'x') RETURNING id, rol");
    admin = { id: a.id, token: firmarToken(a) };
  });

  test('si la SEC lo confirma, queda aprobado solo, sale en el catálogo y recibe el aviso', async () => {
    const res = await solicitar();
    assert.equal(res.status, 201);
    assert.equal(res.body.verificacion.estado, 'aprobada');
    assert.equal(res.body.verificacion.metodo_revision, 'automatica');
    assert.deepEqual(simulado.llamadas, [{ servicio: 'ELECTRICO', rut: RUT, apellidoPaterno: 'Soto', apellidoMaterno: 'Pérez' }]);

    const v = await fila(res.body.verificacion.id);
    assert.equal(v.revisado_por, null);
    assert.equal(v.consulta_resultado, 'vigente');
    assert.equal(await diasDeVigencia(v.id), 90);

    assert.deepEqual(await enCatalogo(), [maestro.id]);
    assert.match((await avisos())[0].titulo, /Quedaste verificado/);
    assert.deepEqual(await pendientes(), []);
    const { rows: [p] } = await pool.query('SELECT rut_verificado FROM prestadores WHERE usuario_id = $1', [maestro.id]);
    assert.equal(p.rut_verificado, RUT);
  });

  test('gas también se consulta, como servicio GAS', async () => {
    await solicitar(maestro, { ...DATOS, categoria: 'gas' });
    assert.equal(simulado.llamadas[0].servicio, 'GAS');
  });

  for (const [caso, respuesta, motivo] of [
    ['el registro no lo encuentra', { resultado: 'no_encontrado' }, /no tiene registrado/],
    ['el certificado no está vigente', { resultado: 'no_vigente' }, /no está vigente/],
    ['la SEC no está disponible', { resultado: 'no_disponible' }, /No se pudo consultar/],
    ['el nombre del registro es de otra persona', { resultado: 'vigente', nombre: 'PEDRO ROJAS DÍAZ' }, /no coincide con los apellidos/],
    ['la consulta falla', new Error('sitio caído'), /No se pudo consultar/],
  ]) {
    test(`si ${caso}, va a revisión manual con el motivo y sin rechazarlo`, async () => {
      simulado.respuesta = respuesta;
      const res = await solicitar();
      assert.equal(res.status, 201);
      assert.equal(res.body.verificacion.estado, 'pendiente');
      assert.deepEqual(await enCatalogo(), []);
      assert.equal((await avisos()).length, 0);
      const [p] = await pendientes();
      assert.match(p.consulta_motivo, motivo);
      assert.equal(p.rut, RUT);
    });
  }

  test('si la SEC no responde a tiempo, la solicitud pasa a revisión manual', async () => {
    const { body: { verificacion: v } } = await como(maestro)(request(app).post('/api/prestadores/yo/verificaciones'))
      .send({ categoria: 'electricidad', numero_registro: 'SEC-1', codigo_certificado: 'QR-1' });   // sin RUT: no consulta
    await pool.query('UPDATE verificaciones SET rut = $2, apellido_paterno = $3 WHERE id = $1', [v.id, RUT, 'Soto']);
    const normal = simulado.consultar;
    simulado.consultar = () => new Promise(() => {});
    await servicio.verificarConRegistro(v.id, { tiempoMaximoMs: 10 });
    simulado.consultar = normal;
    const f = await fila(v.id);
    assert.equal(f.estado, 'pendiente');
    assert.equal(f.consulta_resultado, 'no_disponible');
  });

  test('sin RUT (APK antigua) no consulta y va a revisión manual', async () => {
    const res = await solicitar(maestro, { categoria: 'electricidad', numero_registro: 'SEC-1', codigo_certificado: 'QR-1' });
    assert.equal(res.status, 201);
    assert.equal(res.body.verificacion.estado, 'pendiente');
    assert.equal(simulado.llamadas.length, 0);
    assert.match((await pendientes())[0].consulta_motivo, /no envió su RUT/);
  });

  test('SAG no se consulta: sigue en revisión manual', async () => {
    const res = await solicitar(maestro, { categoria: 'agroquimicos', numero_registro: 'SAG-1' });
    assert.equal(res.body.verificacion.estado, 'pendiente');
    assert.equal(simulado.llamadas.length, 0);
    assert.equal((await pendientes())[0].consulta_motivo, null);
  });

  test('un RUT inválido se rechaza con el error en su campo', async () => {
    const res = await solicitar(maestro, { ...DATOS, rut: '12.345.678-9' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.campos.rut);
  });

  test('el apellido debe coincidir con el nombre de la cuenta', async () => {
    const res = await solicitar(maestro, { ...DATOS, apellido_paterno: 'Rojas' });
    assert.equal(res.body.verificacion.estado, 'pendiente');
    assert.equal(simulado.llamadas.length, 0);
    assert.match((await pendientes())[0].consulta_motivo, /nombre de la cuenta/);
  });

  test('un RUT ya verificado en otra cuenta va al panel y el equipo no puede aprobarlo', async () => {
    await solicitar();
    const otro = await registrar('Juan Soto Pérez');
    const res = await solicitar(otro);
    assert.equal(res.body.verificacion.estado, 'pendiente');
    assert.equal(simulado.llamadas.length, 1, 'no vuelve a consultar');
    const [p] = await pendientes();
    assert.match(p.consulta_motivo, /otra cuenta/);

    const aprobar = await como(admin)(request(app).patch(`/api/admin/verificaciones/${p.id}`))
      .send({ decision: 'aprobada', vence_en: new Date(Date.now() + 40 * 86_400_000).toLocaleDateString('sv-SE') });
    assert.equal(aprobar.status, 409);
    assert.equal(aprobar.body.error.codigo, 'RUT_EN_OTRA_CUENTA');
    assert.equal((await fila(p.id)).estado, 'pendiente');
  });

  test('si el RUT no coincide con el de sus datos de pago, va al panel', async () => {
    await como(maestro)(request(app).put('/api/prestadores/yo/datos-pago'))
      .send({ rut: '11.111.111-1', banco: 'Banco Estado', tipo_cuenta: 'CuentaRUT', numero_cuenta: '12345678' });
    const res = await solicitar();
    assert.equal(res.body.verificacion.estado, 'pendiente');
    assert.match((await pendientes())[0].consulta_motivo, /datos de pago/);
  });

  test('verificado con un RUT, sus pagos solo pueden ir a ese mismo RUT', async () => {
    await solicitar();
    const guardar = (rut) => como(maestro)(request(app).put('/api/prestadores/yo/datos-pago'))
      .send({ rut, banco: 'Banco Estado', tipo_cuenta: 'CuentaRUT', numero_cuenta: '12345678' });
    const distinto = await guardar('11.111.111-1');
    assert.equal(distinto.status, 422);
    assert.ok(distinto.body.error.campos.rut);
    assert.equal((await guardar('12.345.678-5')).status, 200);
  });

  test('una excepción la puede aprobar el equipo: queda como manual y amarra el RUT', async () => {
    simulado.respuesta = { resultado: 'no_disponible' };
    const { body: { verificacion: v } } = await solicitar();
    const res = await como(admin)(request(app).patch(`/api/admin/verificaciones/${v.id}`))
      .send({ decision: 'aprobada', vence_en: new Date(Date.now() + 40 * 86_400_000).toLocaleDateString('sv-SE') });
    assert.equal(res.status, 200);
    const f = await fila(v.id);
    assert.equal(f.metodo_revision, 'manual');
    assert.equal(f.revisado_por, admin.id);
    const { rows: [p] } = await pool.query('SELECT rut_verificado FROM prestadores WHERE usuario_id = $1', [maestro.id]);
    assert.equal(p.rut_verificado, RUT);
  });

  test('el RUT no se muestra en el perfil público ni en la lista del propio catálogo', async () => {
    await solicitar();
    const perfil = await request(app).get(`/api/prestadores/${maestro.id}`);
    const catalogo = await request(app).get('/api/prestadores?categoria=electricidad');
    assert.equal(perfil.status, 200);
    assert.ok(!JSON.stringify(perfil.body).includes('12345678'));
    assert.ok(!JSON.stringify(catalogo.body).includes('12345678'));
  });

  test('al eliminar la cuenta se borran el RUT y los apellidos consultados', async () => {
    const { body: { verificacion: v } } = await solicitar();
    const res = await como(maestro)(request(app).post('/api/auth/yo/eliminar')).send({ password: 'clave1234' });
    assert.equal(res.status, 200);
    const f = await fila(v.id);
    assert.deepEqual([f.rut, f.apellido_paterno, f.apellido_materno], [null, null, null]);
    const { rows: [p] } = await pool.query('SELECT rut_verificado FROM prestadores WHERE usuario_id = $1', [maestro.id]);
    assert.equal(p.rut_verificado, null);
  });

  describe('revalidación periódica', () => {
    let v;
    beforeEach(async () => { ({ body: { verificacion: v } } = await solicitar()); simulado.llamadas = []; });

    test('antes de 30 días no vuelve a consultar', async () => {
      await hace(v.id, 10);
      assert.deepEqual(await servicio.revalidarAutomaticas(), { revisadas: 0, renovadas: 0, revocadas: 0 });
      assert.equal(simulado.llamadas.length, 0);
    });

    test('si sigue vigente, extiende el vencimiento y limpia los avisos', async () => {
      await hace(v.id, 31);
      await pool.query("UPDATE verificaciones SET vence_en = current_date + 5, aviso_por_vencer_en = now() WHERE id = $1", [v.id]);
      assert.deepEqual(await servicio.revalidarAutomaticas(), { revisadas: 1, renovadas: 1, revocadas: 0 });
      const f = await fila(v.id);
      assert.equal(await diasDeVigencia(v.id), 90);
      assert.equal(f.aviso_por_vencer_en, null);
    });

    for (const resultado of ['no_vigente', 'no_encontrado']) {
      test(`si la SEC responde ${resultado}, sale del catálogo y se le avisa`, async () => {
        await hace(v.id, 31);
        simulado.respuesta = { resultado };
        assert.deepEqual(await servicio.revalidarAutomaticas(), { revisadas: 1, renovadas: 0, revocadas: 1 });
        assert.equal((await fila(v.id)).estado, 'rechazada');
        assert.deepEqual(await enCatalogo(), []);
        assert.match((await avisos())[0].titulo, /Ya no pudimos confirmar/);
      });
    }

    test('si la SEC no está disponible, no cambia nada', async () => {
      await hace(v.id, 31);
      simulado.respuesta = { resultado: 'no_disponible' };
      assert.deepEqual(await servicio.revalidarAutomaticas(), { revisadas: 1, renovadas: 0, revocadas: 0 });
      assert.equal((await fila(v.id)).estado, 'aprobada');
    });

    test('una verificación manual no se revalida sola', async () => {
      await pool.query("UPDATE verificaciones SET metodo_revision = 'manual' WHERE id = $1", [v.id]);
      await hace(v.id, 31);
      assert.equal((await servicio.revalidarAutomaticas()).revisadas, 0);
    });
  });

  test('sin el registro conectado todo sigue en revisión manual', async () => {
    usarValidadorSec(null);
    try {
      const res = await solicitar();
      assert.equal(res.body.verificacion.estado, 'pendiente');
      assert.equal((await pendientes())[0].consulta_resultado, 'no_disponible');
    } finally {
      usarValidadorSec(simulado);
    }
  });
});

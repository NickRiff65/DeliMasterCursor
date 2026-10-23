import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('HU-01 / HU-02 / HU-07 · Catálogo y perfil de prestadores', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app;
  let pool;
  let n = 0;

  before(async () => {
    pool = await prepararBase();
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  beforeEach(() => limpiarBase(pool));
  after(() => pool.end());

  // Registra un prestador y completa su ficha. Devuelve { id, token }.
  async function crearPrestador(nombre, ficha) {
    n++;
    const { body } = await request(app).post('/api/auth/registro').send({
      rol: 'prestador', ...partirNombre(nombre), email: `p${n}@test.cl`, password: 'clave1234', acepta_terminos: true, telefono: '912345678',
    });
    const res = await request(app).put('/api/prestadores/yo')
      .set('Authorization', `Bearer ${body.token}`).send(ficha);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return { id: body.usuario.id, token: body.token };
  }

  const reputacion = (id, promedio, resenas) => pool.query(
    'UPDATE prestadores SET calificacion_promedio = $2, total_resenas = $3, trabajos_cerrados = $3 WHERE usuario_id = $1',
    [id, promedio, resenas]);

  async function aprobarVerificacion(prestadorId, slug) {
    await pool.query(
      `INSERT INTO verificaciones (prestador_id, categoria_id, organismo, numero_registro, estado, revisado_en, vence_en)
       SELECT $1, id, organismo, 'SEC-123', 'aprobada', now(), current_date + 60 FROM categorias WHERE slug = $2`,
      [prestadorId, slug]);
  }

  test('lista los oficios habilitados: primero los oficios, luego los trabajos de campo', async () => {
    const res = await request(app).get('/api/categorias');
    assert.equal(res.status, 200);
    const slugs = res.body.categorias.map((c) => c.slug);
    assert.deepEqual([...slugs].sort(), [
      'agroquimicos', 'albanileria', 'carpinteria', 'cercos', 'cerrajeria', 'electricidad', 'electrodomesticos', 'gas',
      'gasfiteria', 'jardineria', 'mecanica', 'pintura', 'poda-altura', 'preparacion-suelo', 'riego', 'tala', 'techumbre', 'vidrieria',
    ]);
    assert.equal(res.body.categorias[0].tipo, 'oficio');
    assert.equal(res.body.categorias.at(-1).tipo, 'campo');
    // Las instalaciones de gas, como la electricidad, exigen verificación SEC
    assert.deepEqual(res.body.categorias.find((c) => c.slug === 'gas').organismo, 'SEC');
    // La tala exige revisión en CONAF (plan de manejo o permiso de corta)
    const tala = res.body.categorias.find((c) => c.slug === 'tala');
    assert.equal(tala.requiere_verificacion, true);
    assert.equal(tala.organismo, 'CONAF');
  });

  test('DeliMaster atiende en Chillán y Coihueco', async () => {
    assert.deepEqual((await request(app).get('/api/comunas')).body.comunas, ['Chillán', 'Coihueco']);
  });

  test('el prestador edita su ficha y las comunas se normalizan', async () => {
    const { token } = await crearPrestador('Juan Soto', { descripcion: 'Poda segura', comunas_atendidas: ['chillan', 'COIHUECO'], categorias: ['poda-altura'] });
    const res = await request(app).get('/api/prestadores/yo').set('Authorization', `Bearer ${token}`);
    assert.deepEqual(res.body.ficha.comunas_atendidas, ['Chillán', 'Coihueco']);
    assert.equal(res.body.ficha.categorias[0].slug, 'poda-altura');
  });

  test('rechaza comunas fuera de la cobertura y categorías no habilitadas', async () => {
    const { token } = await crearPrestador('Pedro', { categorias: ['poda-altura'] });
    for (const comunas of [['Santiago'], ['San Carlos'], ['Chillán', 'Chillán Viejo']]) {
      const comuna = await request(app).put('/api/prestadores/yo')
        .set('Authorization', `Bearer ${token}`).send({ comunas_atendidas: comunas });
      assert.equal(comuna.status, 422, comunas.join());
    }
    await pool.query("UPDATE categorias SET activa = false WHERE slug = 'mecanica'");
    try {
      const categoria = await request(app).put('/api/prestadores/yo')
        .set('Authorization', `Bearer ${token}`).send({ categorias: ['mecanica'] });
      assert.equal(categoria.status, 422);
      assert.match(categoria.body.error.campos.categorias, /mecanica/);
    } finally {
      await pool.query("UPDATE categorias SET activa = true WHERE slug = 'mecanica'");
    }
  });

  test('un cliente no puede editar una ficha de prestador', async () => {
    const { body } = await request(app).post('/api/auth/registro').send({
      rol: 'cliente', nombre: 'Ana', apellido: 'Pérez', email: 'ana@test.cl', password: 'clave1234', acepta_terminos: true,
    });
    const res = await request(app).put('/api/prestadores/yo')
      .set('Authorization', `Bearer ${body.token}`).send({ disponible: false });
    assert.equal(res.status, 403);
  });

  test('categoría regulada: solo aparecen electricistas con verificación SEC aprobada', async () => {
    const sinVerificar = await crearPrestador('Sin Verificar', { comunas_atendidas: ['Chillán'], categorias: ['electricidad'] });
    const verificado = await crearPrestador('Verificado', { comunas_atendidas: ['Chillán'], categorias: ['electricidad'] });
    await aprobarVerificacion(verificado.id, 'electricidad');

    const res = await request(app).get('/api/prestadores?categoria=electricidad');
    assert.equal(res.status, 200);
    const ids = res.body.prestadores.map((p) => p.id);
    assert.deepEqual(ids, [verificado.id]);
    assert.ok(!ids.includes(sinVerificar.id));
    assert.equal(res.body.prestadores[0].categorias[0].verificada, true);
  });

  test('categoría no regulada: aparece sin verificación; filtra por comuna sin importar tildes', async () => {
    const chillan = await crearPrestador('En Chillán', { comunas_atendidas: ['Chillán'], categorias: ['poda-altura'] });
    await crearPrestador('En Coihueco', { comunas_atendidas: ['Coihueco'], categorias: ['poda-altura'] });

    const res = await request(app).get('/api/prestadores?categoria=poda-altura&comuna=chillan');
    assert.deepEqual(res.body.prestadores.map((p) => p.id), [chillan.id]);
    assert.equal(res.body.paginacion.total, 1);
  });

  test('HU-07: ordena por reputación ponderada, no solo por promedio', async () => {
    const unaResena = await crearPrestador('Una reseña 5★', { categorias: ['poda-altura'] });
    const experto = await crearPrestador('40 reseñas 4,8★', { categorias: ['poda-altura'] });
    const nuevo = await crearPrestador('Nuevo maestro', { categorias: ['poda-altura'] });
    const malo = await crearPrestador('10 reseñas 3★', { categorias: ['poda-altura'] });
    await reputacion(unaResena.id, 5, 1);
    await reputacion(experto.id, 4.8, 40);
    await reputacion(malo.id, 3, 10);

    const res = await request(app).get('/api/prestadores?categoria=poda-altura');
    assert.deepEqual(res.body.prestadores.map((p) => p.nombre),
      ['40 reseñas 4,8★', 'Una reseña 5★', 'Nuevo maestro', '10 reseñas 3★']);
    assert.ok(nuevo.id);
  });

  test('no muestra prestadores marcados como no disponibles', async () => {
    const { token } = await crearPrestador('Ocupado', { categorias: ['poda-altura'] });
    await request(app).put('/api/prestadores/yo').set('Authorization', `Bearer ${token}`).send({ disponible: false });
    const res = await request(app).get('/api/prestadores');
    assert.equal(res.body.prestadores.length, 0);
  });

  test('pagina los resultados', async () => {
    for (let i = 0; i < 3; i++) await crearPrestador(`P${i}`, { categorias: ['poda-altura'] });
    const res = await request(app).get('/api/prestadores?limite=2&pagina=2');
    assert.equal(res.body.prestadores.length, 1);
    assert.deepEqual(res.body.paginacion, { pagina: 2, limite: 2, total: 3, paginas: 2 });
  });

  test('HU-02: el perfil público no expone teléfono ni correo', async () => {
    const { id } = await crearPrestador('Juan Soto', { descripcion: 'Poda en altura', categorias: ['poda-altura'] });
    const res = await request(app).get(`/api/prestadores/${id}`);
    assert.equal(res.status, 200);
    const p = res.body.prestador;
    assert.equal(p.nombre, 'Juan Soto');
    assert.deepEqual(p.resenas, []);
    for (const prohibido of ['telefono', 'email', 'password_hash', 'numero_cuenta']) {
      assert.equal(JSON.stringify(p).includes(prohibido), false, `expone ${prohibido}`);
    }
  });

  test('HU-02: perfil inexistente o id inválido responde 404', async () => {
    assert.equal((await request(app).get(`/api/prestadores/${randomUUID()}`)).status, 404);
    assert.equal((await request(app).get('/api/prestadores/no-es-un-id')).status, 404);
  });

  test('filtros inválidos responden 422', async () => {
    const res = await request(app).get('/api/prestadores?comuna=Santiago&limite=500');
    assert.equal(res.status, 422);
    assert.ok(res.body.error.campos.comuna);
    assert.ok(res.body.error.campos.limite);
  });

  test('el maestro elige sus días y horario al registrarse; el cliente los ve en el perfil y el catálogo', async () => {
    n++;
    const { body, status } = await request(app).post('/api/auth/registro').send({
      rol: 'prestador', nombre: 'Luis', apellido: 'Horario', email: `p${n}@test.cl`, password: 'clave1234', acepta_terminos: true,
      horario: { dias: [6, 1, 3, 1], desde: '08:30', hasta: '17:00' },
    });
    assert.equal(status, 201, JSON.stringify(body));
    const esperado = { dias: [1, 3, 6], desde: '08:30', hasta: '17:00' };
    const yo = (req) => req.set('Authorization', `Bearer ${body.token}`);
    await yo(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });

    assert.deepEqual((await yo(request(app).get('/api/prestadores/yo'))).body.ficha.horario, esperado);
    assert.deepEqual((await request(app).get(`/api/prestadores/${body.usuario.id}`)).body.prestador.horario, esperado);
    assert.deepEqual((await request(app).get('/api/prestadores?categoria=poda-altura')).body.prestadores[0].horario, esperado);
  });

  test('sin elegir horario queda todos los días de 08:00 a medianoche; se cambia en la ficha y se valida', async () => {
    const { token } = await crearPrestador('Ana Horario', { categorias: ['poda-altura'] });
    const yo = (req) => req.set('Authorization', `Bearer ${token}`);
    const ficha = async () => (await yo(request(app).get('/api/prestadores/yo'))).body.ficha;
    assert.deepEqual((await ficha()).horario, { dias: [1, 2, 3, 4, 5, 6, 7], desde: '08:00', hasta: '24:00' });

    const cambio = await yo(request(app).put('/api/prestadores/yo')).send({ horario: { dias: [1, 2, 3, 4, 5, 6], desde: '10:00', hasta: '20:00' } });
    assert.equal(cambio.status, 200);
    assert.deepEqual((await ficha()).horario, { dias: [1, 2, 3, 4, 5, 6], desde: '10:00', hasta: '20:00' });

    for (const horario of [
      { dias: [1], desde: '18:00', hasta: '09:00' },   // termina antes de empezar
      { dias: [], desde: '09:00', hasta: '18:00' },
      { dias: [8], desde: '09:00', hasta: '18:00' },
      { dias: [1], desde: '25:00', hasta: '26:00' },
      { dias: [1], desde: '07:00', hasta: '12:00' },   // el horario parte a las 08:00
      { dias: [1], desde: '20:00', hasta: '24:30' },   // y termina a más tardar a medianoche
    ]) {
      const res = await yo(request(app).put('/api/prestadores/yo')).send({ horario });
      assert.equal(res.status, 422, JSON.stringify(horario));
    }
    assert.deepEqual((await ficha()).horario.desde, '10:00');   // no cambió

    // Hasta la medianoche, por ejemplo para atender urgencias de noche y los fines de semana
    await yo(request(app).put('/api/prestadores/yo')).send({ horario: { dias: [5, 6, 7], desde: '18:00', hasta: '24:00' } });
    assert.deepEqual((await ficha()).horario, { dias: [5, 6, 7], desde: '18:00', hasta: '24:00' });
  });
});

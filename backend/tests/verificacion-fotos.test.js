import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';
import { evaluarFoto, textoVerificacion } from '../src/utils/verificacionFoto.js';

// Fotos reales y tomadas en el momento: se verifican con los datos de la cámara (EXIF)
const AHORA = new Date('2026-11-20T15:00:00Z');   // 12:00 en Chile (horario de verano, UTC-3)

describe('Verificación de fotos (regla)', () => {
  const evaluar = (app, extra = {}) => evaluarFoto({ app, ahora: AHORA, ...extra });

  test('tomada con la cámara hace media hora: verificada, "en el momento"', () => {
    const v = evaluar({ fecha_original: '2026-11-20T11:30:00', dispositivo: 'samsung SM-A515F', tomada_con: 'camara' });
    assert.equal(v.estado, 'verificada');
    assert.equal(v.minutos, 30);
    assert.equal(v.origen, 'app');
    assert.equal(textoVerificacion(v), 'Foto tomada en el momento');
  });

  test('tomada hace 5 horas: verificada, del mismo día', () => {
    const v = evaluar({ fecha_original: '2026-11-20T07:00:00', dispositivo: 'iPhone 13' });
    assert.equal(v.estado, 'verificada');
    assert.equal(textoVerificacion(v), 'Foto tomada el mismo día');
  });

  test('una foto de hace días queda para revisar como antigua, con su fecha', () => {
    const v = evaluar({ fecha_original: '2026-11-12T09:00:00', dispositivo: 'iPhone 13' });
    assert.equal(v.estado, 'revisar');
    assert.deepEqual(v.motivos, ['antigua']);
    assert.equal(textoVerificacion(v), 'Foto antigua: se tomó el 12 nov');
  });

  test('sin datos de cámara (captura o descargada) y editada con un programa', () => {
    assert.equal(evaluar({}).estado, 'sin_datos');
    assert.match(textoVerificacion(evaluar({})), /Sin datos de cámara/);
    const editada = evaluar({ fecha_original: '2026-11-20T11:50:00', dispositivo: 'iPhone 13', software: 'Adobe Photoshop 25.0' });
    assert.deepEqual(editada.motivos, ['editada']);
  });

  test('una fecha en el futuro no calza (reloj alterado)', () => {
    assert.deepEqual(evaluar({ fecha_original: '2026-11-20T14:00:00', dispositivo: 'iPhone 13' }).motivos, ['fecha_futura']);
  });

  test('tomada lejos del punto del trabajo: para revisar (la distancia solo la ve el equipo)', () => {
    const lugar = { lat: -36.6066, lng: -72.1034 };   // Chillán
    const cerca = evaluar({ fecha_original: '2026-11-20T11:30:00', dispositivo: 'x', lat: -36.607, lng: -72.104 }, { lugar });
    assert.equal(cerca.estado, 'verificada');
    const lejos = evaluar({ fecha_original: '2026-11-20T11:30:00', dispositivo: 'x', lat: -33.45, lng: -70.66 }, { lugar });
    assert.deepEqual(lejos.motivos, ['lejos']);
    assert.ok(lejos.distancia > 100_000);
    assert.equal(textoVerificacion(lejos), 'Se tomó lejos del lugar del trabajo');
  });

  test('los datos que trae el archivo mandan sobre los que informa la app', () => {
    const v = evaluarFoto({
      archivo: { fechaOriginal: '2026-11-01T10:00:00', dispositivo: 'Canon EOS R5' },
      app: { fecha_original: '2026-11-20T11:30:00', dispositivo: 'iPhone 13' }, ahora: AHORA,
    });
    assert.equal(v.origen, 'archivo');
    assert.deepEqual(v.motivos, ['antigua']);
  });
});

describe('Fotos al pedir el servicio: hasta 3 y verificadas', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, cliente, PNG_B64;
  let n = 0;

  before(async () => {
    pool = await prepararBase();
    const sharp = (await import('sharp')).default;
    PNG_B64 = (await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 120, b: 0 } } })
      .png().toBuffer()).toString('base64');
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  beforeEach(async () => {
    await limpiarBase(pool);
    n++;
    const { body } = await request(app).post('/api/auth/registro').send({
      rol: 'cliente', ...partirNombre('Ana Pérez'), email: `f${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán',
    });
    cliente = { id: body.usuario.id, token: body.token };
  });

  const ahoraEnChile = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date()).replace(' ', 'T');
  const crear = (fotos) => request(app).post('/api/solicitudes').set('Authorization', `Bearer ${cliente.token}`)
    .send({ id: randomUUID(), descripcion: 'Necesito podar un árbol alto', direccion: 'Av. Libertad 1234', fotos });

  test('acepta 3 fotos y cada una queda con su verificación; la cuarta no', async () => {
    const tomada = { tomada_con: 'camara', fecha_original: ahoraEnChile(), dispositivo: 'samsung SM-A515F' };
    const res = await crear([
      { imagen_base64: PNG_B64, metadatos: tomada },
      { imagen_base64: PNG_B64, metadatos: { ...tomada, fecha_original: '2025-01-15T10:00:00' } },
      PNG_B64,   // versión anterior de la app: solo la imagen
    ]);
    assert.equal(res.status, 201);
    const id = res.body.solicitudes[0].id;

    const lista = await request(app).get(`/api/solicitudes/${id}/fotos`).set('Authorization', `Bearer ${cliente.token}`);
    assert.deepEqual(lista.body.fotos.map((f) => f.verificacion.estado), ['verificada', 'revisar', 'sin_datos']);
    assert.equal(lista.body.fotos[0].verificacion.texto, 'Foto tomada en el momento');
    assert.match(lista.body.fotos[1].verificacion.texto, /Foto antigua: se tomó el 15 ene/);
    for (const f of lista.body.fotos) assert.equal('exif_lat' in f || 'distancia_m' in f, false);   // sin ubicación

    const { rows } = await pool.query('SELECT tomada_con, metadatos_origen FROM evidencias ORDER BY creado_en, id');
    assert.deepEqual(rows[0], { tomada_con: 'camara', metadatos_origen: 'app' });

    const cuatro = await crear([PNG_B64, PNG_B64, PNG_B64, PNG_B64]);
    assert.equal(cuatro.status, 422);
    assert.match(JSON.stringify(cuatro.body), /hasta 3 fotos/);
  });

  test('sin sesión no se acepta el envío con fotos', async () => {
    const res = await request(app).post('/api/solicitudes')
      .send({ id: randomUUID(), descripcion: 'Necesito podar un árbol', direccion: 'Av. Libertad 1234', fotos: [PNG_B64] });
    assert.equal(res.status, 401);
  });
});

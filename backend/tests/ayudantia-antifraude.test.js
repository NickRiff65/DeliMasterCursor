import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';
import { analizarMensaje } from '../src/modules/mensajes/filtro.js';
import { extraerExif, esSospechosa } from '../src/utils/imagenes.js';

// Las imágenes de prueba se guardan en carpetas temporales, no en backend/uploads
process.env.CARPETA_EVIDENCIAS = path.join(os.tmpdir(), `delimaster-ayudantia-evidencias-${process.pid}`);
process.env.CARPETA_PORTAFOLIO = path.join(os.tmpdir(), `delimaster-ayudantia-portafolio-${process.pid}`);

// ------------------------------------------------------------------ imágenes de prueba
// JPEG mínimo con segmento APP1/Exif (little-endian): marca y modelo de cámara,
// DateTimeOriginal y GPS (36,6° S, 72,1° O: Chillán). Sin datos de imagen: basta para
// el parser EXIF y para la validación por firma del almacén.
function jpegConExif() {
  const ascii = (s) => Buffer.from(`${s}\0`, 'ascii');
  const marca = ascii('Canon'); const modelo = ascii('Canon EOS R5'); const fecha = ascii('2026:11:10 15:30:45');
  const ifd0 = 8; const datos = ifd0 + 2 + 4 * 12 + 4;
  let p = datos;
  const offMarca = p; p += marca.length;
  const offModelo = p; p += modelo.length;
  const offExif = p; p += 2 + 12 + 4;
  const offFecha = p; p += fecha.length;
  const offGps = p; p += 2 + 4 * 12 + 4;
  const offLat = p; p += 24;
  const offLng = p; p += 24;
  const tiff = Buffer.alloc(p);
  tiff.write('II', 0, 'ascii'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(ifd0, 4);
  const entrada = (off, tag, tipo, cant, valor) => {
    tiff.writeUInt16LE(tag, off); tiff.writeUInt16LE(tipo, off + 2); tiff.writeUInt32LE(cant, off + 4);
    if (Buffer.isBuffer(valor)) valor.copy(tiff, off + 8); else tiff.writeUInt32LE(valor, off + 8);
  };
  tiff.writeUInt16LE(4, ifd0);
  entrada(ifd0 + 2, 0x010F, 2, marca.length, offMarca);
  entrada(ifd0 + 14, 0x0110, 2, modelo.length, offModelo);
  entrada(ifd0 + 26, 0x8769, 4, 1, offExif);
  entrada(ifd0 + 38, 0x8825, 4, 1, offGps);
  marca.copy(tiff, offMarca); modelo.copy(tiff, offModelo);
  tiff.writeUInt16LE(1, offExif);
  entrada(offExif + 2, 0x9003, 2, fecha.length, offFecha);
  fecha.copy(tiff, offFecha);
  const racional = (off, num, den) => { tiff.writeUInt32LE(num, off); tiff.writeUInt32LE(den, off + 4); };
  racional(offLat, 36, 1); racional(offLat + 8, 36, 1); racional(offLat + 16, 0, 1);   // 36,6°
  racional(offLng, 72, 1); racional(offLng + 8, 6, 1); racional(offLng + 16, 0, 1);     // 72,1°
  tiff.writeUInt16LE(4, offGps);
  entrada(offGps + 2, 0x0001, 2, 2, Buffer.from('S\0\0\0', 'latin1'));
  entrada(offGps + 14, 0x0002, 5, 3, offLat);
  entrada(offGps + 26, 0x0003, 2, 2, Buffer.from('W\0\0\0', 'latin1'));
  entrada(offGps + 38, 0x0004, 5, 3, offLng);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const seg = Buffer.alloc(4); seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(app1.length + 2, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg, app1, Buffer.from([0xff, 0xd9])]);
}
const JPEG_EXIF_B64 = jpegConExif().toString('base64');
const JPEG_SIN_EXIF_B64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');
let PNG_B64;   // PNG real (lo genera sharp en el before): sirve para probar la conversión a WebP

// ------------------------------------------------------------------ 5) filtro: fugas nuevas
describe('Ayudantía · filtro del chat: pago en persona y monto partido', () => {
  const bloquea = (texto) => {
    const r = analizarMensaje(texto);
    assert.equal(r.bloqueado, true, `debió bloquear: "${texto}"`);
    assert.ok(r.motivos.includes('pago_externo'), `"${texto}" debió ser pago_externo; fue ${r.motivos}`);
  };
  const permite = (texto) => {
    const r = analizarMensaje(texto);
    assert.equal(r.bloqueado, false, `no debió bloquear: "${texto}" (${r.motivos})`);
  };

  test('bloquea el ejemplo literal del profesor', () => {
    bloquea('le cobro 500 por la plataforma y en persona me paga los 24.500');
  });

  test('bloquea variantes: en persona / presencial con verbo de pago', () => {
    bloquea('en persona me pagas y listo');
    bloquea('nos juntamos presencial y ahí me cancelas');
    bloquea('cuando vaya en persona te cobro el total');
  });

  test('bloquea el monto partido: resto, diferencia o segundo pago dirigido', () => {
    bloquea('te cobro 500 por la plataforma y el resto me lo pagas después');
    bloquea('paga 500 por la app y la diferencia me la pagas a mí');
    bloquea('son 500 por la plataforma y 24.500 más, me cancelas el saldo');
  });

  test('los pagos legítimos por la plataforma pasan', () => {
    permite('pago por la plataforma');
    permite('te cobro 25.000 por la plataforma');
    permite('el trabajo cuesta 25.000, todo por la plataforma');
  });

  test('las listas de montos de siempre siguen pasando', () => {
    permite('Cobro 45000, materiales 20000');
    permite('Mano de obra 30000; materiales 15000');
    permite('Serían $45.000 con materiales incluidos');
  });
});

// ------------------------------------------------------------------ 7) EXIF: parser puro
describe('Ayudantía · EXIF antifraude (parser)', () => {
  test('lee fecha original, GPS y dispositivo de un JPEG con EXIF', () => {
    const exif = extraerExif(jpegConExif());
    assert.equal(exif.fechaOriginal, '2026-11-10T15:30:45');
    assert.equal(exif.lat, -36.6);
    assert.equal(exif.lng, -72.1);
    assert.equal(exif.dispositivo, 'Canon EOS R5');
    assert.equal(esSospechosa(exif), false);
  });

  test('sin EXIF no hay datos de cámara y la foto es sospechosa', () => {
    const exif = extraerExif(Buffer.from(JPEG_SIN_EXIF_B64, 'base64'));
    assert.deepEqual(exif, { fechaOriginal: null, lat: null, lng: null, dispositivo: null });
    assert.equal(esSospechosa(exif), true);
    assert.equal(esSospechosa(null), true);
  });
});

// ------------------------------------------------------------------ con base de datos
describe('Ayudantía · avisos, EXIF en evidencias, WebP, portafolio y catálogo', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool;
  let n = 0;
  let cliente, prestador, otroPrestador, solicitudId;

  before(async () => {
    pool = await prepararBase();
    const sharp = (await import('sharp')).default;
    PNG_B64 = (await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 0, b: 0 } } })
      .png().toBuffer()).toString('base64');
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `a${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const enviar = (u, contenido) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}/mensajes`)).send({ contenido });
  const subirFoto = (u, imagen_base64) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}/fotos`)).send({ imagen_base64 });
  const avisosDe = async (u) => (await pool.query(
    "SELECT titulo FROM notificaciones WHERE usuario_id = $1 AND titulo ILIKE '%aviso%' ORDER BY id", [u.id])).rows.map((r) => r.titulo);

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    otroPrestador = await registrar('prestador', 'Pedro Poda');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto' });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
  });

  // ---------------------------------------------------------- 6) avisos de bloqueo
  test('al 3er mensaje bloqueado llega un aviso formal y al 6º el último aviso', async () => {
    const bloqueados = [
      'háblame por wsp', 'agrégame a WhatsApp', 'mira mis trabajos en instagram',
      'escríbeme a juan.soto@gmail.com', 'te paso mi cuenta rut', 'mejor págame en efectivo',
    ];
    for (let i = 0; i < 2; i++) assert.equal((await enviar(prestador, bloqueados[i])).body.mensaje.bloqueado, true);
    assert.deepEqual(await avisosDe(prestador), []);                       // aún no llega al umbral

    assert.equal((await enviar(prestador, bloqueados[2])).body.mensaje.bloqueado, true);
    let avisos = await avisosDe(prestador);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /Aviso por mensajes bloqueados/);
    const { rows: [texto] } = await pool.query(
      'SELECT texto FROM notificaciones WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1', [prestador.id]);
    assert.match(texto.texto, /tu cuenta será bloqueada/);

    assert.equal((await enviar(prestador, bloqueados[3])).body.mensaje.bloqueado, true);
    assert.equal((await enviar(prestador, bloqueados[4])).body.mensaje.bloqueado, true);
    assert.equal((await avisosDe(prestador)).length, 1);                   // no se repite en cada bloqueo

    assert.equal((await enviar(prestador, bloqueados[5])).body.mensaje.bloqueado, true);
    avisos = await avisosDe(prestador);
    assert.equal(avisos.length, 2);
    assert.match(avisos[1], /Último aviso/);
  });

  // ---------------------------------------------------------- 7) EXIF en evidencias
  test('la evidencia guarda el EXIF y la lista expone sospechosa, sin exponer el GPS', async () => {
    assert.equal((await subirFoto(prestador, JPEG_EXIF_B64)).status, 201);
    assert.equal((await subirFoto(cliente, PNG_B64)).status, 201);

    const { rows } = await pool.query(
      'SELECT autor_id, sospechosa, exif_dispositivo, exif_lat::float AS lat, exif_fecha FROM evidencias ORDER BY creado_en, id');
    const conExif = rows.find((r) => r.autor_id === prestador.id);
    assert.equal(conExif.sospechosa, false);
    assert.equal(conExif.exif_dispositivo, 'Canon EOS R5');
    assert.equal(conExif.lat, -36.6);
    assert.ok(conExif.exif_fecha);
    const sinExif = rows.find((r) => r.autor_id === cliente.id);
    assert.equal(sinExif.sospechosa, true);                                // un PNG no trae EXIF de cámara
    assert.equal(sinExif.exif_dispositivo, null);

    const lista = await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}/fotos`));
    assert.deepEqual(lista.body.fotos.map((f) => f.sospechosa), [false, true]);
    for (const f of lista.body.fotos) {
      assert.equal('exif_lat' in f, false);
      assert.equal('exif_lng' in f, false);
      assert.equal('exif_fecha' in f, false);
    }
  });

  // ---------------------------------------------------------- 8) conversión a WebP
  test('una imagen real subida como evidencia queda guardada en WebP', async () => {
    assert.equal((await subirFoto(cliente, PNG_B64)).status, 201);
    const { rows: [e] } = await pool.query('SELECT archivo FROM evidencias LIMIT 1');
    assert.ok(e.archivo.endsWith('.webp'), `el archivo debió ser .webp: ${e.archivo}`);

    const lista = await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}/fotos`));
    const { pathname, search } = new URL(lista.body.fotos[0].url);
    const img = await request(app).get(pathname + search).buffer(true)
      .parse((res, cb) => { const partes = []; res.on('data', (c) => partes.push(c)); res.on('end', () => cb(null, Buffer.concat(partes))); });
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/webp');
    assert.equal(img.body.subarray(0, 4).toString(), 'RIFF');
    assert.equal(img.body.subarray(8, 12).toString(), 'WEBP');
  });

  // ---------------------------------------------------------- 9) portafolio
  test('el maestro sube, lista y borra sus fotos de portafolio; el perfil las muestra', async () => {
    const creada = await como(prestador)(request(app).post('/api/prestadores/yo/fotos')).send({ imagen_base64: PNG_B64, descripcion: 'Poda anterior' });
    assert.equal(creada.status, 201);
    assert.equal(creada.body.maximo, 12);
    assert.equal(creada.body.fotos.length, 1);
    const [foto] = creada.body.fotos;
    assert.ok(foto.id && foto.creado_en);
    assert.match(foto.url, /\/prestadores\/fotos\/.+\/imagen\?vence=\d+&firma=/);

    // La foto se sirve con el enlace firmado, en WebP, y sin firma no
    const { pathname, search } = new URL(foto.url);
    const img = await request(app).get(pathname + search);
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/webp');
    assert.equal((await request(app).get(pathname)).status, 403);

    const lista = await como(prestador)(request(app).get('/api/prestadores/yo/fotos'));
    assert.equal(lista.body.maximo, 12);
    assert.deepEqual(lista.body.fotos.map((f) => f.id), [foto.id]);   // la URL firmada puede variar en el segundo

    // El perfil público la incluye y su enlace sigue funcionando
    const perfil = await request(app).get(`/api/prestadores/${prestador.id}`);
    assert.equal(perfil.body.prestador.fotos.length, 1);
    assert.match(perfil.body.prestador.fotos[0].url, /\/prestadores\/fotos\/.+\/imagen/);

    // Solo el dueño la borra, y al borrarla se va también de la lista
    const ajena = await como(otroPrestador)(request(app).delete(`/api/prestadores/yo/fotos/${foto.id}`));
    assert.equal(ajena.status, 404);
    const borrada = await como(prestador)(request(app).delete(`/api/prestadores/yo/fotos/${foto.id}`));
    assert.equal(borrada.status, 200);
    assert.deepEqual(borrada.body.fotos, []);
    assert.equal((await request(app).get(`/api/prestadores/${prestador.id}`)).body.prestador.fotos.length, 0);
  });

  test('el portafolio tiene máximo 12 fotos y es solo del prestador', async () => {
    for (let i = 0; i < 12; i++) {
      await pool.query('INSERT INTO fotos_trabajo (prestador_id, url) VALUES ($1, $2)', [prestador.id, `https://ejemplo.cl/f${i}.jpg`]);
    }
    const extra = await como(prestador)(request(app).post('/api/prestadores/yo/fotos')).send({ imagen_base64: PNG_B64 });
    assert.equal(extra.status, 409);
    assert.equal(extra.body.error.codigo, 'LIMITE_FOTOS');
    const lista = await como(prestador)(request(app).get('/api/prestadores/yo/fotos'));
    assert.equal(lista.body.fotos.length, 12);

    const deCliente = await como(cliente)(request(app).post('/api/prestadores/yo/fotos')).send({ imagen_base64: PNG_B64 });
    assert.equal(deCliente.status, 403);
  });

  // ---------------------------------------------------------- 10) catálogo: es_nuevo
  test('el catálogo marca es_nuevo y filtra con nuevos=true', async () => {
    await como(otroPrestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    // Pedro se registró hace 40 días; Luis, recién
    await pool.query("UPDATE usuarios SET creado_en = now() - interval '40 days' WHERE id = $1", [otroPrestador.id]);

    const todos = await request(app).get('/api/prestadores');
    const porNombre = Object.fromEntries(todos.body.prestadores.map((p) => [p.nombre, p.es_nuevo]));
    assert.deepEqual(porNombre, { 'Luis Poda': true, 'Pedro Poda': false });

    const nuevos = await request(app).get('/api/prestadores?nuevos=true');
    assert.deepEqual(nuevos.body.prestadores.map((p) => p.nombre), ['Luis Poda']);
    assert.equal(nuevos.body.prestadores[0].es_nuevo, true);

    const noNuevos = await request(app).get('/api/prestadores?nuevos=false');
    assert.equal(noNuevos.body.prestadores.length, 2);
  });
});

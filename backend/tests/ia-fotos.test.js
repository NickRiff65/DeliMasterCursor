import { describe, test, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Detección del problema por foto con IA (desafío del profesor). Las pruebas nunca llaman a la IA real:
// usan un analizador simulado que recibe las fotos ya preparadas y devuelve lo que respondería el modelo.
describe('Detección del problema por foto (IA)', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarAnalizadorFotos;
  let cliente, prestador;
  let n = 0;
  let fotoGrande;

  before(async () => {
    pool = await prepararBase();
    ({ usarAnalizadorFotos } = await import('../src/modules/solicitudes/interpreteFoto.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
    // Una foto de celular: grande y con datos de cámara (que no deben llegar a la IA)
    const jpeg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#8a8a8a' } })
      .withExif({ IFD0: { Make: 'CamaraDePrueba', Model: 'Modelo X' } })
      .jpeg().toBuffer();
    fotoGrande = jpeg.toString('base64');
  });
  after(() => pool.end());
  afterEach(() => usarAnalizadorFotos(null));

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `ia${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const analizar = (u, fotos) => como(u)(request(app).post('/api/solicitudes/analizar-fotos')).send({ fotos });
  const respuesta = (extra = {}) => ({
    categoria: 'electricidad', confianza: 'alta',
    descripcion: 'El enchufe de la pared tiene marcas de quemado y la tapa está derretida.',
    peligro: 'No lo uses y corta la luz del automático hasta que llegue el maestro.',
    pregunta: '¿Saltó el automático?', fotos_principal: [1], otros_trabajos: [], ...extra,
  });

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
  });

  test('sin la clave de la IA no está disponible y la app sigue como siempre', async () => {
    const disp = await como(cliente)(request(app).get('/api/solicitudes/analizar-fotos'));
    assert.deepEqual(disp.body, { disponible: false });
    const res = await analizar(cliente, [fotoGrande]);
    assert.equal(res.status, 503);
    assert.equal(res.body.error.codigo, 'IA_NO_DISPONIBLE');
  });

  test('propone el servicio y la descripción; la foto llega achicada y sin datos de la cámara', async () => {
    const recibidas = [];
    usarAnalizadorFotos(async (imagenes) => { recibidas.push(...imagenes); return respuesta(); });
    assert.deepEqual((await como(cliente)(request(app).get('/api/solicitudes/analizar-fotos'))).body, { disponible: true });

    const res = await analizar(cliente, [fotoGrande]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.analisis, {
      categoria: { slug: 'electricidad', nombre: 'Electricidad' },
      confianza: 'alta',
      descripcion: 'El enchufe de la pared tiene marcas de quemado y la tapa está derretida.',
      peligro: 'No lo uses y corta la luz del automático hasta que llegue el maestro.',
      pregunta: '¿Saltó el automático?',
      fotos: [0],
      otros: [],
      modelo: 'simulado',
    });
    const meta = await sharp(Buffer.from(recibidas[0], 'base64')).metadata();
    assert.equal(meta.format, 'jpeg');
    assert.equal(Math.max(meta.width, meta.height), 1568);
    assert.equal(meta.exif, undefined);
  });

  test('con confianza baja o sin un servicio reconocible, no preselecciona ninguno', async () => {
    usarAnalizadorFotos(async () => respuesta({ confianza: 'baja' }));
    let res = await analizar(cliente, [fotoGrande]);
    assert.equal(res.body.analisis.categoria, null);
    assert.equal(res.body.analisis.confianza, 'baja');

    usarAnalizadorFotos(async () => respuesta({ categoria: 'ninguna', confianza: 'media', descripcion: 'Se ve una mesa de madera.', peligro: null, pregunta: null }));
    res = await analizar(cliente, [fotoGrande]);
    assert.equal(res.body.analisis.categoria, null);
    assert.equal(res.body.analisis.descripcion, 'Se ve una mesa de madera.');
    assert.equal(res.body.analisis.peligro, null);
  });

  test('si el modelo declina analizarlas, responde sin propuesta; si falla, avisa sin romper la app', async () => {
    usarAnalizadorFotos(async () => null);
    let res = await analizar(cliente, [fotoGrande]);
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.analisis.categoria, res.body.analisis.descripcion], [null, '']);

    const error = console.error;
    console.error = () => {};
    try {
      usarAnalizadorFotos(async () => { throw new Error('tiempo de espera agotado'); });
      res = await analizar(cliente, [fotoGrande]);
    } finally {
      console.error = error;
    }
    assert.equal(res.status, 503);
    assert.equal(res.body.error.codigo, 'IA_NO_DISPONIBLE');
  });

  test('fotos con problemas de oficios distintos: separa un trabajo por oficio, con sus fotos', async () => {
    usarAnalizadorFotos(async () => respuesta({
      categoria: 'gasfiteria', descripcion: 'La llave del lavaplatos gotea.', peligro: null, pregunta: null,
      fotos_principal: [1],
      otros_trabajos: [
        { categoria: 'vidrieria', descripcion: 'El vidrio de la ventana está quebrado.', fotos: [2, 9] },
        { categoria: 'gasfiteria', descripcion: 'Repetido: mismo oficio que el principal', fotos: [3] },
      ],
    }));
    const res = await analizar(cliente, [fotoGrande, fotoGrande, fotoGrande]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const a = res.body.analisis;
    assert.deepEqual(a.categoria, { slug: 'gasfiteria', nombre: 'Gasfitería' });
    // La foto 3 no quedó en otro oficio válido: va con el principal. El número 9 no existe y se descarta.
    assert.deepEqual(a.fotos, [0, 2]);
    assert.deepEqual(a.otros, [{
      categoria: { slug: 'vidrieria', nombre: 'Vidriería' }, descripcion: 'El vidrio de la ventana está quebrado.', fotos: [1],
    }]);
  });

  test('si el trabajo principal no quedó claro pero hay otro identificado, ese pasa a ser el principal', async () => {
    usarAnalizadorFotos(async () => respuesta({
      categoria: 'ninguna', confianza: 'baja', descripcion: 'Una foto oscura.', fotos_principal: [1],
      otros_trabajos: [{ categoria: 'cerrajeria', descripcion: 'La chapa de la puerta está rota.', fotos: [2] }],
    }));
    const a = (await analizar(cliente, [fotoGrande, fotoGrande])).body.analisis;
    assert.deepEqual([a.categoria.slug, a.confianza, a.descripcion, a.fotos, a.otros], ['cerrajeria', 'media', 'La chapa de la puerta está rota.', [0, 1], []]);
  });

  test('acepta de 1 a 3 fotos válidas y solo de clientes', async () => {
    usarAnalizadorFotos(async (imagenes) => respuesta({ descripcion: `Revisé ${imagenes.length} fotos.` }));
    assert.equal((await analizar(cliente, [fotoGrande, fotoGrande, fotoGrande])).body.analisis.descripcion, 'Revisé 3 fotos.');
    assert.equal((await analizar(cliente, [])).status, 422);
    assert.equal((await analizar(cliente, [fotoGrande, fotoGrande, fotoGrande, fotoGrande])).status, 422);
    assert.equal((await analizar(cliente, [Buffer.from('esto no es una imagen, es solo texto de relleno '.repeat(5)).toString('base64')])).status, 422);
    assert.equal((await analizar(prestador, [fotoGrande])).status, 403);
  });
});

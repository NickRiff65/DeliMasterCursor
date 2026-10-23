import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Las fotos de prueba se guardan en una carpeta temporal, no en uploads/
process.env.CARPETA_BOLETAS = path.join(os.tmpdir(), `delimaster-boletas-${process.pid}`);

// "Foto" mínima: basta con la firma de un JPEG para la validación de tipo
const FOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');

describe('HU-09 · Panel contable del prestador', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarLector;
  let n = 0;
  let cliente, prestador, otroPrestador, solicitudId;
  const lector = { texto: '' };

  before(async () => {
    pool = await prepararBase();
    ({ usarLector } = await import('../src/modules/gastos/ocr.js'));
    usarLector({ nombre: 'simulado', leer: async () => ({ texto: lector.texto, confianzaLector: lector.confianza ?? 0.95 }) });
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => { usarLector(null); await pool.end(); });

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `g${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const subirBoleta = (u = prestador, imagen_base64 = FOTO) =>
    como(u)(request(app).post(`/api/solicitudes/${solicitudId}/boletas`)).send({ imagen_base64 });
  const crearGasto = (cuerpo, u = prestador) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}/gastos`)).send(cuerpo);

  beforeEach(async () => {
    await limpiarBase(pool);
    lector.texto = 'FERRETERIA\nSUBTOTAL 13.490\nIVA 2.360\nTOTAL $ 14.780';
    lector.confianza = 0.95;
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Juan Electricista');
    otroPrestador = await registrar('prestador', 'Otro');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto' });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: true, precio: 45000 });
  });

  test('la boleta se lee y propone el total; el gasto se crea al confirmar', async () => {
    const res = await subirBoleta();
    assert.equal(res.status, 201);
    assert.equal(res.body.monto_propuesto, 14780);
    assert.equal(res.body.revisar, false);
    assert.match(res.body.imagen_url, /\/boletas\/.+\/imagen\?vence=\d+&firma=[0-9a-f]+$/);
    assert.equal((await pool.query('SELECT 1 FROM gastos')).rowCount, 0);   // aún no hay gasto

    const gasto = await crearGasto({ monto: 14780, descripcion: 'Materiales', boleta_id: res.body.boleta_id });
    assert.equal(gasto.status, 201);
    assert.equal(gasto.body.gastos[0].origen, 'ocr');
    assert.deepEqual(gasto.body.resumen, {
      precio: 45000, comision: 5400, reembolsado: 0, ingreso_neto: 39600, gastos: 14780, gastos_rechazados: 0, ganancia_neta: 24820, ingreso_confirmado: false,
    });
  });

  test('si el prestador corrige el monto leído, queda como manual', async () => {
    const { body } = await subirBoleta();
    const gasto = await crearGasto({ monto: 15000, boleta_id: body.boleta_id });
    assert.equal(gasto.body.gastos[0].origen, 'manual');
    assert.equal(gasto.body.gastos[0].monto, 15000);
  });

  test('si la boleta no se lee bien, pide revisar y permite el ingreso manual', async () => {
    lector.texto = 'texto borroso sin montos';
    const ilegible = await subirBoleta();
    assert.equal(ilegible.body.monto_propuesto, null);
    assert.equal(ilegible.body.revisar, true);
    lector.texto = 'TOTAL 9.990';
    lector.confianza = 0.3;   // el lector dudó
    assert.equal((await subirBoleta()).body.revisar, true);
    const manual = await crearGasto({ monto: 8000, descripcion: 'Combustible motosierra' });
    assert.equal(manual.status, 201);
    assert.equal(manual.body.gastos[0].origen, 'manual');
  });

  test('una boleta no se puede registrar dos veces ni usar en otro trabajo', async () => {
    const { body } = await subirBoleta();
    await crearGasto({ monto: 14780, boleta_id: body.boleta_id });
    const otraVez = await crearGasto({ monto: 14780, boleta_id: body.boleta_id });
    assert.equal(otraVez.status, 409);
  });

  test('solo el prestador del trabajo, y después de aceptarlo', async () => {
    assert.equal((await subirBoleta(otroPrestador)).status, 404);
    assert.equal((await subirBoleta(cliente)).status, 403);
    await pool.query("UPDATE solicitudes SET estado = 'asignada' WHERE id = $1", [solicitudId]);
    assert.equal((await subirBoleta()).status, 409);
  });

  test('rechaza archivos que no son imágenes', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(200, 1)]).toString('base64');
    const res = await subirBoleta(prestador, pdf);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.codigo, 'IMAGEN_INVALIDA');
  });

  test('la imagen solo se entrega con un enlace firmado y vigente', async () => {
    const { body } = await subirBoleta();
    const ruta = new URL(body.imagen_url).pathname + new URL(body.imagen_url).search;
    const ok = await request(app).get(ruta);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers['content-type'], 'image/jpeg');
    assert.equal(ok.headers['cross-origin-resource-policy'], 'cross-origin'); // la app web la carga desde otro origen
    const sinFirma = await request(app).get(new URL(body.imagen_url).pathname);
    assert.equal(sinFirma.status, 403);
    const alterada = await request(app).get(ruta.replace(/firma=(.)/, (_, c) => `firma=${c === '0' ? '1' : '0'}`));
    assert.equal(alterada.status, 403);
  });

  test('eliminar un gasto elimina también su boleta', async () => {
    const { body } = await subirBoleta();
    const gasto = await crearGasto({ monto: 14780, boleta_id: body.boleta_id });
    const res = await como(prestador)(request(app).delete(`/api/gastos/${gasto.body.gastos[0].id}`));
    assert.equal(res.status, 204);
    assert.equal((await pool.query('SELECT 1 FROM boletas')).rowCount, 0);
    assert.equal((await como(otroPrestador)(request(app).delete(`/api/gastos/${randomUUID()}`))).status, 404);
  });

  test('con el pago hecho, la ganancia usa el neto real del ledger', async () => {
    await pool.query("UPDATE solicitudes SET estado = 'pagada' WHERE id = $1", [solicitudId]);
    const { rows: [pago] } = await pool.query(
      "INSERT INTO pagos (solicitud_id, orden_compra, monto, estado) VALUES ($1, 'OC-1', 45000, 'autorizado') RETURNING id", [solicitudId]);
    await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto)
       VALUES ($1, $2, $3, 45000, 5400, 39600)`, [solicitudId, pago.id, prestador.id]);
    await crearGasto({ monto: 10000 });
    const res = await como(prestador)(request(app).get(`/api/solicitudes/${solicitudId}/gastos`));
    assert.equal(res.body.resumen.ingreso_confirmado, true);
    assert.equal(res.body.resumen.ganancia_neta, 29600);
  });

  test('panel del mes: totales de ingresos, gastos y ganancia', async () => {
    // Los gastos se registran mientras se hace el trabajo; después se cierra
    await crearGasto({ monto: 5000, descripcion: 'Cadena motosierra' });
    await crearGasto({ monto: 2500, descripcion: 'Combustible' });
    await pool.query("UPDATE solicitudes SET estado = 'cerrada', cerrado_en = now() WHERE id = $1", [solicitudId]);
    const mes = new Date().toISOString().slice(0, 7);
    const res = await como(prestador)(request(app).get(`/api/prestadores/yo/finanzas?mes=${mes}`));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.totales, { trabajos: 1, ingreso_neto: 39600, gastos: 7500, ganancia_neta: 32100, por_cobrar: 0 });
    assert.equal(res.body.trabajos[0].cantidad_gastos, 2);
    const otroMes = await como(prestador)(request(app).get('/api/prestadores/yo/finanzas?mes=2020-01'));
    assert.equal(otroMes.body.totales.trabajos, 0);
    assert.equal((await como(prestador)(request(app).get('/api/prestadores/yo/finanzas?mes=13-2026'))).status, 422);
  });

  test('un gasto ingresado a mano queda sin boleta hasta que el maestro la adjunta', async () => {
    const gasto = await crearGasto({ monto: 8000, descripcion: 'Cuerda y clavos' });
    assert.equal(gasto.status, 201);
    assert.equal(gasto.body.gastos[0].con_boleta, false);
    const id = gasto.body.gastos[0].id;
    const adjuntar = (boletaId, u = prestador) =>
      como(u)(request(app).patch(`/api/gastos/${id}`)).send({ boleta_id: boletaId });

    const { body: boleta } = await subirBoleta();
    assert.equal((await adjuntar(boleta.boleta_id, otroPrestador)).status, 404);   // un gasto ajeno
    const res = await adjuntar(boleta.boleta_id);
    assert.equal(res.status, 200);
    assert.equal(res.body.gastos[0].con_boleta, true);
    assert.match(res.body.gastos[0].imagen_url, /\/boletas\/.+\/imagen\?vence=\d+&firma=/);
    assert.equal(res.body.gastos[0].monto, 8000);   // el monto ingresado no cambia

    // Ya tiene boleta: no se reemplaza, y una boleta usada no sirve para otro gasto
    const segundo = await crearGasto({ monto: 3000, descripcion: 'Bolsas' });
    assert.equal((await adjuntar(boleta.boleta_id)).body.error.codigo, 'YA_TIENE_BOLETA');
    const otro = await como(prestador)(request(app).patch(`/api/gastos/${segundo.body.gastos[1].id}`))
      .send({ boleta_id: boleta.boleta_id });
    assert.equal(otro.body.error.codigo, 'BOLETA_USADA');
  });

  test('el cliente ve los gastos en materiales, cuáles no tienen boleta y si puede apelarlos', async () => {
    const { body: boleta } = await subirBoleta();
    await crearGasto({ monto: 14780, descripcion: 'Materiales', boleta_id: boleta.boleta_id });
    await crearGasto({ monto: 5000, descripcion: 'Cuerda' });
    const ver = (u = cliente) => como(u)(request(app).get(`/api/solicitudes/${solicitudId}/materiales`));

    const res = await ver();
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.gastos.map((g) => [g.descripcion, g.con_boleta]), [['Materiales', true], ['Cuerda', false]]);
    assert.equal(res.body.total, 19780);
    assert.equal(res.body.sin_boleta, 1);
    assert.equal(res.body.puede_apelar, false);   // aún no paga: no hay nada que apelar
    assert.match(res.body.gastos[0].imagen_url, /\/boletas\//);
    assert.equal(res.body.gastos[1].imagen_url, null);

    await pool.query("UPDATE solicitudes SET estado = 'pagada' WHERE id = $1", [solicitudId]);
    assert.equal((await ver()).body.puede_apelar, true);
    // Solo el cliente de la solicitud
    assert.equal((await ver(prestador)).status, 403);
    const otroCliente = await registrar('cliente', 'Otra');
    assert.equal((await ver(otroCliente)).status, 404);
  });

  test('al marcar el trabajo como terminado, los gastos quedan fijos', async () => {
    const gasto = await crearGasto({ monto: 8000, descripcion: 'Cuerda' });
    const id = gasto.body.gastos[0].id;
    assert.equal(gasto.body.editable, true);
    await pool.query("UPDATE solicitudes SET estado = 'finalizada' WHERE id = $1", [solicitudId]);

    const nuevo = await crearGasto({ monto: 50000, descripcion: 'Gasto agregado después' });
    assert.equal(nuevo.status, 409);
    assert.equal(nuevo.body.error.codigo, 'GASTOS_CERRADOS');
    assert.equal((await subirBoleta()).status, 409);
    assert.equal((await como(prestador)(request(app).delete(`/api/gastos/${id}`))).status, 409);
    assert.equal((await como(prestador)(request(app).patch(`/api/gastos/${id}`)).send({ boleta_id: randomUUID() })).status, 409);

    // Se siguen viendo, sin poder modificarlos
    const resumen = await como(prestador)(request(app).get(`/api/solicitudes/${solicitudId}/gastos`));
    assert.equal(resumen.status, 200);
    assert.equal(resumen.body.editable, false);
    assert.deepEqual(resumen.body.gastos.map((g) => g.monto), [8000]);
  });
});

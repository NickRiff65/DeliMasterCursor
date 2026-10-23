import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('Avisos por correo de cada etapa de una solicitud', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarPasarela, usarTransporteCorreo, activarAvisos;
  let n = 0;
  let cliente, prestador, solicitudId;
  let correos = [];

  const simulada = {
    async crear({ ordenCompra, monto }) {
      simulada.ultima = { ordenCompra, monto };
      return { token: `tok-${randomUUID()}`, url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' };
    },
    async confirmar() {
      return { response_code: 0, status: 'AUTHORIZED', amount: simulada.ultima.monto, buy_order: simulada.ultima.ordenCompra, authorization_code: '1213' };
    },
    async reembolsar() { return { type: 'REVERSED' }; },
  };

  before(async () => {
    pool = await prepararBase();
    ({ usarPasarela } = await import('../src/modules/pagos/pasarela.js'));
    ({ usarTransporteCorreo } = await import('../src/utils/correo.js'));
    ({ activarAvisos } = await import('../src/utils/avisos.js'));
    usarPasarela(simulada);
    activarAvisos(true);
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => {
    activarAvisos(false);
    usarTransporteCorreo(null);
    usarPasarela(null);
    await pool.end();
  });

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `aviso${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token, email: `aviso${n}@test.cl` };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const post = (u, ruta, cuerpo = {}) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}${ruta}`)).send(cuerpo);

  // Los avisos salen después de responder: se espera a que lleguen
  async function esperarCorreos(cantidad) {
    for (let i = 0; i < 100 && correos.length < cantidad; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(correos.length, cantidad, JSON.stringify(correos.map((c) => c.asunto)));
    return correos;
  }

  beforeEach(async () => {
    await limpiarBase(pool);
    correos = [];
    usarTransporteCorreo(async (m) => { correos.push(m); });
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto' });
  });

  test('el maestro recibe un aviso cuando lo eligen, y el cliente cuando acepta (publicar no avisa)', async () => {
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(correos.length, 0);

    await post(cliente, '/asignar', { prestador_id: prestador.id });
    const [alMaestro] = await esperarCorreos(1);
    assert.equal(alMaestro.para, prestador.email);
    assert.equal(alMaestro.asunto, 'DeliMaster · Tienes una nueva solicitud');
    assert.match(alMaestro.texto, /^Hola, Luis:/);
    assert.match(alMaestro.texto, /Ana te eligió para este trabajo en Chillán/);

    await post(prestador, '/responder', { aceptar: true, precio: 45000 });
    const [, alCliente] = await esperarCorreos(2);
    assert.equal(alCliente.para, cliente.email);
    assert.equal(alCliente.asunto, 'DeliMaster · El maestro aceptó tu solicitud');
    assert.match(alCliente.texto, /Luis Poda aceptó tu solicitud por \$45\.000/);
    // Nunca se comparten datos de contacto de la otra parte
    assert.equal(alCliente.texto.includes(prestador.email), false);
  });

  test('si el maestro rechaza, el cliente sabe que puede elegir otro', async () => {
    await post(cliente, '/asignar', { prestador_id: prestador.id });
    await post(prestador, '/responder', { aceptar: false });
    const [, aviso] = await esperarCorreos(2);
    assert.equal(aviso.para, cliente.email);
    assert.equal(aviso.asunto, 'DeliMaster · Tu solicitud vuelve a estar disponible');
    assert.match(aviso.texto, /El maestro rechazó el trabajo/);
  });

  test('pagos y término: el maestro sabe que le pagaron y el cliente que el trabajo terminó', async () => {
    await post(cliente, '/asignar', { prestador_id: prestador.id });
    await post(prestador, '/responder', { aceptar: true, precio: 45000 });
    const pago = await post(cliente, '/pago', { volver_a: 'http://127.0.0.1:8081/solicitud/x' }).set('Host', '127.0.0.1:3000');
    const token = decodeURIComponent(pago.body.url_pago.split('/ir/')[1]);
    await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    const [, , pagado] = await esperarCorreos(3);
    assert.equal(pagado.para, prestador.email);
    assert.equal(pagado.asunto, 'DeliMaster · El cliente pagó el trabajo');

    await post(prestador, '/finalizar');
    const terminado = (await esperarCorreos(4))[3];
    assert.equal(terminado.para, cliente.email);
    assert.equal(terminado.asunto, 'DeliMaster · El maestro terminó el trabajo');

    await post(cliente, '/cerrar');
    const cerrado = (await esperarCorreos(5))[4];
    assert.equal(cerrado.para, prestador.email);
    assert.match(cerrado.asunto, /tu pago fue liberado/);
  });

  test('si el correo falla, la operación igual se completa', async () => {
    const error = console.error;
    const registros = [];
    console.error = (m) => registros.push(m);
    usarTransporteCorreo(async () => { throw new Error('SMTP caído'); });
    try {
      const res = await post(cliente, '/asignar', { prestador_id: prestador.id });
      assert.equal(res.status, 200);
      assert.equal(res.body.solicitud.estado, 'asignada');
      for (let i = 0; i < 100 && !registros.length; i++) await new Promise((r) => setTimeout(r, 20));
      assert.match(registros[0], /No se pudo enviar el aviso "asignada".*SMTP caído/);
    } finally {
      console.error = error;
    }
  });
});

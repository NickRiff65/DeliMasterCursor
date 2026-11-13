import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('Panel de administración (HU-13, HU-14, HU-16)', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarPasarela, firmarToken;
  let n = 0;
  let cliente, prestador, otroPrestador, admin;

  // Pasarela simulada: registra los reembolsos y puede fallar a pedido
  const simulada = {
    reembolsos: [],
    falla: false,
    async crear() { return { token: 'tok', url: 'https://webpay.test' }; },
    async confirmar() { return null; },
    async reembolsar(token, monto) {
      if (simulada.falla) throw new Error('Transbank no disponible');
      simulada.reembolsos.push({ token, monto });
      return { type: 'REVERSED' };
    },
  };

  before(async () => {
    pool = await prepararBase();
    ({ usarPasarela } = await import('../src/modules/pagos/pasarela.js'));
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
    usarPasarela(simulada);
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => { usarPasarela(null); await pool.end(); });

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `a${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán', telefono: '+56911112222' });
    return { id: body.usuario.id, token: body.token, email: `a${n}@test.cl` };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const comoAdmin = (req) => req.set('Authorization', `Bearer ${admin.token}`);
  const accion = (u, id, nombre, cuerpo = {}) => como(u)(request(app).post(`/api/solicitudes/${id}/${nombre}`)).send(cuerpo);

  // Solicitud pagada de `p`, con el monto retenido en el ledger (como la deja Webpay)
  async function solicitudPagada(p = prestador, precio = 40000) {
    // La regla de ayudantía (máx. 1 solicitud por día por cliente) contaría las anteriores
    // de esta misma prueba: se corre un día atrás la fecha de creación de las que ya
    // armó este cliente, sin tocar sus estados ni montos.
    await pool.query(
      `UPDATE solicitudes SET creado_en = creado_en - interval '1 day'
        WHERE cliente_id = $1
          AND (creado_en AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date`,
      [cliente.id]);
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id, descripcion: 'Necesito podar un árbol alto' });
    await accion(cliente, id, 'asignar', { prestador_id: p.id });
    await accion(p, id, 'responder', { aceptar: true, precio });
    await pool.query("UPDATE solicitudes SET estado = 'pagada' WHERE id = $1", [id]);
    const { rows: [pago] } = await pool.query(
      `INSERT INTO pagos (solicitud_id, orden_compra, token_webpay, monto, estado)
       VALUES ($1, $2, $3, $4, 'autorizado') RETURNING id`,
      [id, `OC-${randomUUID().slice(0, 8)}`, `tok-${id.slice(0, 8)}`, precio]);
    const comision = Math.round(precio * 0.12);
    await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto)
       VALUES ($1, $2, $3, $4, $5, $6)`, [id, pago.id, p.id, precio, comision, precio - comision]);
    return id;
  }
  async function enDisputa(p = prestador) {
    const id = await solicitudPagada(p);
    await accion(p, id, 'finalizar');
    await accion(cliente, id, 'reportar', { motivo: 'El árbol quedó a medio podar y no volvió' });
    return id;
  }
  async function cerrada(p = prestador) {
    const id = await solicitudPagada(p);
    await accion(p, id, 'finalizar');
    await accion(cliente, id, 'cerrar');
    return id;
  }
  const ledger = async (id) => (await pool.query(
    'SELECT id, estado, comprobante, monto_neto FROM ledger_movimientos WHERE solicitud_id = $1', [id])).rows[0];
  const DATOS_PAGO = { rut: '12.345.678-5', banco: 'BancoEstado', tipo_cuenta: 'CuentaRUT', numero_cuenta: '12345678' };

  beforeEach(async () => {
    await limpiarBase(pool);
    simulada.reembolsos = [];
    simulada.falla = false;
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    otroPrestador = await registrar('prestador', 'Pedro Poda');
    for (const p of [prestador, otroPrestador]) {
      await como(p)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    }
    // Los administradores no se registran por la API; se crean directamente
    const { rows } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Equipo', 'admin@test.cl', 'x') RETURNING id, rol");
    admin = { id: rows[0].id, token: firmarToken(rows[0]) };
  });

  test('solo un administrador puede usar el panel', async () => {
    for (const ruta of ['/api/admin/resumen', '/api/admin/disputas', '/api/admin/liquidaciones', '/api/admin/moderacion']) {
      assert.equal((await como(cliente)(request(app).get(ruta))).status, 403, ruta);
      assert.equal((await request(app).get(ruta)).status, 401, ruta);
      assert.equal((await comoAdmin(request(app).get(ruta))).status, 200, ruta);
    }
  });

  // ------------------------------------------------------------------ HU-16: disputas
  test('el administrador ve la disputa con toda la evidencia, incluidos los mensajes bloqueados', async () => {
    const id = await enDisputa();
    await pool.query(
      `INSERT INTO mensajes (solicitud_id, emisor_id, contenido, bloqueado, motivo_bloqueo)
       VALUES ($1, $2, 'mi número es nueve uno dos...', true, 'telefono'), ($1, $3, 'Mañana termino', false, NULL)`,
      [id, prestador.id, cliente.id]);

    const lista = await comoAdmin(request(app).get('/api/admin/disputas'));
    assert.equal(lista.body.disputas.length, 1);
    assert.equal(lista.body.disputas[0].motivo_disputa, 'El árbol quedó a medio podar y no volvió');
    assert.equal(lista.body.disputas[0].estado_pago, 'retenido');

    const { body } = await comoAdmin(request(app).get(`/api/admin/solicitudes/${id}`));
    assert.equal(body.solicitud.estado, 'en_disputa');
    assert.equal(body.solicitud.mensajes.length, 2);
    assert.equal(body.solicitud.mensajes[0].bloqueado, true);     // el equipo sí ve lo bloqueado
    assert.equal(body.solicitud.mensajes[0].emisor, 'prestador');
    assert.equal(body.solicitud.cliente.telefono, '+56911112222'); // y puede contactar a las partes
    assert.equal(body.solicitud.ledger.estado, 'retenido');
    assert.ok(body.solicitud.eventos.some((e) => e.estado_nuevo === 'en_disputa'));
  });

  test('liberar: el trabajo se cierra, el pago queda liberado y el cliente puede calificar', async () => {
    const id = await enDisputa();
    const corta = await comoAdmin(request(app).post(`/api/admin/disputas/${id}/resolver`)).send({ decision: 'liberar', observacion: 'ok' });
    assert.equal(corta.status, 422);   // la decisión debe quedar justificada

    const res = await comoAdmin(request(app).post(`/api/admin/disputas/${id}/resolver`))
      .send({ decision: 'liberar', observacion: 'Las fotos muestran el trabajo terminado' });
    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.estado, 'cerrada');
    assert.equal((await ledger(id)).estado, 'liberado');
    assert.equal(simulada.reembolsos.length, 0);
    const evento = res.body.solicitud.eventos.at(-1);
    assert.match(evento.detalle, /a favor del prestador/);
    assert.equal((await accion(cliente, id, 'resena', { estrellas: 3 })).status, 201);

    // No se puede resolver dos veces
    const otra = await comoAdmin(request(app).post(`/api/admin/disputas/${id}/resolver`))
      .send({ decision: 'reembolsar', observacion: 'Cambio de opinión del equipo' });
    assert.equal(otra.status, 409);
    const resueltas = await comoAdmin(request(app).get('/api/admin/disputas?estado=resueltas'));
    assert.equal(resueltas.body.disputas[0].resultado, 'cerrada');
    assert.equal(resueltas.body.disputas[0].resuelta_por, 'Equipo');
  });

  test('reembolsar: Webpay devuelve el monto completo y la solicitud se cancela', async () => {
    const id = await enDisputa();
    const res = await comoAdmin(request(app).post(`/api/admin/disputas/${id}/resolver`))
      .send({ decision: 'reembolsar', observacion: 'El prestador no terminó el trabajo' });
    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.estado, 'cancelada');
    assert.deepEqual(simulada.reembolsos, [{ token: `tok-${id.slice(0, 8)}`, monto: 40000 }]);
    assert.equal((await ledger(id)).estado, 'reembolsado');
    const { rows: [pago] } = await pool.query('SELECT estado FROM pagos WHERE solicitud_id = $1', [id]);
    assert.equal(pago.estado, 'anulado');
    const { rows: eventos } = await pool.query(
      "SELECT actor_id FROM ledger_eventos WHERE estado_nuevo = 'reembolsado'");
    assert.equal(eventos[0].actor_id, admin.id);   // queda quién lo decidió
  });

  test('devolución parcial: se devuelve una parte al cliente, el resto se libera al maestro y el trabajo se cierra', async () => {
    const id = await enDisputa();
    // Gastos del maestro: uno con boleta y otro sin ella (el equipo los ve en el detalle)
    await pool.query(
      `INSERT INTO gastos (solicitud_id, prestador_id, monto, descripcion, origen) VALUES ($1, $2, 6000, 'Cuerda', 'manual')`,
      [id, prestador.id]);
    const detalle = await comoAdmin(request(app).get(`/api/admin/solicitudes/${id}`));
    assert.deepEqual(detalle.body.solicitud.gastos.map((g) => [g.descripcion, g.con_boleta]), [['Cuerda', false]]);

    const resolver = (cuerpo) => comoAdmin(request(app).post(`/api/admin/disputas/${id}/resolver`))
      .send({ decision: 'parcial', observacion: 'La cuerda no tiene boleta: se devuelve al cliente', ...cuerpo });
    assert.equal((await resolver({})).status, 422);                                    // falta el monto
    assert.match((await resolver({ monto_reembolso: 40000 })).body.error.campos.monto_reembolso, /elige «Reembolsar»/);

    const res = await resolver({ monto_reembolso: 6000 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.solicitud.estado, 'cerrada');
    assert.equal(res.body.solicitud.monto_reembolsado, 6000);
    assert.deepEqual(simulada.reembolsos, [{ token: `tok-${id.slice(0, 8)}`, monto: 6000 }]);

    // El maestro recibe lo que queda, con la comisión calculada sobre eso
    const { rows: [mov] } = await pool.query(
      'SELECT estado, monto_bruto, monto_reembolsado, comision, monto_neto FROM ledger_movimientos WHERE solicitud_id = $1', [id]);
    assert.deepEqual(mov, { estado: 'liberado', monto_bruto: 40000, monto_reembolsado: 6000, comision: 4080, monto_neto: 29920 });
    const { rows: [pago] } = await pool.query('SELECT estado FROM pagos WHERE solicitud_id = $1', [id]);
    assert.equal(pago.estado, 'autorizado');   // el pago sigue vigente: solo se devolvió una parte
    const { rows: eventos } = await pool.query(
      `SELECT le.estado_nuevo, le.monto, le.detalle FROM ledger_eventos le JOIN ledger_movimientos lm ON lm.id = le.movimiento_id
        WHERE lm.solicitud_id = $1 ORDER BY le.id`, [id]);
    assert.deepEqual(eventos.slice(-2), [
      { estado_nuevo: 'reembolsado', monto: 6000, detalle: 'Devolución parcial al cliente' },
      { estado_nuevo: 'liberado', monto: 29920, detalle: null },
    ]);

    // El resumen del equipo cuenta la devolución
    const resumen = await comoAdmin(request(app).get('/api/admin/resumen'));
    assert.equal(resumen.body.dinero.reembolsado, 6000);
  });

  test('si Transbank rechaza el reembolso, la disputa sigue abierta y el dinero retenido', async () => {
    const id = await enDisputa();
    simulada.falla = true;
    const res = await comoAdmin(request(app).post(`/api/admin/disputas/${id}/resolver`))
      .send({ decision: 'reembolsar', observacion: 'El prestador no terminó el trabajo' });
    assert.equal(res.status, 502);
    assert.equal(res.body.error.codigo, 'REEMBOLSO_FALLIDO');
    const { rows: [s] } = await pool.query('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    assert.equal(s.estado, 'en_disputa');
    assert.equal((await ledger(id)).estado, 'retenido');
  });

  test('no se puede resolver una solicitud que no está en disputa', async () => {
    const id = await solicitudPagada();
    const res = await comoAdmin(request(app).post(`/api/admin/disputas/${id}/resolver`))
      .send({ decision: 'liberar', observacion: 'No corresponde resolver esto' });
    assert.equal(res.status, 409);
  });

  // ------------------------------------------------------------------ HU-13: datos bancarios y transferencias
  test('el prestador registra sus datos bancarios con un RUT válido', async () => {
    const malo = await como(prestador)(request(app).put('/api/prestadores/yo/datos-pago')).send({ ...DATOS_PAGO, rut: '12.345.678-9' });
    assert.equal(malo.status, 422);
    assert.ok(malo.body.error.campos.rut);
    const ok = await como(prestador)(request(app).put('/api/prestadores/yo/datos-pago')).send({ ...DATOS_PAGO, numero_cuenta: '1234-5678' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.datos_pago.rut, '12345678-5');
    assert.equal(ok.body.datos_pago.numero_cuenta, '12345678');
    assert.equal(ok.body.datos_pago.completos, true);
    // El cliente nunca ve estos datos
    assert.equal((await como(cliente)(request(app).get('/api/prestadores/yo/datos-pago'))).status, 403);
    const perfil = await request(app).get(`/api/prestadores/${prestador.id}`);
    assert.equal(perfil.body.prestador.numero_cuenta, undefined);
  });

  test('transferencia: los pagos liberados pasan a transferidos con su comprobante', async () => {
    const a = await cerrada();
    const b = await cerrada();
    const c = await cerrada(otroPrestador);
    const { body } = await comoAdmin(request(app).get('/api/admin/liquidaciones'));
    const deLuis = body.pendientes.find((p) => p.prestador_id === prestador.id);
    assert.equal(deLuis.cantidad, 2);
    assert.equal(deLuis.total, 2 * 35200);
    assert.equal(deLuis.datos_completos, false);

    const movs = deLuis.movimientos.map((m) => m.id);
    const sinDatos = await comoAdmin(request(app).post(`/api/admin/liquidaciones/${prestador.id}`))
      .send({ movimientos: movs, comprobante: 'TRF-0001' });
    assert.equal(sinDatos.status, 422);
    assert.equal(sinDatos.body.error.codigo, 'DATOS_BANCARIOS_INCOMPLETOS');

    await como(prestador)(request(app).put('/api/prestadores/yo/datos-pago')).send(DATOS_PAGO);
    // Todos o ninguno: un pago de otro prestador invalida el registro completo
    const ajeno = (await ledger(c)).id;
    const mezcla = await comoAdmin(request(app).post(`/api/admin/liquidaciones/${prestador.id}`))
      .send({ movimientos: [...movs, ajeno], comprobante: 'TRF-0001' });
    assert.equal(mezcla.status, 409);
    assert.equal((await ledger(a)).estado, 'liberado');

    const res = await comoAdmin(request(app).post(`/api/admin/liquidaciones/${prestador.id}`))
      .send({ movimientos: movs, comprobante: 'TRF-0001' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.transferencia, { comprobante: 'TRF-0001', cantidad: 2, total: 70400 });
    for (const id of [a, b]) {
      const l = await ledger(id);
      assert.equal(l.estado, 'transferido');
      assert.equal(l.comprobante, 'TRF-0001');
    }
    // No se puede transferir dos veces el mismo pago
    const repetida = await comoAdmin(request(app).post(`/api/admin/liquidaciones/${prestador.id}`))
      .send({ movimientos: movs, comprobante: 'TRF-0002' });
    assert.equal(repetida.status, 409);

    const despues = await comoAdmin(request(app).get('/api/admin/liquidaciones'));
    assert.deepEqual(despues.body.pendientes.map((p) => p.prestador_id), [otroPrestador.id]);
    assert.equal(despues.body.historial[0].comprobante, 'TRF-0001');
    assert.equal(despues.body.historial[0].total, 70400);
  });

  // ------------------------------------------------------------------ moderación
  test('moderación: marca a quien insiste en compartir contactos y permite desactivar su cuenta', async () => {
    const id = await solicitudPagada();
    for (let i = 0; i < 3; i++) {
      await pool.query(
        `INSERT INTO mensajes (solicitud_id, emisor_id, contenido, bloqueado, motivo_bloqueo)
         VALUES ($1, $2, $3, true, 'telefono,pago_externo')`, [id, prestador.id, `intento ${i}`]);
    }
    const { body } = await comoAdmin(request(app).get('/api/admin/moderacion'));
    const luis = body.usuarios.find((u) => u.id === prestador.id);
    assert.equal(luis.bloqueados, 3);
    assert.equal(luis.revisar, true);
    assert.deepEqual([...luis.motivos].sort(), ['pago_externo', 'telefono']);

    const sinMotivo = await comoAdmin(request(app).patch(`/api/admin/usuarios/${prestador.id}`)).send({ activo: false });
    assert.equal(sinMotivo.status, 422);
    const res = await comoAdmin(request(app).patch(`/api/admin/usuarios/${prestador.id}`))
      .send({ activo: false, motivo: 'Insiste en pagos por fuera de la plataforma' });
    assert.equal(res.status, 200);
    assert.equal(res.body.usuario.activo, false);

    // Su sesión abierta deja de funcionar de inmediato y no puede volver a entrar
    const yo = await como(prestador)(request(app).get('/api/prestadores/yo'));
    assert.equal(yo.status, 401);
    assert.equal(yo.body.error.codigo, 'CUENTA_DESACTIVADA');
    const login = await request(app).post('/api/auth/login').send({ email: prestador.email, password: 'clave1234', acepta_terminos: true });
    assert.notEqual(login.status, 200);

    // Se puede reactivar
    await comoAdmin(request(app).patch(`/api/admin/usuarios/${prestador.id}`)).send({ activo: true });
    assert.equal((await como(prestador)(request(app).get('/api/prestadores/yo'))).status, 200);
    // Un administrador no puede desactivar su propia cuenta
    assert.equal((await comoAdmin(request(app).patch(`/api/admin/usuarios/${admin.id}`))
      .send({ activo: false, motivo: 'prueba de seguridad' })).status, 422);
  });

  // ------------------------------------------------------------------ HU-14: métricas
  test('el resumen calcula los indicadores del informe y los pendientes del equipo', async () => {
    await cerrada();
    await cerrada();
    await enDisputa();
    const { body } = await comoAdmin(request(app).get('/api/admin/resumen'));
    assert.equal(body.usuarios.clientes, 1);
    assert.equal(body.usuarios.prestadores, 2);
    assert.equal(body.pendientes.disputas, 1);
    assert.equal(body.pendientes.prestadores_por_pagar, 1);
    assert.equal(body.dinero.por_transferir, 2 * 35200);
    assert.equal(body.dinero.retenido, 40000);
    assert.equal(body.dinero.comisiones, 2 * 4800);
    assert.equal(body.cerrados_por_mes.length, 6);
    assert.equal(body.cerrados_por_mes.at(-1).cerrados, 2);

    const kpi = Object.fromEntries(body.indicadores.map((k) => [k.id, k]));
    assert.equal(kpi.conversion.valor, 100);              // 3 asignadas, 3 pagadas
    assert.equal(kpi.disputas.valor, 33.3);               // 1 de 3 servicios terminados
    assert.equal(kpi.disputas.cumple, false);
    assert.equal(kpi.panel_contable.valor, 0);
    assert.equal(kpi.reputacion.valor, null);             // aún sin reseñas: no se puede medir
    assert.equal(kpi.reputacion.cumple, null);
  });
});

import { screen, userEvent } from 'expo-router/testing-library';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -36.6066, longitude: -72.1034, accuracy: 12 } })),
  Accuracy: { High: 4 },
}));
import DetalleSolicitud from '../src/app/solicitud/[id]';
import DetalleTrabajo from '../src/app/trabajo/[id]';
import { abrirApp, simularApi, errorApi, sesionGuardada, usarVariante, cliente, prestador } from './ayudas';

// Modalidad "visita + cotización" en las pantallas del cliente (Lite) y del prestador (Pro)
const ID = '11111111-2222-4333-8444-555555555555';
const base = {
  id: ID, categoria: 'electricidad', categoria_nombre: 'Electricidad', descripcion: 'Saltó el automático y no vuelve',
  comuna: 'Chillán', creado_en: '2026-10-10T12:00:00Z', modalidad: 'visita', tarifa_visita: 25_000,
  visita_programada_en: '2026-10-11T13:00:00Z', cliente: { id: 'c1', nombre: 'Valentina' },
  prestador: { id: 'p1', nombre: 'María González' }, eventos: [],
};
const cotizacion = { id: 'q1', mano_obra: 100_000, materiales: 20_000, total: 120_000, detalle: 'Cambio de tablero y dos automáticos', estado: 'pendiente' };

async function abrirComoCliente(solicitud, extra = {}) {
  sesionGuardada();
  const llamadas = simularApi({ 'GET /auth/yo': { usuario: cliente }, [`GET /solicitudes/${ID}`]: { solicitud }, ...extra });
  await abrirApp({ ruta: `/solicitud/${ID}`, pantallas: { 'solicitud/[id]': DetalleSolicitud } });
  return llamadas;
}

async function abrirComoPrestador(solicitud, extra = {}) {
  usarVariante('pro');
  sesionGuardada();
  const llamadas = simularApi({ 'GET /auth/yo': { usuario: prestador }, [`GET /solicitudes/${ID}`]: { solicitud }, ...extra });
  await abrirApp({ ruta: `/trabajo/${ID}`, pantallas: { 'trabajo/[id]': DetalleTrabajo } });
  return llamadas;
}

describe('Cliente (Lite)', () => {
  test('con la visita por pagar, ofrece pagar la tarifa y explica que se descuenta del total', async () => {
    await abrirComoCliente({ ...base, estado: 'visita_por_pagar' });
    expect(await screen.findByRole('button', { name: 'Pagar visita $25.000 con Webpay' })).toBeOnTheScreen();
    expect(screen.getByText(/la visita se descuenta del total/)).toBeOnTheScreen();
  });

  test('con la visita pagada muestra el código de llegada dígito por dígito', async () => {
    await abrirComoCliente({ ...base, estado: 'visita_pagada', codigo_llegada: '4821', reclamo_no_llego_desde: '2099-01-01T00:00:00Z' });
    expect(await screen.findByLabelText('Código de llegada 4 8 2 1')).toBeOnTheScreen();
    expect(screen.getByText('8')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'No llegó: devolverme la visita' })).not.toBeOnTheScreen();
  });

  test('pasada la tolerancia, puede pedir que le devuelvan la visita', async () => {
    const llamadas = await abrirComoCliente(
      { ...base, estado: 'visita_pagada', codigo_llegada: '4821', reclamo_no_llego_desde: '2020-01-01T00:00:00Z' },
      { [`POST /solicitudes/${ID}/no-llego`]: { solicitud: { ...base, estado: 'cancelada', estado_visita: 'reembolsado' } } });
    await userEvent.setup().press(await screen.findByRole('button', { name: 'No llegó: devolverme la visita' }));
    expect(await screen.findByText('Te devolvimos la visita')).toBeOnTheScreen();
    expect(llamadas.some((l) => l.ruta === `/solicitudes/${ID}/no-llego`)).toBe(true);
  });

  test('revisa la cotización con el saldo descontado y la acepta', async () => {
    const llamadas = await abrirComoCliente({ ...base, estado: 'cotizada', cotizacion }, {
      [`POST /solicitudes/${ID}/cotizacion/respuesta`]: {
        solicitud: { ...base, estado: 'confirmada', precio_acordado: 120_000, monto_por_pagar: 95_000, cotizacion: { ...cotizacion, estado: 'aceptada' } },
      },
    });
    expect(await screen.findByText('Saldo por pagar')).toBeOnTheScreen();
    expect(screen.getByText('−$25.000')).toBeOnTheScreen();
    expect(screen.getByText('$95.000')).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Aceptar y pagar $95.000' }));
    expect(await screen.findByRole('button', { name: 'Pagar $95.000 con Webpay' })).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ aceptar: true, cotizacion_id: 'q1' });
  });

  test('si el maestro corrigió la cotización, lo muestra con el monto anterior', async () => {
    await abrirComoCliente({ ...base, estado: 'cotizada', cotizacion: { ...cotizacion, total_anterior: 150_000 } });
    expect(await screen.findByText('✏️ María corrigió la cotización: antes era $150.000.')).toBeOnTheScreen();
  });

  test('si la cotización cambió mientras la miraba, no la acepta a ciegas y muestra la nueva', async () => {
    let corregida = false;
    await abrirComoCliente(undefined, {
      [`GET /solicitudes/${ID}`]: () => ({ solicitud: corregida
        ? { ...base, estado: 'cotizada', cotizacion: { ...cotizacion, id: 'q2', mano_obra: 80_000, total: 100_000, total_anterior: 120_000 } }
        : { ...base, estado: 'cotizada', cotizacion } }),
      [`POST /solicitudes/${ID}/cotizacion/respuesta`]: () => {
        corregida = true;
        return errorApi(409, 'COTIZACION_CAMBIO', 'El maestro corrigió la cotización: ahora es de $100.000. Revísala antes de responder.');
      },
    });
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Aceptar y pagar $95.000' }));
    expect(await screen.findByText(/El maestro corrigió la cotización: ahora es de \$100\.000/)).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: 'Aceptar y pagar $75.000' })).toBeOnTheScreen();
  });

  test('con la disputa resuelta en parte, cuenta cuánto se le devolvió', async () => {
    await abrirComoCliente({ ...base, estado: 'cerrada', precio_acordado: 120_000, monto_reembolsado: 8_000, resena: { estrellas: 4 } });
    expect(await screen.findByText(/te devolvió \$8\.000 a la tarjeta con que pagaste/)).toBeOnTheScreen();
  });

  test('rechazar la cotización pide confirmación y avisa que la visita queda para el prestador', async () => {
    const llamadas = await abrirComoCliente({ ...base, estado: 'cotizada', cotizacion }, {
      [`POST /solicitudes/${ID}/cotizacion/respuesta`]: { solicitud: { ...base, estado: 'cancelada', cotizacion: { ...cotizacion, estado: 'rechazada' } } },
    });
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Rechazar' }));
    expect(screen.getByText(/la visita queda para María por el diagnóstico/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Sí, rechazar la cotización' }));
    expect(await screen.findByText('Rechazaste la cotización')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ aceptar: false, cotizacion_id: 'q1' });
  });
});

describe('Prestador (Pro)', () => {
  test('al aceptar con visita exige tarifa y horario, y envía la modalidad elegida', async () => {
    const llamadas = await abrirComoPrestador(
      { ...base, modalidad: 'precio_cerrado', tarifa_visita: null, estado: 'asignada',
        responder_antes_de: '2099-01-01T00:00:00Z', rango_visita: { min: 15_000, max: 35_000, zona: 'urbana' } },
      { [`POST /solicitudes/${ID}/responder`]: { solicitud: { ...base, estado: 'visita_por_pagar' } } });
    const user = userEvent.setup();
    expect(await screen.findByText(/entre \$15\.000 y \$35\.000/)).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '🔍 Visita + cotización' })).toBeChecked();

    await user.press(screen.getByRole('button', { name: 'Aceptar trabajo' }));
    expect(screen.getByText('Indica cuánto cobras por la visita')).toBeOnTheScreen();
    expect(screen.getByText('Elige el día y la hora de la visita')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Tarifa de la visita (CLP)'), '25000');
    await user.press(screen.getByRole('button', { name: 'Mañana' }));
    await user.press(screen.getByRole('button', { name: '10:00' }));
    await user.press(screen.getByRole('button', { name: 'Aceptar trabajo' }));

    expect(await screen.findByText(/Esperando que Valentina pague la visita/)).toBeOnTheScreen();
    const cuerpo = llamadas.find((l) => l.metodo === 'POST').cuerpo;
    expect(cuerpo).toMatchObject({ aceptar: true, modalidad: 'visita', tarifa_visita: 25_000 });
    expect(new Date(cuerpo.visita_programada_en).getHours()).toBe(10);
  });

  test('ingresa el código del cliente para confirmar la llegada; un código incorrecto se explica junto al campo', async () => {
    let intentos = 0;
    const llamadas = await abrirComoPrestador({ ...base, estado: 'visita_pagada' }, {
      [`POST /solicitudes/${ID}/llegada`]: () => (++intentos === 1
        ? errorApi(422, 'CODIGO_INCORRECTO', 'Código incorrecto', { codigo: 'Código incorrecto. Te quedan 4 intentos.' })
        : { solicitud: { ...base, estado: 'en_diagnostico' } }),
    });
    const user = userEvent.setup();
    const campo = await screen.findByLabelText('Código del cliente');
    await user.type(campo, '12a345');
    expect(campo).toHaveDisplayValue('1234');                 // solo 4 dígitos
    await user.press(screen.getByRole('button', { name: 'Confirmar llegada' }));
    expect(await screen.findByText('Código incorrecto. Te quedan 4 intentos.')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Confirmar llegada' }));
    expect(await screen.findByText(/la visita \(\$25\.000\) ya es tuya/)).toBeOnTheScreen();
    expect(llamadas.filter((l) => l.metodo === 'POST').map((l) => l.cuerpo)).toEqual([{ codigo: '1234' }, { codigo: '1234' }]);
  });

  test('si el cliente dejó el punto, la llegada envía la ubicación del maestro', async () => {
    const llamadas = await abrirComoPrestador(
      { ...base, estado: 'visita_pagada', latitud: -36.6066, longitud: -72.1034 },
      { [`POST /solicitudes/${ID}/llegada`]: { solicitud: { ...base, estado: 'en_diagnostico', tarifa_visita: 25_000 } } },
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Código del cliente'), '4821');
    expect(screen.getByText(/confirmamos que estás en el lugar/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Confirmar llegada' }));
    expect(await screen.findByText(/ya es tuya/)).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({
      codigo: '4821', latitud: -36.6066, longitud: -72.1034,
    });
  });

  test('arma la cotización viendo el saldo que pagará el cliente y la envía', async () => {
    const llamadas = await abrirComoPrestador({ ...base, estado: 'en_diagnostico' }, {
      [`POST /solicitudes/${ID}/cotizacion`]: { solicitud: { ...base, estado: 'cotizada', cotizacion } },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Mano de obra (CLP)'), '100000');
    await user.type(screen.getByLabelText('Materiales (CLP, opcional)'), '20.000');
    await user.type(screen.getByLabelText('¿Qué incluye el trabajo?'), 'Cambio de tablero y dos automáticos');
    expect(screen.getByText('$95.000')).toBeOnTheScreen();    // 120.000 − 25.000 de visita
    await user.press(screen.getByRole('button', { name: 'Enviar cotización' }));

    expect(await screen.findByText(/Cotización enviada · esperando a Valentina/)).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({
      mano_obra: 100_000, materiales: 20_000, detalle: 'Cambio de tablero y dos automáticos',
    });
  });

  test('corrige la cotización enviada mientras el cliente no responde', async () => {
    const llamadas = await abrirComoPrestador({ ...base, estado: 'cotizada', cotizacion }, {
      [`POST /solicitudes/${ID}/cotizacion`]: (cuerpo) => ({ solicitud: {
        ...base, estado: 'cotizada',
        cotizacion: { ...cotizacion, id: 'q2', ...cuerpo, total: cuerpo.mano_obra + cuerpo.materiales, total_anterior: 120_000 },
      } }),
    });
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: '✏️ Corregir cotización' }));
    // El formulario parte con la cotización enviada
    const manoObra = screen.getByLabelText('Mano de obra (CLP)');
    expect(manoObra).toHaveDisplayValue('100000');
    expect(screen.getByLabelText('¿Qué incluye el trabajo?')).toHaveDisplayValue('Cambio de tablero y dos automáticos');
    await user.clear(manoObra);
    await user.type(manoObra, '80000');
    await user.press(screen.getByRole('button', { name: 'Enviar cotización corregida' }));

    expect(await screen.findByText('✏️ La corregiste (antes $120.000).')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({
      mano_obra: 80_000, materiales: 20_000, detalle: 'Cambio de tablero y dos automáticos',
    });
  });

  test('con la disputa resuelta en parte, explica cuánto recibe', async () => {
    await abrirComoPrestador({
      ...base, estado: 'cerrada', modalidad: 'precio_cerrado', precio_acordado: 50_000, monto_reembolsado: 8_000,
      comision: 5_040, monto_neto: 36_960, estado_pago: 'liberado',
    }, { [`GET /solicitudes/${ID}/gastos`]: { resumen: {
      precio: 50_000, comision: 5_040, reembolsado: 8_000, ingreso_neto: 36_960, gastos: 0, ganancia_neta: 36_960, ingreso_confirmado: true,
    }, gastos: [] } });
    expect(await screen.findByText(/devolvió \$8\.000 a Valentina/)).toBeOnTheScreen();
    expect(screen.getByText(/Recibirás \$36\.960 .*\(\$50\.000 menos \$8\.000 devueltos al cliente menos \$5\.040 de comisión\)/)).toBeOnTheScreen();
    expect(await screen.findByText('Devuelto al cliente')).toBeOnTheScreen();
  });
});

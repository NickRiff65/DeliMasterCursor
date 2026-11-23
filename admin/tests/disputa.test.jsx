import { describe, test, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Solicitud from '../src/paginas/Solicitud.jsx';
import Disputas from '../src/paginas/Disputas.jsx';
import { simularApi, errorApi, mostrar } from './ayudas.jsx';

const ID = '94bd5c84-8cf4-5144-975e-92e2a711a363';
const enDisputa = {
  id: ID, estado: 'en_disputa', categoria_nombre: 'Gasfitería', precio_acordado: 50000,
  descripcion: 'Cambiar la llave del lavaplatos', motivo_disputa: 'La llave sigue goteando',
  cliente: { nombre: 'Valentina Rojas', email: 'valentina@demo.cl', activo: true },
  prestador: { nombre: 'María González', email: 'maria@demo.cl', activo: true, total_resenas: 4, calificacion_promedio: 4.5 },
  pago: { orden_compra: 'DM-1', monto: 50000, codigo_autorizacion: '1213' },
  ledger: { estado: 'retenido', monto_bruto: 50000, comision: 6000, monto_neto: 44000, eventos: [] },
  mensajes: [
    { id: 'm1', emisor: 'cliente', contenido: '¿Viene mañana?', creado_en: '2026-10-01T12:00:00Z' },
    { id: 'm2', emisor: 'prestador', contenido: '[mensaje bloqueado]', bloqueado: true, motivo_bloqueo: 'telefono,pago_externo', creado_en: '2026-10-01T12:05:00Z' },
  ],
  eventos: [{ estado_nuevo: 'en_disputa', creado_en: '2026-10-03T12:00:00Z', detalle: 'La llave sigue goteando' }],
  fotos: [
    { id: 'f1', rol: 'prestador', url: 'http://localhost:3000/api/evidencias/f1/imagen?vence=1&firma=a', creado_en: '2026-10-02T12:00:00Z', descripcion: 'Llave instalada' },
    { id: 'f2', rol: 'cliente', url: 'http://localhost:3000/api/evidencias/f2/imagen?vence=1&firma=b', creado_en: '2026-10-03T12:00:00Z' },
  ],
};

const abrir = () => mostrar(<Solicitud />, { ruta: `/solicitudes/${ID}`, patron: '/solicitudes/:id' });

describe('Disputa: conversación del equipo con cada parte', () => {
  test('muestra las dos conversaciones por separado y escribe a una parte', async () => {
    let conversaciones = {
      cliente: [{ id: 1, de_equipo: false, contenido: 'Les mando fotos del goteo', creado_en: '2026-10-03T13:00:00Z' }],
      prestador: [],
      puede_escribir: true,
    };
    const llamadas = simularApi({
      [`GET /admin/solicitudes/${ID}`]: { solicitud: enDisputa },
      [`GET /admin/solicitudes/${ID}/disputa`]: () => conversaciones,
      [`POST /admin/solicitudes/${ID}/disputa`]: (cuerpo) => {
        conversaciones = { ...conversaciones, prestador: [{ id: 2, de_equipo: true, contenido: cuerpo.contenido, creado_en: '2026-10-03T14:00:00Z' }] };
        return conversaciones;
      },
    });
    abrir();
    expect(await screen.findByRole('heading', { name: 'Conversación con las partes' })).toBeInTheDocument();
    expect(screen.getByText('Les mando fotos del goteo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Con el maestro · María González' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Escribir al maestro'), '¿Qué repuesto usó?');
    await userEvent.click(screen.getAllByRole('button', { name: 'Enviar' })[1]);
    expect(await screen.findByText('¿Qué repuesto usó?')).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ parte: 'prestador', contenido: '¿Qué repuesto usó?' });
  });
  test('la lista de disputas avisa cuando una parte respondió al equipo', async () => {
    simularApi({
      'GET /admin/disputas?estado=abiertas': {
        disputas: [{
          id: ID, categoria: 'Gasfitería', precio_acordado: 50000, abierta_en: '2026-10-03T12:00:00Z',
          motivo_disputa: 'La llave sigue goteando', cliente: 'Valentina Rojas', prestador: 'María González',
          mensajes: 2, respuesta_pendiente: true,
        }],
      },
    });
    mostrar(<Disputas />);
    expect(await screen.findByText('Respuesta nueva')).toBeInTheDocument();
  });
});

describe('Disputa: evidencia y resolución (HU-16)', () => {
  test('muestra la evidencia: partes, pago retenido, chat con bloqueos y fotos de ambas partes', async () => {
    simularApi({ [`GET /admin/solicitudes/${ID}`]: { solicitud: enDisputa } });
    abrir();
    expect(await screen.findByRole('heading', { name: /Gasfitería · \$50\.000/ })).toBeInTheDocument();
    expect(screen.getByText('4,5 ★ (4 reseñas)')).toBeInTheDocument();
    expect(screen.getByText('$44.000')).toBeInTheDocument();
    expect(screen.getByText('Retenido')).toBeInTheDocument();
    expect(screen.getByText('Bloqueado: Teléfono, Pago por fuera')).toBeInTheDocument();
    expect(screen.getByAltText('Foto subida por el prestador')).toHaveAttribute('src', enDisputa.fotos[0].url);
    expect(screen.getByAltText('Foto subida por el cliente')).toBeInTheDocument();
    expect(screen.getByText('Llave instalada')).toBeInTheDocument();
  });

  test('no se puede continuar sin elegir una decisión y fundamentarla', async () => {
    simularApi({ [`GET /admin/solicitudes/${ID}`]: { solicitud: enDisputa } });
    abrir();
    const continuar = await screen.findByRole('button', { name: 'Continuar' });
    expect(continuar).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Reembolsar \$50\.000 al cliente/));
    expect(continuar).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Fundamento/), 'corto');
    expect(continuar).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Fundamento/), ' pero ahora suficiente');
    expect(continuar).toBeEnabled();
  });

  test('reembolsar pide confirmación, envía la decisión y muestra la solicitud ya resuelta', async () => {
    let resuelta = false;
    const llamadas = simularApi({
      [`GET /admin/solicitudes/${ID}`]: () => ({ solicitud: resuelta ? { ...enDisputa, estado: 'cancelada' } : enDisputa }),
      [`POST /admin/disputas/${ID}/resolver`]: () => { resuelta = true; return { solicitud: enDisputa }; },
    });
    abrir();
    await userEvent.click(await screen.findByLabelText(/Reembolsar/));
    await userEvent.type(screen.getByLabelText(/Fundamento/), 'Las fotos muestran que la llave gotea');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText(/Se reembolsarán \$50\.000 al cliente/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));            // se arrepiente
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, reembolsar' }));

    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resolver la disputa' })).not.toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({
      decision: 'reembolsar', observacion: 'Las fotos muestran que la llave gotea',
    });
  });

  test('si la resolución falla se muestra el motivo y se puede reintentar', async () => {
    simularApi({
      [`GET /admin/solicitudes/${ID}`]: { solicitud: enDisputa },
      [`GET /admin/solicitudes/${ID}/disputa`]: { cliente: [], prestador: [], puede_escribir: true },
      [`POST /admin/disputas/${ID}/resolver`]: errorApi(502, 'PASARELA', 'Webpay no respondió; el dinero sigue retenido'),
    });
    abrir();
    await userEvent.click(await screen.findByLabelText(/Liberar el pago/));
    await userEvent.type(screen.getByLabelText(/Fundamento/), 'El trabajo quedó bien hecho');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, liberar el pago' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Webpay no respondió; el dinero sigue retenido');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });

  test('devolver una parte: sugiere los gastos sin boleta, valida el monto y envía la decisión', async () => {
    const conGastos = {
      ...enDisputa,
      gastos: [
        { id: 'g1', monto: 12000, descripcion: 'Llave nueva', con_boleta: true, imagen_url: 'http://localhost:3000/api/boletas/b1/imagen?vence=1&firma=c' },
        { id: 'g2', monto: 8000, descripcion: 'Teflón y sellos', con_boleta: false, imagen_url: null },
      ],
    };
    let resuelta = false;
    const llamadas = simularApi({
      [`GET /admin/solicitudes/${ID}`]: () => ({ solicitud: resuelta
        ? { ...conGastos, estado: 'cerrada', ledger: { ...conGastos.ledger, estado: 'liberado', monto_reembolsado: 8000 } }
        : conGastos }),
      [`POST /admin/disputas/${ID}/resolver`]: () => { resuelta = true; return { solicitud: conGastos }; },
    });
    abrir();
    expect(await screen.findByText('Sin boleta')).toBeInTheDocument();
    expect(screen.getByText('Con boleta · ver')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/Devolver una parte al cliente/));
    await userEvent.type(screen.getByLabelText(/Fundamento/), 'El teflón y los sellos no tienen boleta');
    const monto = screen.getByLabelText(/Monto a devolver al cliente/);
    await userEvent.type(monto, '50000');
    expect(screen.getByText(/para devolver todo, elige «Reembolsar»/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();

    await userEvent.clear(monto);
    await userEvent.click(screen.getByLabelText(/Teflón y sellos · \$8\.000 \(sin boleta\)/));
    expect(monto).toHaveValue('8000');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/Se devolverán \$8\.000 al cliente y \$42\.000 se liberarán al prestador\. Se rechazan 1 gasto/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, devolver esa parte' }));

    expect(await screen.findByText('Devuelto al cliente (disputa)')).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({
      decision: 'parcial', observacion: 'El teflón y los sellos no tienen boleta', monto_reembolso: 8000, gastos_rechazados: ['g2'],
    });
  });
});

describe('Foto sospechosa en la evidencia', () => {
  test('una foto con sospechosa=true muestra la insignia y la explicación, y la otra foto no', async () => {
    const conSospechosa = {
      ...enDisputa,
      fotos: [
        { ...enDisputa.fotos[0], sospechosa: true },
        { ...enDisputa.fotos[1] },
      ],
    };
    simularApi({ [`GET /admin/solicitudes/${ID}`]: { solicitud: conSospechosa } });
    abrir();
    expect(await screen.findByRole('heading', { name: /Gasfitería · \$50\.000/ })).toBeInTheDocument();
    // Solo la foto marcada lleva la insignia (una sola aparición)
    expect(screen.getAllByText('⚠ Sin datos de cámara')).toHaveLength(1);
    expect(screen.getByText('Sin datos de cámara: podría ser una captura o una imagen descargada')).toBeInTheDocument();
  });

  test('cada foto muestra si quedó verificada y, si no, por qué, con la fecha, el equipo y la distancia', async () => {
    const conDetalle = {
      ...enDisputa,
      fotos: [
        { ...enDisputa.fotos[0], verificacion: 'verificada', verificacion_motivos: [], exif_fecha: '2026-11-20T11:30:00',
          exif_dispositivo: 'samsung SM-A515F', minutos_antes: 25, tomada_con: 'camara', metadatos_origen: 'app', distancia_m: 120 },
        { ...enDisputa.fotos[1], verificacion: 'revisar', verificacion_motivos: ['antigua', 'editada'],
          exif_fecha: '2026-10-01T09:00:00', exif_software: 'Adobe Photoshop 25.0', minutos_antes: 72000, tomada_con: 'galeria' },
      ],
    };
    simularApi({ [`GET /admin/solicitudes/${ID}`]: { solicitud: conDetalle } });
    abrir();
    expect(await screen.findByText('✓ Verificada')).toBeInTheDocument();
    expect(screen.getByText(/25 min antes de subirla/)).toBeInTheDocument();
    expect(screen.getByText('Equipo: samsung SM-A515F')).toBeInTheDocument();
    expect(screen.getByText('A 120 m del punto del trabajo')).toBeInTheDocument();
    expect(screen.getByText(/con la cámara de la app · datos leídos por la app/)).toBeInTheDocument();
    expect(screen.getByText('Revisar')).toBeInTheDocument();
    expect(screen.getByText('Foto antigua: se tomó más de un día antes de subirla')).toBeInTheDocument();
    expect(screen.getByText('Programa: Adobe Photoshop 25.0')).toBeInTheDocument();
  });

  test('sin fotos sospechosas no se muestra la marca ni la explicación', async () => {
    simularApi({ [`GET /admin/solicitudes/${ID}`]: { solicitud: enDisputa } });
    abrir();
    expect(await screen.findByRole('heading', { name: /Gasfitería · \$50\.000/ })).toBeInTheDocument();
    expect(screen.getByAltText('Foto subida por el prestador')).toBeInTheDocument();
    expect(screen.queryByText(/Sospechosa/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin datos de cámara/)).not.toBeInTheDocument();
  });
});

import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { GastosDelTrabajo } from '../src/components/GastosDelTrabajo';
import { MaterialesDelTrabajo } from '../src/components/MaterialesDelTrabajo';
import { simularApi } from './ayudas';

// HU-09: gastos en materiales con su boleta (Pro) y lo que ve el cliente (Lite)
const ID = 's1';
const resumen = { precio: 45000, comision: 5400, ingreso_neto: 39600, gastos: 0, ganancia_neta: 39600, ingreso_confirmado: false };
const gasto = (id, monto, conBoleta, extra = {}) => ({
  id, monto, descripcion: `Gasto ${id}`, origen: 'manual', con_boleta: conBoleta,
  imagen_url: conBoleta ? `http://localhost:3000/api/boletas/${id}/imagen?vence=1&firma=x` : null, ...extra,
});
const boleta = { boleta_id: 'b1', monto_propuesto: 14780, revisar: false, imagen_url: 'http://localhost:3000/api/boletas/b1/imagen?vence=1&firma=x' };

beforeEach(() => jest.resetAllMocks());

describe('Gastos del trabajo (maestro)', () => {
  test('primero solo ofrece ingresar el gasto; la boleta se adjunta dentro, con la advertencia', async () => {
    simularApi({ [`GET /solicitudes/${ID}/gastos`]: { resumen, gastos: [] } });
    await render(<GastosDelTrabajo solicitudId={ID} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: '✍️ Ingresar gasto a mano' }));
    expect(screen.queryByRole('button', { name: '📷 Fotografiar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '🖼️ Galería' })).toBeOnTheScreen();
    expect(screen.getByText(/Sin boleta, el gasto no es válido para el cliente y él puede apelarlo ante la administración/)).toBeOnTheScreen();
  });

  test('antes de abrir el formulario no muestra los botones de la boleta', async () => {
    simularApi({ [`GET /solicitudes/${ID}/gastos`]: { resumen, gastos: [] } });
    await render(<GastosDelTrabajo solicitudId={ID} />);
    expect(await screen.findByRole('button', { name: '✍️ Ingresar gasto a mano' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '📷 Fotografiar' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '🖼️ Galería' })).not.toBeOnTheScreen();
  });

  test('con la boleta adjunta propone el total leído y guarda el gasto con ella', async () => {
    const llamadas = simularApi({
      [`GET /solicitudes/${ID}/gastos`]: { resumen, gastos: [] },
      [`POST /solicitudes/${ID}/boletas`]: boleta,
      [`POST /solicitudes/${ID}/gastos`]: { resumen: { ...resumen, gastos: 14780 }, gastos: [gasto('g1', 14780, true)] },
    });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ base64: 'FOTOBOLETA', uri: 'file://b.jpg' }] });
    await render(<GastosDelTrabajo solicitudId={ID} />);
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: '✍️ Ingresar gasto a mano' }));
    await user.press(screen.getByRole('button', { name: '🖼️ Galería' }));

    expect(await screen.findByText('✓ Leímos un total de $14.780.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Monto (CLP)')).toHaveDisplayValue('14780');
    await user.press(screen.getByRole('button', { name: 'Guardar gasto' }));
    expect(await screen.findByText('✓ Con boleta')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.ruta === `/solicitudes/${ID}/gastos` && l.metodo === 'POST').cuerpo)
      .toEqual({ monto: 14780, boleta_id: 'b1' });
  });

  test('un gasto sin boleta queda marcado y se le puede adjuntar después', async () => {
    const llamadas = simularApi({
      [`GET /solicitudes/${ID}/gastos`]: { resumen, gastos: [gasto('g1', 8000, false)] },
      [`POST /solicitudes/${ID}/boletas`]: boleta,
      'PATCH /gastos/g1': { resumen, gastos: [gasto('g1', 8000, true)] },
    });
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ base64: 'FOTOBOLETA', uri: 'file://b.jpg' }] });
    await render(<GastosDelTrabajo solicitudId={ID} />);
    const user = userEvent.setup();

    expect(await screen.findByText('⚠️ Sin boleta: no es válido para el cliente')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '🧾 Adjuntar boleta' }));
    await user.press(screen.getByRole('button', { name: '📷 Cámara' }));
    expect(await screen.findByText('✓ Con boleta')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'PATCH').cuerpo).toEqual({ boleta_id: 'b1' });
  });
});

describe('Gastos del trabajo terminado (maestro)', () => {
  test('ya no ofrece ingresar ni modificar gastos', async () => {
    simularApi({ [`GET /solicitudes/${ID}/gastos`]: { resumen, gastos: [gasto('g1', 8000, false)], editable: false } });
    await render(<GastosDelTrabajo solicitudId={ID} />);
    expect(await screen.findByText(/los gastos quedaron registrados y ya no se pueden modificar/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '✍️ Ingresar gasto a mano' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Eliminar gasto' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '🧾 Adjuntar boleta' })).not.toBeOnTheScreen();
  });
});

describe('Gastos en materiales (cliente)', () => {
  const materiales = (puedeApelar) => ({
    gastos: [gasto('g1', 14780, true, { descripcion: 'Cable' }), gasto('g2', 5000, false, { descripcion: 'Cuerda' })],
    total: 19780, sin_boleta: 1, puede_apelar: puedeApelar,
  });

  test('muestra cuáles tienen boleta y permite apelar los que no', async () => {
    const llamadas = simularApi({
      [`GET /solicitudes/${ID}/materiales`]: materiales(true),
      [`POST /solicitudes/${ID}/reportar`]: { solicitud: { id: ID, estado: 'en_disputa' } },
    });
    const onApelada = jest.fn();
    await render(<MaterialesDelTrabajo solicitudId={ID} maestro="Juan" onApelada={onApelada} />);
    const user = userEvent.setup();

    expect(await screen.findByText('Juan registró estos gastos del trabajo. Cada uno debe tener su boleta.')).toBeOnTheScreen();
    expect(screen.getByText('✓ Con boleta · Ver')).toBeOnTheScreen();
    expect(screen.getByText('⚠️ Sin boleta')).toBeOnTheScreen();
    expect(screen.getByText('$19.780')).toBeOnTheScreen();
    expect(screen.getByText(/Un gasto no tiene boleta: no está justificado\. Si no se justifican, puedes apelarlos/)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Apelar gastos sin boleta' }));
    expect(screen.getByLabelText('Tu apelación')).toHaveDisplayValue('Apelo el gasto en materiales sin boleta: Cuerda ($5.000).');
    await user.press(screen.getByRole('button', { name: 'Enviar apelación' }));
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ motivo: 'Apelo el gasto en materiales sin boleta: Cuerda ($5.000).' });
    expect(onApelada).toHaveBeenCalledWith({ id: ID, estado: 'en_disputa' });
  });

  test('antes del pago informa, pero aún no ofrece apelar', async () => {
    simularApi({ [`GET /solicitudes/${ID}/materiales`]: materiales(false) });
    await render(<MaterialesDelTrabajo solicitudId={ID} maestro="Juan" />);
    expect(await screen.findByText('⚠️ Sin boleta')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Apelar gastos sin boleta' })).not.toBeOnTheScreen();
  });

  test('sin gastos registrados no se muestra', async () => {
    simularApi({ [`GET /solicitudes/${ID}/materiales`]: { gastos: [], total: 0, sin_boleta: 0, puede_apelar: true } });
    await render(<MaterialesDelTrabajo solicitudId={ID} maestro="Juan" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await act(async () => {});   // termina de cargar
    expect(screen.queryByText('🧾 Gastos en materiales')).not.toBeOnTheScreen();
  });
});

describe('Gastos rechazados por la administración', () => {
  test('el maestro ve el gasto rechazado: se devolvió al cliente y no cuenta como gasto', async () => {
    simularApi({ [`GET /solicitudes/${ID}/gastos`]: {
      resumen: { ...resumen, reembolsado: 8000 }, gastos: [gasto('g1', 8000, false, { rechazado: true })], editable: false,
    } });
    await render(<GastosDelTrabajo solicitudId={ID} />);
    expect(await screen.findByText(/Rechazado por la administración: se devolvió al cliente y no cuenta como gasto/)).toBeOnTheScreen();
    expect(screen.getByText('Devuelto al cliente')).toBeOnTheScreen();
  });

  test('el cliente lo ve como devuelto y no le ofrece apelarlo', async () => {
    simularApi({ [`GET /solicitudes/${ID}/materiales`]: {
      gastos: [gasto('g1', 8000, false, { descripcion: 'Cuerda', rechazado: true })], total: 0, sin_boleta: 0, puede_apelar: true,
    } });
    await render(<MaterialesDelTrabajo solicitudId={ID} maestro="Juan" />);
    expect(await screen.findByText('✖ Rechazado por el equipo · se te devolvió')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Apelar gastos sin boleta' })).not.toBeOnTheScreen();
  });
});

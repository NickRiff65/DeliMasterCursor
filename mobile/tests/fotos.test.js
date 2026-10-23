import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { FotosEvidencia } from '../src/components/FotosEvidencia';
import { simularApi } from './ayudas';

// HU-16: fotos del trabajo terminado (prestador) y del problema (cliente) como respaldo en disputas
const ID = 's1';
const foto = (id, rol, propia, extra = {}) => ({
  id, rol, propia, url: `http://localhost:3000/api/evidencias/${id}/imagen?vence=1&firma=x`,
  creado_en: '2026-10-05T15:30:00.000Z', descripcion: null, ...extra,
});
const lista = (fotos, puede_subir = true) => ({ fotos, puede_subir, maximo_por_persona: 6 });

const mostrar = () => render(<FotosEvidencia solicitudId={ID} titulo="Fotos del trabajo" ayuda="Muestra cómo quedó el trabajo." />);

beforeEach(() => jest.resetAllMocks());

describe('Fotos de evidencia', () => {
  test('muestra las fotos de ambas partes con su autor y los botones para agregar', async () => {
    simularApi({ [`GET /solicitudes/${ID}/fotos`]: lista([foto('f1', 'prestador', true), foto('f2', 'cliente', false)]) });
    await mostrar();
    expect(await screen.findByText('📷 Fotos del trabajo')).toBeOnTheScreen();
    expect(screen.getByText('Muestra cómo quedó el trabajo.')).toBeOnTheScreen();
    expect(screen.getByText('Tú')).toBeOnTheScreen();
    expect(screen.getByText('Cliente')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '📷 Cámara' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '🖼️ Galería' })).toBeOnTheScreen();
    expect(screen.getByText(/no se pueden borrar/)).toBeOnTheScreen();
  });

  test('toma una foto con la cámara y la sube', async () => {
    const llamadas = simularApi({
      [`GET /solicitudes/${ID}/fotos`]: lista([]),
      [`POST /solicitudes/${ID}/fotos`]: lista([foto('f1', 'prestador', true)]),
    });
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ base64: 'BASE64DELAFOTO' }] });
    await mostrar();
    expect(await screen.findByText('Aún no hay fotos.')).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: '📷 Cámara' }));
    expect(await screen.findByText('Tú')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ imagen_base64: 'BASE64DELAFOTO' });
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ quality: 0.6, base64: true }));
  });

  test('sin permiso de cámara lo explica y no sube nada; si se cancela tampoco', async () => {
    const llamadas = simularApi({ [`GET /solicitudes/${ID}/fotos`]: lista([]) });
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    await mostrar();
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: '📷 Cámara' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Necesitamos permiso para usar la cámara.');
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: '🖼️ Galería' }));
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(0);
  });

  test('con 6 fotos propias ya no ofrece subir más', async () => {
    const seis = Array.from({ length: 6 }, (_, i) => foto(`f${i}`, 'cliente', true));
    simularApi({ [`GET /solicitudes/${ID}/fotos`]: lista(seis) });
    await mostrar();
    expect(await screen.findByText('Ya subiste las 6 fotos permitidas.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '📷 Cámara' })).not.toBeOnTheScreen();
  });

  test('cuando ya no se pueden subir y no hay fotos, no ocupa espacio en la pantalla', async () => {
    simularApi({ [`GET /solicitudes/${ID}/fotos`]: lista([], false) });
    await mostrar();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await act(async () => {});                                            // termina de cargar la lista
    expect(screen.toJSON()).toBeNull();
  });

  test('al tocar una foto se amplía con su autor y descripción', async () => {
    simularApi({
      [`GET /solicitudes/${ID}/fotos`]: lista([foto('f1', 'prestador', false, { descripcion: 'Llave instalada' })], false),
    });
    await mostrar();
    await userEvent.setup().press(await screen.findByRole('imagebutton', { name: 'Foto de maestro' }));
    expect(screen.getByText(/Foto del maestro · .* · Llave instalada/)).toBeOnTheScreen();
    expect(screen.getByText('Toca para cerrar')).toBeOnTheScreen();
  });
});

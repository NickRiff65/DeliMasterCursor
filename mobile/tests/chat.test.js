import { screen, userEvent } from 'expo-router/testing-library';
import * as ImagePicker from 'expo-image-picker';
import Chat from '../src/app/chat/[id]';
import { abrirApp, simularApi, sesionGuardada, cliente } from './ayudas';

// HU-04: chat de una solicitud, con fotos (cámara o galería) para cotizar con más exactitud
const ID = '11111111-2222-4333-8444-555555555555';
const mensaje = (id, emisor, extra = {}) => ({
  id, solicitud_id: ID, emisor_id: emisor, emisor_nombre: emisor === 'c1' ? 'Valentina' : 'Juan Soto',
  contenido: `Mensaje ${id}`, bloqueado: false, creado_en: '2026-10-10T15:30:00Z', ...extra,
});
const fotoUrl = (id) => `http://localhost:3000/api/evidencias/${id}/imagen?vence=1&firma=x`;

beforeEach(() => {
  jest.resetAllMocks();
  sesionGuardada();
});

describe('Chat con fotos', () => {
  test('muestra las fotos del historial como imágenes', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}/mensajes`]: {
        mensajes: [mensaje(1, 'p1'), mensaje(2, 'p1', { contenido: '📷 Foto', foto_id: 'f1', foto_url: fotoUrl('f1') })],
        puede_escribir: true, filtro_activo: true,
      },
    });
    await abrirApp({ ruta: `/chat/${ID}`, pantallas: { 'chat/[id]': Chat } });
    expect(await screen.findByText('Mensaje 1')).toBeOnTheScreen();
    expect(screen.getByRole('imagebutton', { name: 'Foto de Juan Soto' })).toBeOnTheScreen();
    expect(screen.queryByText('📷 Foto')).not.toBeOnTheScreen();
  });

  test('envía una foto de la galería y aparece en la conversación', async () => {
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}/mensajes`]: { mensajes: [], puede_escribir: true, filtro_activo: true },
      [`POST /solicitudes/${ID}/mensajes/foto`]: {
        mensaje: mensaje(3, 'c1', { contenido: '📷 Foto', foto_id: 'f2', foto_url: fotoUrl('f2') }),
      },
    });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ base64: 'FOTO-ARBOL', uri: 'file://a.jpg' }] });
    await abrirApp({ ruta: `/chat/${ID}`, pantallas: { 'chat/[id]': Chat } });
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Enviar una foto' }));
    await user.press(screen.getByRole('button', { name: '🖼️ Galería' }));
    expect(await screen.findByRole('imagebutton', { name: 'Tu foto' })).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ imagen_base64: 'FOTO-ARBOL' });
  });

  test('con el chat cerrado no se pueden enviar fotos', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}/mensajes`]: { mensajes: [mensaje(1, 'c1')], puede_escribir: false, filtro_activo: false },
    });
    await abrirApp({ ruta: `/chat/${ID}`, pantallas: { 'chat/[id]': Chat } });
    expect(await screen.findByText('Este chat está cerrado.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Enviar una foto' })).not.toBeOnTheScreen();
  });
});

import { screen, userEvent } from 'expo-router/testing-library';
import * as ImagePicker from 'expo-image-picker';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { High: 4 },
}));
import * as almacenCola from '../src/lib/almacenCola';
import NuevaSolicitud from '../src/app/nueva-solicitud';
import { abrirApp, simularApi, SIN_CONEXION, errorApi, sesionGuardada, cliente } from './ayudas';

// HU-08 (el cliente escribe con sus palabras) y HU-12 (sin señal se guarda en el celular)
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/);
const base = {
  'GET /auth/yo': { usuario: cliente },
  'GET /categorias': { categorias: [{ slug: 'electricidad', nombre: 'Electricidad' }, { slug: 'poda-altura', nombre: 'Poda en altura' }] },
  'GET /comunas': { comunas: ['Chillán', 'Coihueco'] },
};
const TEXTO = 'Se me quemó un enchufe y saltó el automático';

async function escribir(texto = TEXTO) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Describe lo que necesitas'), texto);
  await user.press(screen.getByRole('button', { name: 'Continuar' }));
  return user;
}

// Dirección exacta del trabajo (obligatoria antes de publicar)
const DIRECCION = 'Av. Libertad 1234';
const completarDireccion = async (user) => user.type(await screen.findByLabelText('Dirección exacta'), DIRECCION);

beforeEach(() => sesionGuardada());

describe('Pedir un servicio', () => {
  test('la app muestra lo que entendió y publica la solicitud con un id generado en el celular', async () => {
    const llamadas = simularApi({
      ...base,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'electricidad' }], no_disponibles: [], comuna: null },
      'POST /solicitudes': (cuerpo) => ({ solicitudes: [{ id: cuerpo.id, estado: 'creada' }] }),
    });
    const app = await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = await escribir();

    expect(await screen.findByText('Entendimos que necesitas:')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: /Electricidad/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Poda en altura/ })).not.toBeChecked();
    await completarDireccion(user);
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));

    expect(await screen.findByText('Pantalla solicitud/[id]')).toBeOnTheScreen();
    const publicada = llamadas.find((l) => l.ruta === '/solicitudes').cuerpo;
    expect(publicada).toEqual({
      id: UUID, descripcion: TEXTO, categorias: ['electricidad'], comuna: 'Chillán', direccion: DIRECCION,
      creado_en_dispositivo: expect.any(String),
    });
    expect(app.ruta()).toBe(`/solicitud/${publicada.id}`);
  });

  test('si menciona una comuna donde aún no operamos, lo avisa y pide elegir Chillán o Coihueco', async () => {
    const llamadas = simularApi({
      ...base,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'electricidad' }], no_disponibles: [], comuna: null, fuera_de_cobertura: 'San Carlos' },
      'POST /solicitudes': (cuerpo) => ({ solicitudes: [{ id: cuerpo.id, estado: 'creada' }] }),
    });
    await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = await escribir('Se me quemó un enchufe en San Carlos');
    expect(await screen.findByText(/Por ahora atendemos solo en Chillán y Coihueco \(mencionaste San Carlos\)/)).toBeOnTheScreen();
    await completarDireccion(user);
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elige la comuna donde necesitas el servicio.');
    await user.press(screen.getByRole('button', { name: '📍 Coihueco' }));
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));
    expect(await screen.findByText('Pantalla solicitud/[id]')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.ruta === '/solicitudes').cuerpo.comuna).toBe('Coihueco');
  });

  test('si no ofrecemos el servicio lo avisa y pide elegir uno antes de publicar', async () => {
    const llamadas = simularApi({
      ...base,
      'POST /solicitudes/interpretar': { categorias: [], no_disponibles: [{ nombre: 'Carpintería' }], comuna: 'Coihueco' },
    });
    await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = await escribir('Necesito un mueble de cocina a medida en Coihueco');

    expect(await screen.findByText('No identificamos el servicio. Elígelo:')).toBeOnTheScreen();
    expect(screen.getByText('Aún no ofrecemos carpintería. ¡Pronto!')).toBeOnTheScreen();
    expect(screen.getByText('📍 Coihueco')).toBeOnTheScreen();          // la comuna detectada en el texto
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elige qué servicio necesitas.');
    expect(llamadas.some((l) => l.ruta === '/solicitudes')).toBe(false);
  });

  test('sin señal ofrece guardarla en el celular y se envía sola después', async () => {
    simularApi({ ...base, 'POST /solicitudes/interpretar': SIN_CONEXION });
    const app = await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = await escribir();

    expect(await screen.findByText('📶 Estás sin conexión')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Guardar y enviar cuando haya señal' })).toBeDisabled();   // falta la dirección
    await user.type(screen.getByLabelText('Dirección exacta del trabajo'), DIRECCION);
    await user.press(screen.getByRole('button', { name: 'Guardar y enviar cuando haya señal' }));

    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/?guardada=1');
    const [item] = almacenCola.__todos();
    expect(item).toMatchObject({ usuario_id: 'c1', estado: 'pendiente', datos: { id: UUID, descripcion: TEXTO, comuna: 'Chillán', direccion: DIRECCION } });
    expect(item.datos).not.toHaveProperty('categorias');   // el servidor identificará el servicio al recibirla
  });

  test('si se corta la señal al publicar, se guarda con el servicio ya elegido', async () => {
    simularApi({
      ...base,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'electricidad' }], no_disponibles: [], comuna: null },
      'POST /solicitudes': SIN_CONEXION,
    });
    await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = await escribir();
    await completarDireccion(user);
    await user.press(await screen.findByRole('button', { name: 'Publicar solicitud' }));

    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(almacenCola.__todos()[0].datos).toMatchObject({ categorias: ['electricidad'], comuna: 'Chillán' });
  });

  test('se pueden adjuntar hasta 2 fotos del problema y viajan en el campo «fotos» al publicar', async () => {
    const llamadas = simularApi({
      ...base,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'poda-altura' }], no_disponibles: [], comuna: null },
      'POST /solicitudes': (cuerpo) => ({ solicitudes: [{ id: cuerpo.id, estado: 'creada' }] }),
    });
    ImagePicker.launchImageLibraryAsync
      .mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-ARBOL', uri: 'file://arbol.jpg' }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-TECHO', uri: 'file://techo.jpg' }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-RAMAS', uri: 'file://ramas.jpg' }] });
    const app = await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Describe lo que necesitas'), 'Necesito podar un árbol alto');
    expect(screen.getByText('0/2')).toBeOnTheScreen();
    for (let i = 0; i < 2; i++) await user.press(screen.getByRole('button', { name: '🖼️ Galería' }));
    expect(await screen.findByLabelText('Foto 2')).toBeOnTheScreen();
    expect(screen.getByText('2/2')).toBeOnTheScreen();
    // Con el máximo adjunto ya no se ofrece agregar más
    expect(screen.queryByRole('button', { name: '🖼️ Galería' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Quitar foto 2' }));
    expect(screen.getByText('1/2')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '🖼️ Galería' }));
    expect(await screen.findByLabelText('Foto 2')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Continuar' }));
    await completarDireccion(user);
    await user.press(await screen.findByRole('button', { name: 'Publicar solicitud' }));
    expect(await screen.findByText('Pantalla solicitud/[id]')).toBeOnTheScreen();
    const publicada = llamadas.find((l) => l.ruta === '/solicitudes').cuerpo;
    expect(publicada.fotos).toEqual(['FOTO-ARBOL', 'FOTO-RAMAS']);
    // Ya no hay subida separada de fotos: viajaron con la creación
    expect(llamadas.some((l) => l.ruta === `/solicitudes/${publicada.id}/fotos`)).toBe(false);
    expect(app.ruta()).toBe(`/solicitud/${publicada.id}`);
  });

  test('si el servidor rechaza la creación, muestra su mensaje tal cual y se queda en la pantalla', async () => {
    simularApi({
      ...base,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'poda-altura' }], no_disponibles: [], comuna: null },
      'POST /solicitudes': errorApi(409, 'SOLICITUD_ACTIVA_MISMA_CATEGORIA', 'Ya tienes una solicitud activa de Poda en altura.'),
    });
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ base64: 'FOTO', uri: 'file://f.jpg' }] });
    await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Describe lo que necesitas'), 'Necesito podar un árbol alto');
    await user.press(screen.getByRole('button', { name: '📷 Cámara' }));
    await screen.findByLabelText('Foto 1');
    await user.press(screen.getByRole('button', { name: 'Continuar' }));
    await completarDireccion(user);
    await user.press(await screen.findByRole('button', { name: 'Publicar solicitud' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes una solicitud activa de Poda en altura.');
    expect(screen.getByRole('button', { name: 'Publicar solicitud' })).toBeOnTheScreen();
    expect(screen.queryByText('Pantalla solicitud/[id]')).not.toBeOnTheScreen();
  });

  test('pide la dirección exacta y puede guardar la ubicación del celular', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: -36.6066, longitude: -72.1034, accuracy: 12 } });
    const llamadas = simularApi({
      ...base,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'electricidad' }], no_disponibles: [], comuna: null },
      'POST /solicitudes': (cuerpo) => ({ solicitudes: [{ id: cuerpo.id, estado: 'creada' }] }),
    });
    await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = await escribir();
    await user.press(await screen.findByRole('button', { name: 'Publicar solicitud' }));
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Falta la dirección exacta del trabajo.');
    expect(llamadas.some((l) => l.ruta === '/solicitudes')).toBe(false);

    await completarDireccion(user);
    await user.type(screen.getByLabelText('Referencia (opcional)'), 'Portón verde');
    await user.press(screen.getByRole('button', { name: '📍 Usar mi ubicación actual' }));
    expect(await screen.findByText(/Ubicación guardada \(±12 m\)/)).toBeOnTheScreen();
    expect(screen.getByText(/El maestro verá la dirección recién cuando pagues/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));
    expect(await screen.findByText('Pantalla solicitud/[id]')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.ruta === '/solicitudes').cuerpo).toMatchObject({
      direccion: DIRECCION, referencia: 'Portón verde', latitud: -36.6066, longitud: -72.1034,
    });
  });
});

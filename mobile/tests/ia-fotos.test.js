import { screen, userEvent, waitFor } from 'expo-router/testing-library';
import * as ImagePicker from 'expo-image-picker';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { High: 4 },
}));
import NuevaSolicitud from '../src/app/nueva-solicitud';
import DetalleSolicitud from '../src/app/solicitud/[id]';
import { descartarPendiente } from '../src/lib/trabajosPendientes';
import { abrirApp, simularApi, errorApi, sesionGuardada, cliente } from './ayudas';

// Detección del problema por foto con IA: el cliente sube una foto sin escribir y la IA propone el
// servicio y la descripción, que el cliente revisa antes de publicar
const base = {
  'GET /auth/yo': { usuario: cliente },
  'GET /categorias': { categorias: [{ slug: 'electricidad', nombre: 'Electricidad' }, { slug: 'cerrajeria', nombre: 'Cerrajería' }] },
  'GET /comunas': { comunas: ['Chillán', 'Coihueco'] },
  'GET /solicitudes/analizar-fotos': { disponible: true },
};
const analisis = {
  categoria: { slug: 'electricidad', nombre: 'Electricidad' }, confianza: 'alta',
  descripcion: 'El enchufe de la pared tiene marcas de quemado y la tapa está derretida.',
  peligro: 'No lo uses y corta la luz del automático hasta que llegue el maestro.',
  pregunta: '¿Saltó el automático?', modelo: 'claude-opus-5-5',
};

async function abrirConFoto(rutas) {
  sesionGuardada();
  const llamadas = simularApi({ ...base, ...rutas });
  ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-ENCHUFE', uri: 'file://enchufe.jpg' }] });
  const app = await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Galería' }));
  await screen.findByLabelText('Foto 1');
  return { llamadas, app, user };
}

describe('Detección del problema por foto', () => {
  test('sin escribir nada, la IA rellena la descripción, elige el servicio y pasa a revisar el lugar', async () => {
    const { llamadas, user } = await abrirConFoto({
      'POST /solicitudes/analizar-fotos': { analisis },
      'POST /solicitudes': (cuerpo) => ({ solicitudes: [{ id: cuerpo.id, estado: 'creada' }] }),
    });
    await user.press(await screen.findByRole('button', { name: 'Detectar el problema con la foto' }));

    expect(await screen.findByText('Nuestro equipo detectó: Trabajo de electricidad')).toBeOnTheScreen();
    expect(screen.getByText(analisis.peligro)).toBeOnTheScreen();
    expect(screen.getByText(/El maestro querrá saber:/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Describe lo que necesitas')).toHaveDisplayValue(analisis.descripcion);
    expect(screen.getByText('Entendimos que necesitas:')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.ruta === '/solicitudes/analizar-fotos' && l.metodo === 'POST').cuerpo).toEqual({ fotos: ['FOTO-ENCHUFE'] });

    // El cliente solo completa la dirección y publica con lo que propuso la IA
    await user.type(await screen.findByLabelText('Dirección exacta'), 'Av. Libertad 1234');
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));
    expect(await screen.findByText('Pantalla solicitud/[id]')).toBeOnTheScreen();
    const publicada = llamadas.find((l) => l.ruta === '/solicitudes').cuerpo;
    expect([publicada.descripcion, publicada.categorias]).toEqual([analisis.descripcion, ['electricidad']]);
    expect(llamadas.some((l) => l.ruta === '/solicitudes/interpretar')).toBe(false);
  });

  test('si el cliente ya escribió, no le borra el texto: le ofrece la sugerencia', async () => {
    const { user } = await abrirConFoto({ 'POST /solicitudes/analizar-fotos': { analisis } });
    await user.type(screen.getByLabelText('Describe lo que necesitas'), 'Problema con un enchufe');
    await user.press(screen.getByRole('button', { name: 'Detectar el problema con la foto' }));

    expect(await screen.findByText(/Sugerencia: «El enchufe de la pared/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Describe lo que necesitas')).toHaveDisplayValue('Problema con un enchufe');
    await user.press(screen.getByRole('button', { name: 'Usar esta descripción' }));
    expect(screen.getByLabelText('Describe lo que necesitas')).toHaveDisplayValue(analisis.descripcion);
    expect(screen.getByText('Entendimos que necesitas:')).toBeOnTheScreen();
  });

  test('si la IA no identifica el servicio, lo dice y el cliente sigue como siempre', async () => {
    const { user } = await abrirConFoto({
      'POST /solicitudes/analizar-fotos': { analisis: { ...analisis, categoria: null, confianza: 'baja', descripcion: 'Se ve una pared blanca.', peligro: null, pregunta: null } },
    });
    await user.press(await screen.findByRole('button', { name: 'Detectar el problema con la foto' }));
    expect(await screen.findByText('No pudimos identificar el servicio con seguridad')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeOnTheScreen();   // sigue en el primer paso
  });

  test('si el análisis falla, muestra el mensaje y deja describirlo a mano', async () => {
    const { user } = await abrirConFoto({
      'POST /solicitudes/analizar-fotos': errorApi(503, 'IA_NO_DISPONIBLE', 'No pudimos analizar la foto en este momento. Describe el problema con tus palabras.'),
    });
    await user.press(await screen.findByRole('button', { name: 'Detectar el problema con la foto' }));
    expect(await screen.findByText(/No pudimos analizar la foto en este momento/)).toBeOnTheScreen();
  });

  test('sin la IA activa en el servidor no se ofrece el botón', async () => {
    await abrirConFoto({ 'GET /solicitudes/analizar-fotos': { disponible: false } });
    expect(screen.queryByRole('button', { name: 'Detectar el problema con la foto' })).toBeNull();
  });
});

describe('Fotos con trabajos de oficios distintos', () => {
  beforeEach(() => descartarPendiente());

  test('publica uno por solicitud: primero el principal y luego el otro, ya listo y con la misma dirección', async () => {
    sesionGuardada();
    const solicitud = (cuerpo) => ({
      id: cuerpo.id, estado: 'creada', categoria: cuerpo.categorias[0], categoria_nombre: cuerpo.categorias[0],
      descripcion: cuerpo.descripcion, comuna: cuerpo.comuna, direccion: cuerpo.direccion, creado_en: '2026-11-23T12:00:00Z', eventos: [],
    });
    const rutas = {
      ...base,
      'GET /categorias': { categorias: [{ slug: 'gasfiteria', nombre: 'Gasfitería' }, { slug: 'vidrieria', nombre: 'Vidriería' }] },
      'POST /solicitudes/analizar-fotos': { analisis: {
        categoria: { slug: 'gasfiteria', nombre: 'Gasfitería' }, confianza: 'alta',
        descripcion: 'La llave del lavaplatos gotea sin parar.', peligro: null, pregunta: null, fotos: [0],
        otros: [{ categoria: { slug: 'vidrieria', nombre: 'Vidriería' }, descripcion: 'El vidrio de la ventana está quebrado.', fotos: [1] }],
        modelo: 'simulado',
      } },
    };
    // Cada solicitud publicada queda disponible para su pantalla de detalle
    rutas['POST /solicitudes'] = (cuerpo) => {
      rutas[`GET /solicitudes/${cuerpo.id}`] = { solicitud: solicitud(cuerpo) };
      return { solicitudes: [{ id: cuerpo.id, estado: 'creada' }] };
    };
    const llamadas = simularApi(rutas);
    ImagePicker.launchImageLibraryAsync
      .mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-LLAVE', uri: 'file://llave.jpg' }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-VIDRIO', uri: 'file://vidrio.jpg' }] });
    const app = await abrirApp({
      ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud, 'solicitud/[id]': DetalleSolicitud },
    });
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Galería' }));
    await user.press(await screen.findByRole('button', { name: 'Galería' }));
    await screen.findByLabelText('Foto 2');
    await user.press(screen.getByRole('button', { name: 'Detectar el problema con la foto' }));

    // Avisa que son dos trabajos y la solicitud se queda solo con la foto de la llave
    expect(await screen.findByText(/Encontramos 2 trabajos distintos en tus fotos: gasfitería y vidriería/)).toBeOnTheScreen();
    expect(screen.getByText(/al publicarla te dejamos lista la de vidriería/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Foto 2')).toBeNull();

    await user.type(await screen.findByLabelText('Dirección exacta'), 'Av. Libertad 1234');
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));
    const primera = llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/solicitudes')[0].cuerpo;
    expect([primera.categorias, primera.fotos.map((f) => f.imagen_base64), primera.separada_de])
      .toEqual([['gasfiteria'], ['FOTO-LLAVE'], undefined]);

    // En la pantalla de la solicitud publicada se ofrece pedir el otro trabajo
    await user.press(await screen.findByRole('button', { name: 'Pedir ahora el trabajo de vidriería' }));
    expect(await screen.findByText('Trabajo de vidriería que encontramos en tus fotos')).toBeOnTheScreen();
    expect(screen.getByLabelText('Describe lo que necesitas')).toHaveDisplayValue('El vidrio de la ventana está quebrado.');
    expect(screen.getByLabelText('Dirección exacta')).toHaveDisplayValue('Av. Libertad 1234');
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));

    const publicadas = () => llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/solicitudes');
    await waitFor(() => expect(publicadas()).toHaveLength(2));
    const segunda = publicadas()[1].cuerpo;
    await waitFor(() => expect(app.ruta()).toBe(`/solicitud/${segunda.id}`));
    expect([segunda.categorias, segunda.fotos.map((f) => f.imagen_base64), segunda.separada_de, segunda.direccion])
      .toEqual([['vidrieria'], ['FOTO-VIDRIO'], primera.id, 'Av. Libertad 1234']);
    // Ya no quedan trabajos pendientes: no se vuelve a ofrecer
    expect(screen.queryByRole('button', { name: /Pedir ahora el trabajo/ })).toBeNull();
  });

  test('«Ahora no» descarta el otro trabajo', async () => {
    sesionGuardada();
    const { guardarPendiente } = require('../src/lib/trabajosPendientes');
    const ID = '11111111-2222-4333-8444-555555555555';
    guardarPendiente({
      separadaDe: ID, ultima: ID, lugar: { comuna: 'Chillán', direccion: 'Av. Libertad 1234', referencia: '', gps: null },
      trabajos: [{ categoria: { slug: 'vidrieria', nombre: 'Vidriería' }, descripcion: 'Vidrio quebrado.', fotos: [{ base64: 'F', uri: 'file://f.jpg' }] }],
    });
    simularApi({ 'GET /auth/yo': { usuario: cliente }, [`GET /solicitudes/${ID}`]: { solicitud: {
      id: ID, estado: 'creada', categoria: 'gasfiteria', categoria_nombre: 'Gasfitería', descripcion: 'Llave que gotea',
      comuna: 'Chillán', creado_en: '2026-11-23T12:00:00Z', eventos: [],
    } } });
    await abrirApp({ ruta: `/solicitud/${ID}`, pantallas: { 'solicitud/[id]': DetalleSolicitud } });
    const user = userEvent.setup();
    expect(await screen.findByText(/También encontramos en tus fotos: Trabajo de vidriería/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Ahora no' }));
    expect(screen.queryByText(/También encontramos en tus fotos/)).toBeNull();
    expect(require('../src/lib/trabajosPendientes').tomarPendiente()).toBeNull();
  });
});

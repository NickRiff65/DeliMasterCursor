import { screen, userEvent } from 'expo-router/testing-library';
import * as ImagePicker from 'expo-image-picker';
import NuevaSolicitud from '../src/app/nueva-solicitud';
import Maestros from '../src/app/maestros';
import Portafolio from '../src/app/portafolio';
import Panel from '../src/app/panel';
import Inicio from '../src/app/index';
import DetalleSolicitud from '../src/app/solicitud/[id]';
import { abrirApp, simularApi, errorApi, sesionGuardada, usarVariante, cliente, prestador } from './ayudas';

// Mejoras de ayudantía: fotos al pedir (máx. 2, en el campo «fotos»), portafolio del maestro,
// chip «Nuevos» en el catálogo y aviso de solicitud sin respuesta en 1 día hábil
beforeEach(() => sesionGuardada());

const baseSolicitud = {
  'GET /auth/yo': { usuario: cliente },
  'GET /categorias': { categorias: [{ slug: 'electricidad', nombre: 'Electricidad' }, { slug: 'poda-altura', nombre: 'Poda en altura' }] },
  'GET /comunas': { comunas: ['Chillán', 'Coihueco'] },
};
const TEXTO = 'Se me quemó un enchufe y saltó el automático';

// Deja la pantalla de pedir servicio lista para presionar «Publicar solicitud»
async function hastaPublicar() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Describe lo que necesitas'), TEXTO);
  await user.press(screen.getByRole('button', { name: 'Continuar' }));
  await user.type(await screen.findByLabelText('Dirección exacta'), 'Av. Libertad 1234');
  return user;
}

describe('Pedir servicio: fotos del problema (máx. 2)', () => {
  test('envía hasta 2 fotos en el campo «fotos» al crear, con el contador a la vista', async () => {
    const llamadas = simularApi({
      ...baseSolicitud,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'electricidad' }], no_disponibles: [], comuna: null },
      'POST /solicitudes': (cuerpo) => ({ solicitudes: [{ id: cuerpo.id, estado: 'creada' }] }),
    });
    ImagePicker.launchImageLibraryAsync
      .mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-UNO', uri: 'file://uno.jpg' }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-DOS', uri: 'file://dos.jpg' }] });
    await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Describe lo que necesitas'), TEXTO);
    expect(screen.getByText('0/2')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '🖼️ Galería' }));
    expect(await screen.findByText('1/2')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '🖼️ Galería' }));
    expect(await screen.findByText('2/2')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '🖼️ Galería' })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(await screen.findByLabelText('Dirección exacta'), 'Av. Libertad 1234');
    await user.press(await screen.findByRole('button', { name: 'Publicar solicitud' }));
    expect(await screen.findByText('Pantalla solicitud/[id]')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.ruta === '/solicitudes').cuerpo.fotos).toEqual(['FOTO-UNO', 'FOTO-DOS']);
  });

  test('muestra tal cual el error de solicitud duplicada de la misma categoría (409)', async () => {
    simularApi({
      ...baseSolicitud,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'electricidad' }], no_disponibles: [], comuna: null },
      'POST /solicitudes': errorApi(409, 'SOLICITUD_ACTIVA_MISMA_CATEGORIA',
        'Ya tienes una solicitud activa de Electricidad. Espera a que termine o cancélala para pedir otra.'),
    });
    await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = await hastaPublicar();
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya tienes una solicitud activa de Electricidad. Espera a que termine o cancélala para pedir otra.');
    expect(screen.queryByText('Pantalla solicitud/[id]')).not.toBeOnTheScreen();
  });

  test('muestra tal cual el error de límite de solicitudes por día (409)', async () => {
    simularApi({
      ...baseSolicitud,
      'POST /solicitudes/interpretar': { categorias: [{ slug: 'electricidad' }], no_disponibles: [], comuna: null },
      'POST /solicitudes': errorApi(409, 'LIMITE_SOLICITUDES_DIA',
        'Alcanzaste el máximo de solicitudes por hoy. Inténtalo mañana.'),
    });
    await abrirApp({ ruta: '/nueva-solicitud', pantallas: { 'nueva-solicitud': NuevaSolicitud } });
    const user = await hastaPublicar();
    await user.press(screen.getByRole('button', { name: 'Publicar solicitud' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Alcanzaste el máximo de solicitudes por hoy. Inténtalo mañana.');
  });
});

describe('Catálogo: maestros nuevos', () => {
  const nuevo = {
    id: 'p9', nombre: 'Pedro Campos', descripcion: 'Electricista SEC', comunas_atendidas: ['Chillán'],
    categorias: [{ slug: 'electricidad', nombre: 'Electricidad', verificada: true }],
    calificacion_promedio: 5, total_resenas: 2, es_nuevo: true,
  };
  const antiguo = {
    id: 'p1', nombre: 'Juan Soto', descripcion: 'Poda segura en altura', comunas_atendidas: ['Chillán'],
    categorias: [{ slug: 'poda-altura', nombre: 'Poda en altura', verificada: false }],
    calificacion_promedio: 4.8, total_resenas: 12, es_nuevo: false,
  };
  const pag = (prestadores) => ({ prestadores, paginacion: { total: prestadores.length, pagina: 1, paginas: 1 } });

  test('el chip «✨ Nuevos» agrega nuevos=true y la tarjeta del nuevo muestra el distintivo «Nuevo»', async () => {
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /categorias': { categorias: [{ slug: 'electricidad', nombre: 'Electricidad' }] },
      'GET /comunas': { comunas: ['Chillán'] },
      'GET /prestadores?comuna=Chill%C3%A1n&orden=reputacion&pagina=1&limite=20': pag([nuevo, antiguo]),
      'GET /prestadores?comuna=Chill%C3%A1n&orden=reputacion&nuevos=true&pagina=1&limite=20': pag([nuevo]),
    });
    await abrirApp({ ruta: '/maestros', pantallas: { maestros: Maestros } });
    expect(await screen.findByText('2 maestros disponibles')).toBeOnTheScreen();
    // Solo el maestro nuevo lleva el distintivo
    expect(screen.getByText('Nuevo')).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: '✨ Nuevos' }));
    expect(await screen.findByText('1 maestro disponible')).toBeOnTheScreen();
    const rutas = llamadas.filter((l) => l.ruta.startsWith('/prestadores?')).map((l) => l.ruta);
    expect(rutas.at(-1)).toBe('/prestadores?comuna=Chill%C3%A1n&orden=reputacion&nuevos=true&pagina=1&limite=20');
    expect(screen.getByText('Pedro Campos')).toBeOnTheScreen();
    expect(screen.queryByText('Juan Soto')).not.toBeOnTheScreen();
  });
});

describe('Mi portafolio (Pro)', () => {
  const foto = (id) => ({ id, url: `http://localhost:3000/api/portafolio/${id}.jpg`, creado_en: '2026-11-01T12:00:00Z' });

  test('lista las fotos con el contador, permite subir una y borrar otra con confirmación', async () => {
    usarVariante('pro');
    let fotos = [foto('f1')];
    const forma = () => ({ fotos, maximo: 12 });
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /prestadores/yo/fotos': () => forma(),
      'POST /prestadores/yo/fotos': () => { fotos = [...fotos, foto('f2')]; return forma(); },
      'DELETE /prestadores/yo/fotos/f1': () => { fotos = fotos.filter((f) => f.id !== 'f1'); return forma(); },
    });
    ImagePicker.launchImageLibraryAsync
      .mockResolvedValueOnce({ canceled: false, assets: [{ base64: 'FOTO-NUEVA', uri: 'file://nueva.jpg' }] });
    await abrirApp({ ruta: '/portafolio', pantallas: { portafolio: Portafolio } });

    expect(await screen.findByText('1/12')).toBeOnTheScreen();
    expect(screen.getByLabelText('Foto 1 de mi portafolio')).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '🖼️ Galería' }));
    expect(await screen.findByText('2/12')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ imagen_base64: 'FOTO-NUEVA' });

    await user.press(screen.getByRole('button', { name: 'Borrar foto 1' }));
    expect(await screen.findByText('¿Borrar esta foto?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Sí, borrar' }));
    expect(await screen.findByText('1/12')).toBeOnTheScreen();
    expect(llamadas.some((l) => l.metodo === 'DELETE' && l.ruta === '/prestadores/yo/fotos/f1')).toBe(true);
    expect(screen.queryByLabelText('Foto 2 de mi portafolio')).not.toBeOnTheScreen();
  });

  test('sin fotos muestra el estado vacío y el contador en cero', async () => {
    usarVariante('pro');
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /prestadores/yo/fotos': { fotos: [], maximo: 12 },
    });
    await abrirApp({ ruta: '/portafolio', pantallas: { portafolio: Portafolio } });
    expect(await screen.findByText('Aún no tienes fotos en tu portafolio')).toBeOnTheScreen();
    expect(screen.getByText('0/12')).toBeOnTheScreen();
  });

  test('desde el panel, la tarjeta «Mi portafolio» abre la pantalla', async () => {
    usarVariante('pro');
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /notificaciones': { notificaciones: [], no_leidas: 0 },
      'GET /prestadores/yo': { ficha: {
        disponible: true, categorias: [{ slug: 'poda-altura', nombre: 'Poda', requiere_verificacion: false }],
        comunas_atendidas: ['Chillán'], total_resenas: 0, trabajos_cerrados: 3, calificacion_promedio: 0,
      } },
      'GET /solicitudes?estado=asignada': { solicitudes: [] },
      'GET /prestadores/yo/datos-pago': { datos_pago: { completos: true } },
      'GET /prestadores/yo/dinero': { retenido: 0, por_transferir: 0, transferido: 0, transferencias: [] },
    });
    const app = await abrirApp({ ruta: '/panel', pantallas: { panel: Panel } });
    await userEvent.setup().press(await screen.findByText('🖼️ Mi portafolio'));
    expect(await screen.findByText('Pantalla portafolio')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/portafolio');
  });
});

describe('Solicitud sin respuesta en 1 día hábil', () => {
  const vencida = {
    id: 's1', estado: 'creada', categoria: 'electricidad', categoria_nombre: 'Electricidad',
    descripcion: 'Se quemó un enchufe', comuna: 'Chillán', direccion: 'Av. Libertad 1234',
    creado_en: '2026-11-10T12:00:00Z', prestador: null, precio_acordado: null,
    sin_respuesta: true, respuesta_vence_en: '2026-11-12T12:00:00Z', eventos: [],
  };
  const candidato = {
    id: 'p2', nombre: 'Pedro Campos', calificacion_promedio: 4.5, total_resenas: 3, comunas_atendidas: ['Chillán'],
  };
  const rutasDetalle = {
    'GET /auth/yo': { usuario: cliente },
    'GET /solicitudes/s1': { solicitud: vencida },
    'GET /prestadores?categoria=electricidad&comuna=Chill%C3%A1n&limite=20': { prestadores: [candidato] },
    'GET /solicitudes/s1/fotos': { fotos: [], puede_subir: true, maximo_por_persona: 12 },
  };

  test('en el detalle avisa y «Elegir» asigna a otro maestro con el flujo de siempre', async () => {
    const llamadas = simularApi({
      ...rutasDetalle,
      'POST /solicitudes/s1/asignar': { solicitud: {
        ...vencida, estado: 'asignada', sin_respuesta: false,
        prestador: { id: 'p2', nombre: 'Pedro Campos' }, responder_antes_de: '2026-11-14T15:00:00Z',
      } },
    });
    await abrirApp({ ruta: '/solicitud/s1', pantallas: { 'solicitud/[id]': DetalleSolicitud } });

    expect(await screen.findByText(/El maestro no respondió en 1 día hábil/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Elegir otro maestro' })).toBeOnTheScreen();
    expect(await screen.findByText('Elige quién lo hará')).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Elegir' }));
    expect(await screen.findByText(/Esperando que Pedro Campos responda/)).toBeOnTheScreen();
    expect(llamadas.find((l) => l.ruta === '/solicitudes/s1/asignar').cuerpo).toEqual({ prestador_id: 'p2' });
  });

  test('en la lista del inicio la tarjeta avisa y su acción lleva al detalle para asignar', async () => {
    simularApi({
      ...rutasDetalle,
      'GET /solicitudes': { solicitudes: [vencida] },
      'GET /prestadores?comuna=Chill%C3%A1n&limite=1': { prestadores: [], paginacion: { total: 3, pagina: 1, paginas: 3 } },
    });
    const app = await abrirApp({
      ruta: '/', pantallas: { index: Inicio, 'solicitud/[id]': DetalleSolicitud },
    });
    expect(await screen.findByText(/El maestro no respondió en 1 día hábil/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Elegir otro maestro' }));
    expect(await screen.findByText('Elige quién lo hará')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/solicitud/s1');
  });
});

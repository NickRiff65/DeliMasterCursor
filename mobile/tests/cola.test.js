import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Network from 'expo-network';
import * as almacenCola from '../src/lib/almacenCola';
import { SesionProvider, useSesion } from '../src/context/sesion';
import { ColaProvider, useCola } from '../src/context/cola';
import { simularApi, errorApi, SIN_CONEXION, sesionGuardada, usarVariante, cliente, prestador } from './ayudas';

// HU-12: solicitudes creadas sin señal (zonas rurales como Coihueco) que se envían solas después
function Proveedores({ children }) {
  return <SesionProvider><ColaProvider>{children}</ColaProvider></SesionProvider>;
}

async function abrirCola() {
  const { result } = await renderHook(() => ({ cola: useCola(), sesion: useSesion() }), { wrapper: Proveedores });
  await waitFor(() => expect(result.current.sesion.cargando).toBe(false));
  return result;
}

const cortarSenal = () => act(async () => Network.__cambiar({ isConnected: false, isInternetReachable: false }));
const volverSenal = () => act(async () => Network.__cambiar({ isConnected: true, isInternetReachable: true }));

const solicitud = (n, extra = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, descripcion: `Solicitud número ${n}`, comuna: 'Coihueco',
  creado_en_dispositivo: '2026-10-08T10:00:00.000Z', ...extra,
});
const guardada = (n, usuarioId = 'c1', extra = {}) => ({
  id: solicitud(n).id, usuario_id: usuarioId, datos: solicitud(n, extra), estado: 'pendiente', error: null, intentos: 0,
  creado_en: `2026-10-08T10:0${n}:00.000Z`,
});
const creada = (cuerpo) => ({ solicitudes: [{ id: cuerpo.id, estado: 'creada' }] });

beforeEach(() => sesionGuardada());

describe('Cola sin conexión (HU-12)', () => {
  test('sin señal la solicitud queda guardada y se envía sola al volver la conexión, con el mismo id', async () => {
    const llamadas = simularApi({ 'GET /auth/yo': { usuario: cliente }, 'POST /solicitudes': creada });
    const r = await abrirCola();
    await cortarSenal();
    await act(() => r.current.cola.encolar(solicitud(1)));
    expect(r.current.cola.items).toHaveLength(1);
    expect(r.current.cola.conectado).toBe(false);

    await volverSenal();
    await waitFor(() => expect(r.current.cola.items).toHaveLength(0));
    const envios = llamadas.filter((l) => l.ruta === '/solicitudes');
    expect(envios).toHaveLength(1);
    expect(envios[0].cuerpo).toEqual(solicitud(1));   // el UUID del celular evita duplicados al reintentar
  });

  test('si se pidió desde el perfil de un prestador, al crearla se le asigna', async () => {
    almacenCola.guardar(guardada(1, 'c1', { prestador_id: 'p9' }));
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      'POST /solicitudes': creada,
      [`POST /solicitudes/${solicitud(1).id}/asignar`]: { solicitud: {} },
    });
    const r = await abrirCola();
    await waitFor(() => expect(r.current.cola.items).toHaveLength(0));
    const [crear, asignar] = llamadas.filter((l) => l.metodo === 'POST');
    expect(crear.cuerpo).not.toHaveProperty('prestador_id');
    expect(asignar.cuerpo).toEqual({ prestador_id: 'p9' });
  });

  test('si el servidor rechaza una, queda para revisar y se siguen enviando las demás', async () => {
    almacenCola.guardar(guardada(1));
    almacenCola.guardar(guardada(2));
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      'POST /solicitudes': (cuerpo) => (cuerpo.id === solicitud(1).id
        ? errorApi(422, 'SIN_CATEGORIA', 'No identificamos el servicio. Elígelo.')
        : creada(cuerpo)),
    });
    const r = await abrirCola();
    await waitFor(() => expect(r.current.cola.items).toHaveLength(1));
    expect(r.current.cola.items[0]).toMatchObject({
      id: solicitud(1).id, estado: 'revisar', error: 'No identificamos el servicio. Elígelo.', intentos: 1,
    });
  });

  test('si se corta la señal a mitad del envío se detiene y conserva el orden', async () => {
    almacenCola.guardar(guardada(1));
    almacenCola.guardar(guardada(2));
    almacenCola.guardar(guardada(3));
    let enviadas = 0;
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      'POST /solicitudes': (cuerpo) => (++enviadas === 2 ? SIN_CONEXION : creada(cuerpo)),
    });
    const r = await abrirCola();
    await waitFor(() => expect(r.current.cola.items).toHaveLength(2));
    expect(r.current.cola.items.map((i) => i.id)).toEqual([solicitud(2).id, solicitud(3).id]);
    expect(r.current.cola.items.every((i) => i.estado === 'pendiente')).toBe(true);
    expect(r.current.cola.conectado).toBe(false);
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(2);   // la tercera ni se intentó
  });

  test('con el servidor caído (500) no se marca como error: se reintenta después', async () => {
    almacenCola.guardar(guardada(1));
    const llamadas = simularApi({ 'GET /auth/yo': { usuario: cliente }, 'POST /solicitudes': errorApi(503, 'CAIDO', 'Servicio no disponible') });
    const r = await abrirCola();
    await waitFor(() => expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(1));
    await waitFor(() => expect(r.current.cola.enviando).toBe(false));
    expect(r.current.cola.items).toHaveLength(1);
    expect(r.current.cola.items[0]).toMatchObject({ estado: 'pendiente', intentos: 0 });
  });

  test('una solicitud corregida (eligiendo el servicio) se reintenta con los cambios', async () => {
    almacenCola.guardar({ ...guardada(1), estado: 'revisar', error: 'No identificamos el servicio.' });
    const llamadas = simularApi({ 'GET /auth/yo': { usuario: cliente }, 'POST /solicitudes': creada });
    const r = await abrirCola();
    await waitFor(() => expect(r.current.cola.items).toHaveLength(1));
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(0);   // las que están en revisión no se envían solas

    await act(() => r.current.cola.reintentar(r.current.cola.items[0], { categorias: ['poda-altura'] }));
    await waitFor(() => expect(r.current.cola.items).toHaveLength(0));
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo.categorias).toEqual(['poda-altura']);
  });

  test('descartar la quita del celular sin enviarla', async () => {
    almacenCola.guardar({ ...guardada(1), estado: 'revisar' });
    simularApi({ 'GET /auth/yo': { usuario: cliente } });
    const r = await abrirCola();
    await waitFor(() => expect(r.current.cola.items).toHaveLength(1));
    await act(() => r.current.cola.descartar(solicitud(1).id));
    expect(r.current.cola.items).toHaveLength(0);
    expect(almacenCola.__todos()).toHaveLength(0);
  });

  test('mientras haya pendientes se reintenta cada 30 segundos, aunque no llegue aviso de la red', async () => {
    jest.useFakeTimers();
    try {
      almacenCola.guardar(guardada(1));
      let conSenal = false;
      const llamadas = simularApi({
        'GET /auth/yo': { usuario: cliente },
        'POST /solicitudes': (cuerpo) => (conSenal ? creada(cuerpo) : SIN_CONEXION),
      });
      const r = await abrirCola();
      await waitFor(() => expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(1));
      conSenal = true;                                   // la señal vuelve sin que el sistema avise
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      await waitFor(() => expect(r.current.cola.items).toHaveLength(0));
      expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('cada persona ve solo sus pendientes, y DeliMaster Pro no envía solicitudes', async () => {
    usarVariante('pro');
    almacenCola.guardar(guardada(1, 'c1'));
    almacenCola.guardar(guardada(2, 'p1'));
    const llamadas = simularApi({ 'GET /auth/yo': { usuario: prestador } });
    const r = await abrirCola();
    await waitFor(() => expect(r.current.cola.items.map((i) => i.id)).toEqual([solicitud(2).id]));
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(0);
  });
});

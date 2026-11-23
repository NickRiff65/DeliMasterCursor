import { screen } from 'expo-router/testing-library';
import Terminos from '../src/app/terminos';
import Privacidad from '../src/app/privacidad';
import AceptarTerminos from '../src/app/aceptar-terminos';
import { TERMINOS, PRIVACIDAD, paraApp } from '../src/legal/textos';
import { abrirApp, simularApi, usarVariante, sesionGuardada, cliente, prestador } from './ayudas';

// Cada app muestra sus términos: al cliente no se le habla del panel contable y al maestro no se le
// ofrece una detección por foto que su app no tiene
afterEach(() => usarVariante('lite'));

const textoDe = (secciones) => secciones.flatMap(([titulo, parrafos]) => [titulo, ...parrafos]).join('\n');

describe('Textos legales por app', () => {
  test('cada párrafo se resuelve por app y ninguna sección queda vacía', () => {
    for (const rol of ['cliente', 'prestador']) {
      for (const secciones of [TERMINOS, PRIVACIDAD]) {
        for (const [, parrafos] of paraApp(secciones, rol)) {
          expect(parrafos.length).toBeGreaterThan(0);
          for (const p of parrafos) expect(typeof p).toBe('string');
        }
      }
    }
    const privacidadCliente = textoDe(paraApp(PRIVACIDAD, 'cliente'));
    const privacidadMaestro = textoDe(paraApp(PRIVACIDAD, 'prestador'));
    expect(privacidadCliente).toMatch(/Detectar el problema con la foto/);
    expect(privacidadCliente).not.toMatch(/panel contable/);
    expect(privacidadMaestro).not.toMatch(/Detectar el problema con la foto/);
    expect(privacidadMaestro).toMatch(/Tu actividad como prestador/);
  });

  test('la app de clientes explica que la IA le propone la descripción', async () => {
    simularApi({});
    await abrirApp({ ruta: '/terminos', pantallas: { terminos: Terminos } });
    expect(await screen.findByText(/puedes pedir que una inteligencia artificial detecte el problema/)).toBeOnTheScreen();
    expect(screen.queryByText(/pregúntale al cliente por el chat antes de aceptar o cotizar/)).toBeNull();
  });

  test('la app de maestros explica que la descripción puede venir de la IA y que revise las fotos', async () => {
    usarVariante('pro');
    simularApi({});
    await abrirApp({ ruta: '/terminos', pantallas: { terminos: Terminos } });
    expect(await screen.findByText(/pregúntale al cliente por el chat antes de aceptar o cotizar/)).toBeOnTheScreen();
    expect(screen.queryByText(/puedes pedir que una inteligencia artificial/)).toBeNull();
  });

  test('la privacidad del maestro no habla de sus fotos enviadas a la IA', async () => {
    usarVariante('pro');
    simularApi({});
    await abrirApp({ ruta: '/privacidad', pantallas: { privacidad: Privacidad } });
    expect(await screen.findByText(/Tu actividad como prestador/)).toBeOnTheScreen();
    expect(screen.queryByText(/Detectar el problema con la foto/)).toBeNull();
  });

  test('el resumen al aceptar una versión nueva es distinto en cada app', async () => {
    sesionGuardada();
    simularApi({ 'GET /auth/yo': { usuario: { ...cliente, terminos_pendientes: true } } });
    await abrirApp({ ruta: '/aceptar-terminos', pantallas: { 'aceptar-terminos': AceptarTerminos } });
    expect(await screen.findByText(/Si pides que la IA detecte el problema con tus fotos/)).toBeOnTheScreen();
    expect(screen.queryByText(/Tienes 1 día para aceptar o rechazar/)).toBeNull();
  });

  test('el maestro ve en el resumen lo suyo: responder, llegar con el código y cobrar', async () => {
    usarVariante('pro');
    sesionGuardada();
    simularApi({ 'GET /auth/yo': { usuario: { ...prestador, terminos_pendientes: true } } });
    await abrirApp({ ruta: '/aceptar-terminos', pantallas: { 'aceptar-terminos': AceptarTerminos } });
    expect(await screen.findByText(/Tienes 1 día para aceptar o rechazar cada solicitud/)).toBeOnTheScreen();
    expect(screen.getByText(/confirmas tu llegada con el código de 4 dígitos/)).toBeOnTheScreen();
    expect(screen.queryByText(/Si pides que la IA detecte el problema/)).toBeNull();
  });
});

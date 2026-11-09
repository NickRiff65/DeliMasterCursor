import { screen, userEvent } from 'expo-router/testing-library';
import Verificaciones from '../src/app/verificaciones';
import { abrirApp, simularApi, sesionGuardada, usarVariante, prestador } from './ayudas';

// Pro: verificaciones oficiales. Si ya está verificado en un oficio, se le dice en vez de ofrecer verificarse otra vez.
const CATEGORIAS = [
  { slug: 'electricidad', nombre: 'Electricidad', requiere_verificacion: true, organismo: 'SEC' },
  { slug: 'gas', nombre: 'Instalaciones de gas', requiere_verificacion: true, organismo: 'SEC' },
  { slug: 'poda-altura', nombre: 'Poda de altura', requiere_verificacion: false, organismo: null },
];
const enDias = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const verificacion = (categoria, nombre, extra) => ({
  id: `v-${categoria}`, categoria, categoria_nombre: nombre, organismo: 'SEC', numero_registro: 'SEC-123',
  estado: 'aprobada', vence_en: enDias(60), renovada: false, creado_en: '2026-10-01T12:00:00Z', ...extra,
});

async function abrir(verificaciones) {
  usarVariante('pro');
  sesionGuardada();
  simularApi({
    'GET /auth/yo': { usuario: prestador },
    'GET /categorias': { categorias: CATEGORIAS },
    'GET /prestadores/yo/verificaciones': { verificaciones },
  });
  await abrirApp({ ruta: '/verificaciones', pantallas: { verificaciones: Verificaciones } });
}

describe('Verificaciones (Pro)', () => {
  test('ya verificado: lo dice con su vigencia y no ofrece verificarse de nuevo en ese oficio', async () => {
    await abrir([verificacion('electricidad', 'Electricidad')]);
    // Parte en el oficio que le falta
    expect(await screen.findByRole('button', { name: 'Enviar solicitud' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '✓ Electricidad · SEC' })).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: '✓ Electricidad · SEC' }));
    expect(screen.getByText('✅ Ya estás verificado por la SEC en Electricidad')).toBeOnTheScreen();
    expect(screen.getByText(/Vigente hasta el .*Apareces en el catálogo para este servicio/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Enviar solicitud' })).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('N.º de registro SEC')).not.toBeOnTheScreen();
  });

  test('con la solicitud en revisión, avisa que se está revisando', async () => {
    await abrir([verificacion('electricidad', 'Electricidad'), verificacion('gas', 'Instalaciones de gas', { estado: 'pendiente', vence_en: null })]);
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Instalaciones de gas · SEC' }));
    expect(screen.getByText('⏳ Tu solicitud para Instalaciones de gas está en revisión')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Enviar solicitud' })).not.toBeOnTheScreen();
  });

  describe('verificación automática con la SEC', () => {
    async function completar(estado) {
      usarVariante('pro');
      sesionGuardada();
      let lista = [];
      const llamadas = simularApi({
        'GET /auth/yo': { usuario: prestador },
        'GET /categorias': { categorias: CATEGORIAS },
        'GET /prestadores/yo/verificaciones': () => ({ verificaciones: lista }),
        'POST /prestadores/yo/verificaciones': () => {
          const v = verificacion('electricidad', 'Electricidad', { estado });
          lista = [v];
          return { verificacion: v };
        },
      });
      await abrirApp({ ruta: '/verificaciones', pantallas: { verificaciones: Verificaciones } });
      const user = userEvent.setup();
      await user.type(await screen.findByLabelText('N.º de registro SEC'), 'SEC-123');
      await user.type(screen.getByLabelText('Código del certificado SEC'), '7731-2209');
      expect(screen.getByRole('button', { name: 'Enviar solicitud' })).toBeDisabled();
      await user.type(screen.getByLabelText('RUT'), '12.345.678-5');
      await user.type(screen.getByLabelText('Apellido paterno'), 'Soto');
      expect(screen.getByText(/autorizas a DeliMaster a consultar tu RUT/)).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Enviar solicitud' }));
      return llamadas.find((l) => l.metodo === 'POST');
    }

    test('envía RUT y apellidos, y si la SEC lo confirma dice que quedó verificado', async () => {
      const envio = await completar('aprobada');
      expect(envio.cuerpo).toEqual({
        categoria: 'electricidad', numero_registro: 'SEC-123', codigo_certificado: '7731-2209', rut: '12.345.678-5', apellido_paterno: 'Soto',
      });
      expect(await screen.findByText('✅ La SEC confirmó tu registro: ya quedaste verificado.')).toBeOnTheScreen();
    });

    test('si queda en revisión, avisa que el equipo la revisará', async () => {
      await completar('pendiente');
      expect(await screen.findByText('Solicitud enviada. Te avisaremos cuando el equipo la revise.')).toBeOnTheScreen();
    });
  });

  test('cuando su certificado está por vencer, ofrece renovarlo', async () => {
    await abrir([verificacion('electricidad', 'Electricidad', { vence_en: enDias(5) }), verificacion('gas', 'Instalaciones de gas')]);
    expect(await screen.findByText(/Tu verificación de Electricidad vence el/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Renovar verificación' })).toBeOnTheScreen();
  });
});

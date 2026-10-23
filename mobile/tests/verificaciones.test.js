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

  test('cuando su certificado está por vencer, ofrece renovarlo', async () => {
    await abrir([verificacion('electricidad', 'Electricidad', { vence_en: enDias(5) }), verificacion('gas', 'Instalaciones de gas')]);
    expect(await screen.findByText(/Tu verificación de Electricidad vence el/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Renovar verificación' })).toBeOnTheScreen();
  });
});

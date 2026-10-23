import { render, screen } from '@testing-library/react-native';
import { debeSugerirInstalar, InstalarEnIphone } from '../src/components/InstalarEnIphone';

// Versión web en iPhone: se explica cómo agregarla a la pantalla de inicio (no hay botón "Instalar")
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const ventana = (standalone = false) => ({ matchMedia: () => ({ matches: standalone }) });

describe('Aviso para instalar en el iPhone', () => {
  test('aparece en Safari del iPhone y del iPad, mientras no esté instalada', () => {
    expect(debeSugerirInstalar({ os: 'web', nav: { userAgent: IPHONE }, ventana: ventana() })).toBe(true);
    // El iPad se presenta como un Mac, pero con pantalla táctil
    expect(debeSugerirInstalar({ os: 'web', nav: { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }, ventana: ventana() })).toBe(true);
  });

  test('no aparece si ya se abrió desde la pantalla de inicio', () => {
    expect(debeSugerirInstalar({ os: 'web', nav: { userAgent: IPHONE, standalone: true }, ventana: ventana() })).toBe(false);
    expect(debeSugerirInstalar({ os: 'web', nav: { userAgent: IPHONE }, ventana: ventana(true) })).toBe(false);
  });

  test('no aparece en Android, en el computador ni en las APK', async () => {
    expect(debeSugerirInstalar({ os: 'web', nav: { userAgent: ANDROID }, ventana: ventana() })).toBe(false);
    expect(debeSugerirInstalar({ os: 'web', nav: { userAgent: 'Windows NT 10.0', platform: 'Win32', maxTouchPoints: 0 }, ventana: ventana() })).toBe(false);
    expect(debeSugerirInstalar({ os: 'android', nav: { userAgent: IPHONE }, ventana: ventana() })).toBe(false);
    await render(<InstalarEnIphone />);           // en las pruebas la plataforma es nativa
    expect(screen.queryByText(/Agregar a pantalla de inicio/)).not.toBeOnTheScreen();
  });
});

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { paletas, usarPaleta } from '../theme';

// Modo claro u oscuro (Mi cuenta → Apariencia). La preferencia queda en el dispositivo:
//   sistema → sigue la configuración del teléfono · claro · oscuro
const CLAVE = 'delimaster.tema';
export const PREFERENCIAS = ['sistema', 'claro', 'oscuro'];

function leerPreferencia() {
  try {
    const valor = Platform.OS === 'web' ? localStorage.getItem(CLAVE) : SecureStore.getItem(CLAVE);
    return PREFERENCIAS.includes(valor) ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

function guardarPreferencia(valor) {
  try {
    if (Platform.OS === 'web') localStorage.setItem(CLAVE, valor);
    else SecureStore.setItem(CLAVE, valor);
  } catch { /* sin almacenamiento: vale solo mientras la app esté abierta */ }
}

// Fuera de TemaProvider (por ejemplo, un componente probado por separado) se usa el modo claro
const TemaContext = createContext({
  preferencia: 'claro', esOscuro: false, colores: paletas.claro, cambiarPreferencia: () => {},
});

export function TemaProvider({ children }) {
  const delTelefono = useColorScheme();                 // 'light' | 'dark' | null
  const [preferencia, setPreferencia] = useState(leerPreferencia);
  const esOscuro = preferencia === 'oscuro' || (preferencia === 'sistema' && delTelefono === 'dark');
  const paleta = esOscuro ? paletas.oscuro : paletas.claro;
  usarPaleta(paleta);                                   // antes de que se dibujen las pantallas

  // Web: fondo de la página, controles del navegador y color de la barra de Safari
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = paleta.fondo;
    document.documentElement.style.colorScheme = esOscuro ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paleta.superficie);
  }, [paleta, esOscuro]);

  const cambiarPreferencia = useCallback((valor) => {
    guardarPreferencia(valor);
    setPreferencia(valor);
  }, []);

  const valor = useMemo(
    () => ({ preferencia, esOscuro, colores: paleta, cambiarPreferencia }),
    [preferencia, esOscuro, paleta, cambiarPreferencia],
  );
  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

// Las pantallas lo llaman para volver a dibujarse con la paleta nueva al cambiar el modo
export const useTema = () => useContext(TemaContext);

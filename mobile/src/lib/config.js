import { Platform } from 'react-native';

// Dirección de la API.
// - Web compilada (la entrega el propio servidor en /, /pro): la misma dirección de la página.
// - Web en desarrollo (Metro, puertos 8081/8082): el mismo computador, puerto 3000; así funciona
//   con cualquier red (Wi-Fi de la casa, punto de acceso del celular) sin cambiar nada.
// - APK o Expo Go: EXPO_PUBLIC_API_URL (en eas.json para las APK, en mobile/.env.local para Expo Go).
function direccionApi() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return __DEV__
      ? `${window.location.protocol}//${window.location.hostname}:3000/api`
      : `${window.location.origin}/api`;
  }
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
}
export const API_URL = direccionApi();

// OWASP M5 (comunicación insegura): una app publicada nunca habla con la API sin cifrar.
// En desarrollo se permite http porque la API corre en el computador de la red local. La versión
// web usa la dirección desde la que se abrió (https por internet, http solo dentro de la red local).
if (!__DEV__ && Platform.OS !== 'web' && !API_URL.startsWith('https://')) {
  throw new Error('En producción EXPO_PUBLIC_API_URL debe usar https://');
}

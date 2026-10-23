import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { VARIANTE } from './variante';

// Guarda el token de sesión cifrado en el celular (Keychain en iOS, Keystore en Android).
// En web (solo para desarrollo) SecureStore no existe y se usa localStorage.
const CLAVE_TOKEN = `delimaster.token.${VARIANTE}`;
const esWeb = Platform.OS === 'web';

export async function guardarToken(token) {
  if (esWeb) return localStorage.setItem(CLAVE_TOKEN, token);
  return SecureStore.setItemAsync(CLAVE_TOKEN, token);
}

export async function leerToken() {
  if (esWeb) return localStorage.getItem(CLAVE_TOKEN);
  return SecureStore.getItemAsync(CLAVE_TOKEN);
}

export async function borrarToken() {
  if (esWeb) return localStorage.removeItem(CLAVE_TOKEN);
  return SecureStore.deleteItemAsync(CLAVE_TOKEN);
}

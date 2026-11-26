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

// Copia de los datos del usuario de la última sesión: permite abrir la app con la sesión iniciada aunque al abrirla
// no haya señal o el servidor tarde en responder (antes cualquier falla de red cerraba la sesión).
const CLAVE_USUARIO = `delimaster.usuario.${VARIANTE}`;

export async function guardarUsuario(usuario) {
  const texto = JSON.stringify(usuario);
  if (esWeb) return localStorage.setItem(CLAVE_USUARIO, texto);
  return SecureStore.setItemAsync(CLAVE_USUARIO, texto);
}

export async function leerUsuario() {
  try {
    const texto = esWeb ? localStorage.getItem(CLAVE_USUARIO) : await SecureStore.getItemAsync(CLAVE_USUARIO);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

export async function borrarUsuario() {
  if (esWeb) return localStorage.removeItem(CLAVE_USUARIO);
  return SecureStore.deleteItemAsync(CLAVE_USUARIO);
}

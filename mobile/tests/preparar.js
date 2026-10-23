// Se ejecuta antes de cada archivo de pruebas de las apps. Reemplaza lo que necesita un celular
// real (almacenamiento cifrado, red, SQLite, cámara, Socket.io) por versiones en memoria.

// Variante de la app (Lite o Pro): las pruebas la cambian con usarVariante() de ayudas.js
jest.mock('../src/lib/variante', () => ({
  __esModule: true, VARIANTE: 'lite', ES_PRO: false, ROL_APP: 'cliente', NOMBRE_APP: 'DeliMaster Lite',
}));

// Keychain / Keystore
jest.mock('expo-secure-store', () => {
  const datos = new Map();
  return {
    __datos: datos,
    setItemAsync: async (clave, valor) => { datos.set(clave, valor); },
    getItemAsync: async (clave) => datos.get(clave) ?? null,
    deleteItemAsync: async (clave) => { datos.delete(clave); },
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => { datos.set(clave, valor); },
  };
});

// Estado de la red, que las pruebas cortan y devuelven con cambiarRed()
jest.mock('expo-network', () => {
  const oyentes = new Set();
  const red = { isConnected: true, isInternetReachable: true };
  return {
    __red: red,
    __cambiar(estado) {
      Object.assign(red, estado);
      oyentes.forEach((f) => f({ ...red }));
    },
    getNetworkStateAsync: async () => ({ ...red }),
    addNetworkStateListener: (f) => {
      oyentes.add(f);
      return { remove: () => oyentes.delete(f) };
    },
  };
});

// Cola sin conexión (SQLite en el celular): misma lógica, en memoria
jest.mock('../src/lib/almacenCola', () => {
  let items = [];
  return {
    __vaciar: () => { items = []; },
    __todos: () => items,
    guardar: async (item) => { items = [...items.filter((i) => i.id !== item.id), item]; },
    listar: async (usuarioId) => items
      .filter((i) => i.usuario_id === usuarioId)
      .sort((a, b) => a.creado_en.localeCompare(b.creado_en)),
    quitar: async (id) => { items = items.filter((i) => i.id !== id); },
  };
});

jest.mock('../src/lib/socket', () => {
  const socket = { on: () => {}, off: () => {}, emit: () => {}, connected: false };
  return { obtenerSocket: () => socket, desconectarSocket: () => {} };
});

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[prueba]' })),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

beforeEach(() => {
  require('expo-secure-store').__datos.clear();
  require('../src/lib/almacenCola').__vaciar();
  require('expo-network').__cambiar({ isConnected: true, isInternetReachable: true });
  Object.assign(require('../src/lib/variante'), {
    VARIANTE: 'lite', ES_PRO: false, ROL_APP: 'cliente', NOMBRE_APP: 'DeliMaster Lite',
  });
});

afterEach(() => {
  require('../src/lib/api').usarToken(null);
});

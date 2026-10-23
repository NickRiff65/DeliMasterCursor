// Configuración de Metro (empaquetador de Expo).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Lite y Pro comparten código pero no deben compartir caché: la configuración de cada variante
// queda incrustada en lo que Metro guarda, y con una sola caché la variante que arrancaba
// después recibía la de la otra (por ejemplo, el puerto de Pro servía la app Lite).
const variante = process.env.APP_VARIANTE === 'pro' ? 'pro' : 'lite';
config.cacheStores = ({ FileStore }) => [
  new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', `metro-${variante}`) }),
];

module.exports = config;

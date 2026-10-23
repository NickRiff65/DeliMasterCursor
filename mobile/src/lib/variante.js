import Constants from 'expo-constants';

// Variante de la app definida en app.config.js
export const VARIANTE = Constants.expoConfig?.extra?.variante === 'pro' ? 'pro' : 'lite';
export const ES_PRO = VARIANTE === 'pro';

// Rol de usuario que atiende cada variante
export const ROL_APP = ES_PRO ? 'prestador' : 'cliente';
export const NOMBRE_APP = ES_PRO ? 'DeliMaster Pro' : 'DeliMaster Lite';

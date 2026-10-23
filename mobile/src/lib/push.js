import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';

// Pide permiso y registra el teléfono para recibir avisos con la app cerrada.
// En la web no hay token de Expo: ahí siguen el aviso dentro de la página y el correo.
export async function registrarAvisosPush() {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
      }),
    });
    const actual = await Notifications.getPermissionsAsync();
    const permiso = actual.granted ? actual : await Notifications.requestPermissionsAsync();
    if (!permiso.granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/notificaciones/dispositivo', { token: data, plataforma: Platform.OS });
  } catch {
    // Sin el módulo nativo (una APK anterior) los avisos dentro de la app siguen funcionando.
  }
}

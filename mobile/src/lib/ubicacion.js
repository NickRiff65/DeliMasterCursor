import { Linking, Platform } from 'react-native';

// Ubicación GPS del cliente ("Usar mi ubicación") para que el maestro llegue al lugar exacto, sobre todo
// en sectores rurales de Coihueco sin número de casa. En la web se usa la del navegador. En el celular,
// expo-location se carga solo al pedirla: las APK anteriores no lo traen y ahí se explica que deben
// actualizar la app (la dirección escrita sigue funcionando igual).
export async function ubicacionActual() {
  if (Platform.OS === 'web') {
    if (!navigator.geolocation) throw new Error('Tu navegador no permite compartir la ubicación. Escribe la dirección.');
    return new Promise((resolver, rechazar) => navigator.geolocation.getCurrentPosition(
      (p) => resolver({ latitud: p.coords.latitude, longitud: p.coords.longitude, precision: p.coords.accuracy }),
      () => rechazar(new Error('No pudimos obtener tu ubicación. Revisa el permiso de ubicación del navegador.')),
      { enableHighAccuracy: true, timeout: 15000 },
    ));
  }
  let Location;
  try {
    Location = require('expo-location');
  } catch {
    throw new Error('Para usar tu ubicación, instala la versión más reciente de la app. Mientras, escribe la dirección.');
  }
  const permiso = await Location.requestForegroundPermissionsAsync();
  if (!permiso.granted) throw new Error('Necesitamos permiso de ubicación para guardarla. También puedes escribir la dirección.');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitud: p.coords.latitude, longitud: p.coords.longitude, precision: p.coords.accuracy };
}

// Abre el lugar del trabajo en Google Maps (por coordenadas si las hay; si no, por la dirección)
export function abrirEnMapa({ direccion, comuna, latitud, longitud }) {
  const consulta = latitud != null ? `${latitud},${longitud}` : `${direccion}, ${comuna}, Chile`;
  return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`);
}

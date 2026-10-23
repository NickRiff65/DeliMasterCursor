// Una base de código, dos apps (como define el informe):
//   DeliMaster Lite → clientes      (por defecto)
//   DeliMaster Pro  → prestadores   (APP_VARIANTE=pro)
// La variante viaja en `extra` y se lee en tiempo de ejecución con expo-constants.
const esPro = process.env.APP_VARIANTE === 'pro';

// Proyectos en Expo (EAS Build), de la organización delimasters-team: uno por app
const PROYECTO_EAS = {
  lite: { slug: 'delimaster', id: 'dc57db4f-4f31-4f92-8973-134f0370369c' },
  pro: { slug: 'delimaster-pro', id: 'ce7fb789-109b-4d61-8f68-a0843b4d799e' },
};
const proyecto = PROYECTO_EAS[esPro ? 'pro' : 'lite'];

module.exports = ({ config }) => ({
  ...config,
  name: esPro ? 'DeliMaster Pro' : 'DeliMaster Lite',
  slug: proyecto.slug,
  owner: 'delimasters-team',
  scheme: esPro ? 'delimasterpro' : 'delimaster',
  // Íconos de DeliMaster: Lite verde azulado, Pro gris oscuro (la "D" con el punto ámbar)
  icon: `./assets/web/${esPro ? 'pro' : 'lite'}/icono-1024.png`,
  ios: { ...config.ios, bundleIdentifier: esPro ? 'cl.delimaster.pro' : 'cl.delimaster.lite' },
  android: {
    ...config.android,
    package: esPro ? 'cl.delimaster.pro' : 'cl.delimaster.lite',
    // Sube con cada APK nueva para que Android la instale como actualización de la anterior
    versionCode: 5,
    // OWASP M9: sin respaldo automático de los datos de la app en la nube de Google
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: './assets/android/adaptable-primer-plano.png',
      monochromeImage: './assets/android/adaptable-monocromo.png',
      backgroundColor: esPro ? '#1F2937' : '#0F766E',
    },
  },
  extra: { ...config.extra, variante: esPro ? 'pro' : 'lite', eas: { projectId: proyecto.id } },
  // Actualizaciones sin reinstalar (EAS Update): las APK descargan las correcciones al abrirse.
  // Si cambia algo nativo (un paquete nuevo con código nativo), se sube "version" y se compila otra vez.
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: `https://u.expo.dev/${proyecto.id}` },
  // Versión web compilada que entrega el servidor: Lite en / y Pro en /pro (npm.cmd run web:exportar)
  ...(process.env.EXPO_BASE_URL ? { experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL } } : {}),
});

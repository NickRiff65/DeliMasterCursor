import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SesionProvider, useSesion } from '../context/sesion';
import { ColaProvider } from '../context/cola';
import { TemaProvider, useTema } from '../context/tema';
import { InstalarEnIphone } from '../components/InstalarEnIphone';
import { FondoPantalla } from '../components/FondoPantalla';
import { BotonInicio } from '../components/BotonInicio';
import { AvisoFlotante } from '../components/AvisoFlotante';
import { AvisosProvider } from '../context/avisos';
import { ES_PRO, NOMBRE_APP } from '../lib/variante';
import { colores, degradado } from '../theme';

// Pantallas interiores (con sesión): llevan un botón para volver al inicio en el encabezado
const conInicio = (opciones) => ({ ...opciones, headerRight: () => <BotonInicio /> });

function Navegacion() {
  const { usuario, cargando } = useSesion();
  const { esOscuro } = useTema();

  // Mientras se revisa si hay una sesión guardada
  if (cargando) {
    return (
      <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.fondo }, degradado(colores.degradadoFondo)]}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  const conSesion = Boolean(usuario);
  // Quien no ha aceptado los términos vigentes solo ve la pantalla para aceptarlos
  const pendientes = conSesion && usuario.terminos_pendientes;
  const habilitado = conSesion && !pendientes;
  // El orden importa: si una ruta queda bloqueada, Expo Router lleva a la primera disponible.
  // Colores de la navegación (encabezados, fondo entre pantallas) según el modo claro u oscuro
  const base = esOscuro ? DarkTheme : DefaultTheme;
  const temaNavegacion = {
    ...base,
    colors: {
      ...base.colors, primary: colores.primario, background: colores.fondo, card: colores.superficie,
      text: colores.texto, border: colores.borde, notification: colores.error,
    },
  };
  return (
    <ThemeProvider value={temaNavegacion}>
      <StatusBar style={esOscuro ? 'light' : 'dark'} />
      <Stack
        // Cada pantalla se dibuja sobre el fondo degradado; el encabezado toma su color de arriba
        screenLayout={({ children }) => <FondoPantalla>{children}</FondoPantalla>}
        screenOptions={{
          headerTintColor: colores.primarioOscuro,
          headerStyle: { backgroundColor: colores.fondoArriba },
          headerShadowVisible: false,
          headerTitleStyle: { color: colores.texto, fontWeight: '800', fontSize: 18 },
          contentStyle: { backgroundColor: colores.fondo },
        }}
      >
        {/* Sin sesión: inicio de sesión y registro */}
        <Stack.Protected guard={!conSesion}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="registro" options={{ title: 'Crear cuenta' }} />
          <Stack.Screen name="recuperar" options={{ title: 'Recuperar contraseña' }} />
        </Stack.Protected>

        {/* Términos de uso y privacidad pendientes (versión nueva o cuenta anterior a ellos) */}
        <Stack.Protected guard={Boolean(pendientes)}>
          <Stack.Screen name="aceptar-terminos" options={{ title: 'Términos actualizados', headerBackVisible: false }} />
        </Stack.Protected>

        {/* DeliMaster Pro (prestador): panel, ficha y verificaciones */}
        <Stack.Protected guard={habilitado && ES_PRO}>
          <Stack.Screen name="panel" options={{ title: NOMBRE_APP }} />
          <Stack.Screen name="ficha" options={conInicio({ title: 'Editar mi ficha' })} />
          <Stack.Screen name="verificaciones" options={conInicio({ title: 'Verificaciones' })} />
          <Stack.Screen name="recibidas" options={conInicio({ title: 'Solicitudes recibidas' })} />
          <Stack.Screen name="agenda" options={conInicio({ title: 'Mi agenda' })} />
          <Stack.Screen name="portafolio" options={conInicio({ title: 'Mi portafolio' })} />
          <Stack.Screen name="trabajo/[id]" options={conInicio({ title: 'Detalle del trabajo' })} />
          <Stack.Screen name="finanzas" options={conInicio({ title: 'Mis finanzas' })} />
          <Stack.Screen name="datos-pago" options={conInicio({ title: 'Datos para recibir pagos' })} />
        </Stack.Protected>

        {/* DeliMaster Lite (cliente): inicio con sus solicitudes, maestros disponibles (HU-01) y su perfil (HU-02) */}
        <Stack.Protected guard={habilitado && !ES_PRO}>
          <Stack.Screen name="index" options={{ title: 'DeliMaster' }} />
          <Stack.Screen name="maestros" options={conInicio({ title: 'Maestros disponibles' })} />
          <Stack.Screen name="prestador/[id]" options={conInicio({ title: 'Perfil del maestro' })} />
          <Stack.Screen name="nueva-solicitud" options={conInicio({ title: 'Pedir un servicio' })} />
          <Stack.Screen name="solicitud/[id]" options={conInicio({ title: 'Mi solicitud' })} />
        </Stack.Protected>

        {/* Compartido por ambas apps: chat de una solicitud (HU-04) y la cuenta */}
        <Stack.Protected guard={habilitado}>
          <Stack.Screen name="chat/[id]" options={conInicio({ title: 'Chat' })} />
          <Stack.Screen name="avisos" options={conInicio({ title: 'Avisos' })} />
          <Stack.Screen name="cuenta" options={conInicio({ title: 'Mi cuenta' })} />
        </Stack.Protected>

        {/* Documentos legales: se pueden leer siempre, con o sin sesión */}
        <Stack.Screen name="terminos" options={{ title: 'Términos de uso' }} />
        <Stack.Screen name="privacidad" options={{ title: 'Política de privacidad' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    // Modo claro u oscuro (Mi cuenta → Apariencia): envuelve todo para que la paleta esté lista antes de dibujar
    <TemaProvider>
      <SesionProvider>
        {/* HU-12: la cola sin conexión necesita la sesión para saber de quién son las solicitudes */}
        <ColaProvider>
          {/* Avisos dentro de la app: contador de no leídos y aviso flotante en tiempo real */}
          <AvisosProvider>
            <View style={{ flex: 1 }}>
              {/* Versión web en iPhone: cómo instalarla en la pantalla de inicio */}
              <InstalarEnIphone />
              <Navegacion />
              <AvisoFlotante />
            </View>
          </AvisosProvider>
        </ColaProvider>
      </SesionProvider>
    </TemaProvider>
  );
}

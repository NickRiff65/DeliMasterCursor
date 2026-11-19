import { Image, Pressable, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ES_PRO } from '../lib/variante';
import { useTema } from '../context/tema';
import { colores, crearEstilos, espacio } from '../theme';

// Secciones de DeliMaster Pro: cada una tiene su pantalla raíz y las pantallas que se abren desde ella.
// Los detalles (un trabajo, un chat) no llevan barra: se sale con la flecha de atrás.
// Íconos de línea (PNG con fondo transparente): se pintan del color del tema según la sección activa
export const SECCIONES = [
  { clave: 'inicio', nombre: 'Inicio', icono: require('../../assets/iconos/barra/inicio.png'), ruta: '/panel', pantallas: ['/panel'] },
  {
    clave: 'trabajos', nombre: 'Trabajos', icono: require('../../assets/iconos/barra/trabajos.png'),
    ruta: '/recibidas', pantallas: ['/recibidas', '/agenda'],
  },
  {
    clave: 'dinero', nombre: 'Finanzas', icono: require('../../assets/iconos/barra/finanzas.png'),
    ruta: '/finanzas', pantallas: ['/finanzas', '/datos-pago'],
  },
  {
    clave: 'perfil', nombre: 'Perfil', icono: require('../../assets/iconos/barra/perfil.png'), ruta: '/perfil',
    pantallas: ['/perfil', '/ficha', '/portafolio', '/verificaciones', '/cuenta'],
  },
];

// Sección a la que pertenece una ruta; null si esa pantalla no lleva barra
export function seccionDe(ruta) {
  return SECCIONES.find((s) => s.pantallas.includes(ruta)) ?? null;
}

// Envuelve el contenido de cada pantalla: en la app de maestros, la barra va abajo en las secciones principales
export function ConBarraPro({ children }) {
  const ruta = usePathname();
  const seccion = ES_PRO ? seccionDe(ruta) : null;
  return (
    <View style={{ flex: 1 }}>
      {children}
      {seccion ? <BarraPro activa={seccion.clave} /> : null}
    </View>
  );
}

// Espacio extra bajo los íconos: en las pantallas curvas el borde de abajo se ve deformado,
// así que la barra queda un poco más arriba que la zona segura del teléfono
export const MARGEN_INFERIOR_BARRA = 14;

function BarraPro({ activa }) {
  useTema();   // se vuelve a dibujar al cambiar entre modo claro y oscuro
  const insets = useSafeAreaInsets();
  return (
    <View style={[estilos.barra, { paddingBottom: insets.bottom + MARGEN_INFERIOR_BARRA }]} accessibilityRole="tablist">
      {SECCIONES.map((s) => {
        const seleccionada = s.clave === activa;
        return (
          <Pressable
            key={s.clave}
            onPress={() => { if (!seleccionada) router.replace(s.ruta); }}
            accessibilityRole="tab"
            accessibilityLabel={s.nombre}
            accessibilityState={{ selected: seleccionada }}
            style={estilos.item}
            hitSlop={4}
          >
            <Image source={s.icono} tintColor={seleccionada ? colores.texto : colores.textoSuave}
              accessibilityIgnoresInvertColors style={estilos.icono} />
            <Text style={[estilos.nombre, seleccionada && estilos.nombreActivo]}>{s.nombre}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  barra: {
    flexDirection: 'row', backgroundColor: colores.superficie, borderTopWidth: 1, borderColor: colores.borde,
    paddingTop: espacio.s, paddingHorizontal: espacio.s,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, paddingVertical: espacio.xs, gap: 4 },
  icono: { width: 30, height: 30 },
  nombre: { fontSize: 13, fontWeight: '600', color: colores.textoSuave },
  nombreActivo: { color: colores.texto, fontWeight: '800' },
}));

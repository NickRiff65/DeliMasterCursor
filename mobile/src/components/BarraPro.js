import { Pressable, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ES_PRO } from '../lib/variante';
import { useTema } from '../context/tema';
import { colores, crearEstilos, espacio } from '../theme';

// Secciones de DeliMaster Pro: cada una tiene su pantalla raíz y las pantallas que se abren desde ella.
// Los detalles (un trabajo, un chat) no llevan barra: se sale con la flecha de atrás.
export const SECCIONES = [
  { clave: 'inicio', nombre: 'Inicio', icono: '🏠', ruta: '/panel', pantallas: ['/panel'] },
  { clave: 'trabajos', nombre: 'Trabajos', icono: '📋', ruta: '/recibidas', pantallas: ['/recibidas', '/agenda'] },
  { clave: 'dinero', nombre: 'Dinero', icono: '💰', ruta: '/finanzas', pantallas: ['/finanzas', '/datos-pago'] },
  {
    clave: 'perfil', nombre: 'Perfil', icono: '👤', ruta: '/perfil',
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

function BarraPro({ activa }) {
  useTema();   // se vuelve a dibujar al cambiar entre modo claro y oscuro
  const insets = useSafeAreaInsets();
  return (
    <View style={[estilos.barra, { paddingBottom: Math.max(insets.bottom, espacio.xs) }]} accessibilityRole="tablist">
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
            hitSlop={6}
          >
            <Text style={estilos.icono}>{s.icono}</Text>
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
    paddingTop: espacio.xs,
  },
  item: { flex: 1, alignItems: 'center', paddingVertical: espacio.xs, gap: 2 },
  icono: { fontSize: 20 },
  nombre: { fontSize: 12, fontWeight: '600', color: colores.textoSuave },
  nombreActivo: { color: colores.texto, fontWeight: '800' },
}));

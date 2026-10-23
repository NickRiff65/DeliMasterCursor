import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { ES_PRO } from '../lib/variante';
import { colores, crearEstilos, radio } from '../theme';

// Volver al inicio desde cualquier pantalla. Útil sobre todo después de pagar: en la versión web
// "atrás" lleva de vuelta a las páginas de Webpay. Si el inicio está más atrás en la pila, se vuelve
// a él; si no (se llegó directo, por ejemplo desde Webpay), lo reemplaza.
export function BotonInicio() {
  return (
    <Pressable onPress={() => router.dismissTo(ES_PRO ? '/panel' : '/')} accessibilityRole="button"
      accessibilityLabel="Ir al inicio" hitSlop={8}
      style={({ pressed }) => [estilos.boton, pressed && { opacity: 0.7 }]}>
      <Text style={estilos.texto}>🏠 Inicio</Text>
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  boton: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radio.pildora, backgroundColor: colores.primarioSuave,
    marginRight: 4,
  },
  texto: { color: colores.primarioOscuro, fontWeight: '700', fontSize: 14 },
}));

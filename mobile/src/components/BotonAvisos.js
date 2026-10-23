import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAvisos } from '../context/avisos';
import { colores, crearEstilos, radio } from '../theme';

// Campana del encabezado con la cantidad de avisos sin leer
export function BotonAvisos() {
  const { noLeidas } = useAvisos();
  const etiqueta = noLeidas ? `Avisos, ${noLeidas} sin leer` : 'Avisos';
  return (
    <Pressable onPress={() => router.push('/avisos')} accessibilityRole="button" accessibilityLabel={etiqueta} hitSlop={8}
      style={({ pressed }) => [estilos.boton, pressed && { opacity: 0.7 }]}>
      <Text style={estilos.icono}>🔔</Text>
      {noLeidas ? (
        <View style={estilos.contador}><Text style={estilos.contadorTexto}>{noLeidas > 9 ? '9+' : noLeidas}</Text></View>
      ) : null}
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  boton: {
    width: 38, height: 38, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colores.primarioSuave, marginRight: 8,
  },
  icono: { fontSize: 18 },
  contador: {
    position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colores.error,
  },
  contadorTexto: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
}));

import { Pressable, Text, View } from 'react-native';
import { colores, crearEstilos, espacio } from '../theme';

// Casilla de verificación con texto (que puede incluir enlaces) y mensaje de error
export function Casilla({ marcada, onCambio, error, children }) {
  return (
    <View style={estilos.contenedor}>
      <View style={estilos.fila}>
        <Pressable onPress={() => onCambio(!marcada)} hitSlop={8} accessibilityRole="checkbox"
          accessibilityState={{ checked: marcada }} style={[estilos.caja, marcada && estilos.cajaMarcada, error && estilos.cajaError]}>
          {marcada ? <Text style={estilos.check}>✓</Text> : null}
        </Pressable>
        <Text style={estilos.texto}>{children}</Text>
      </View>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenedor: { marginBottom: espacio.m },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: espacio.s },
  caja: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colores.borde,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colores.superficie, marginTop: 1,
  },
  cajaMarcada: { backgroundColor: colores.primario, borderColor: colores.primario },
  cajaError: { borderColor: colores.error },
  check: { color: colores.sobrePrimario, fontWeight: '800', fontSize: 15, lineHeight: 18 },
  texto: { flex: 1, fontSize: 14, lineHeight: 21, color: colores.texto },
  error: { color: colores.error, fontSize: 13, marginTop: espacio.xs, marginLeft: 32 },
}));

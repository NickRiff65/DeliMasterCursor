import { Text, View } from 'react-native';
import { colores, crearEstilos, espacio, radio } from '../theme';

// Mensaje de error general (por ejemplo, credenciales incorrectas o sin conexión).
// Se agrupa como un solo elemento y los lectores de pantalla lo anuncian apenas aparece.
export function Aviso({ mensaje }) {
  if (!mensaje) return null;
  return (
    <View style={estilos.caja} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={estilos.texto}>{mensaje}</Text>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  caja: {
    backgroundColor: colores.errorSuave,
    borderRadius: radio.s,
    borderWidth: 1,
    borderColor: colores.errorBorde,
    padding: espacio.m,
    marginBottom: espacio.m,
  },
  texto: { color: colores.error, fontSize: 14 },
}));

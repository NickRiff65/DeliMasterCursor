import { Pressable, Text } from 'react-native';
import { crearEstilos, espacio, radio } from '../theme';

// Chip de filtro u orden: plano, sin color. Sin seleccionar es gris cálido con borde;
// seleccionado es tinta con texto claro. La selección se reconoce por contraste, no por color.
export function Chip({ texto, activo, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.chip, activo && estilos.activo, pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[estilos.texto, activo && estilos.textoActivo]} numberOfLines={1}>{texto}</Text>
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  chip: {
    paddingHorizontal: espacio.m,
    height: 38,
    justifyContent: 'center',
    borderRadius: radio.pildora,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.neutroFondo,
    marginRight: espacio.s,
  },
  activo: { backgroundColor: colores.texto, borderColor: colores.texto },
  texto: { color: colores.neutroTexto, fontSize: 14, fontWeight: '600' },
  textoActivo: { color: colores.fondo, fontWeight: '700' },
}));

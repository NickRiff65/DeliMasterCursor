import { Pressable, Text } from 'react-native';
import { colores, crearEstilos, degradado, espacio, radio } from '../theme';

export function Chip({ texto, activo, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.chip, activo && [estilos.activo, degradado(colores.degradadoBoton)], pressed && { transform: [{ scale: 0.95 }] },
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
    borderColor: colores.bordeTarjeta,
    backgroundColor: colores.superficie,
    marginRight: espacio.s,
    boxShadow: colores.sombra,
  },
  activo: { backgroundColor: colores.primario, borderColor: 'transparent', boxShadow: colores.sombraFuerte },
  texto: { color: colores.texto, fontSize: 14, fontWeight: '600' },
  textoActivo: { color: colores.sobrePrimario, fontWeight: '700' },
}));

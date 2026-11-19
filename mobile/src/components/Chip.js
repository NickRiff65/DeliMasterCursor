import { Image, Pressable, Text } from 'react-native';
import { colores, crearEstilos, degradado, espacio, letra, radio } from '../theme';

// Chip seleccionable. `icono` (opcional): ícono de línea (PNG transparente) delante del texto, del mismo color.
export function Chip({ texto, icono, activo, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.chip, activo && [estilos.activo, degradado(colores.degradadoBoton)], pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      {icono ? (
        <Image source={icono} tintColor={activo ? colores.sobrePrimario : colores.texto} accessibilityIgnoresInvertColors
          style={estilos.icono} />
      ) : null}
      <Text style={[estilos.texto, activo && estilos.textoActivo]} numberOfLines={1}>{texto}</Text>
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  chip: {
    paddingHorizontal: espacio.m,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radio.pildora,
    borderWidth: 1,
    borderColor: colores.bordeTarjeta,
    backgroundColor: colores.superficie,
    marginRight: espacio.s,
    boxShadow: colores.sombra,
  },
  activo: { backgroundColor: colores.primario, borderColor: 'transparent', boxShadow: colores.sombraFuerte },
  icono: { width: letra(16), height: letra(16) },
  texto: { color: colores.texto, fontSize: 14, fontWeight: '600' },
  textoActivo: { color: colores.sobrePrimario, fontWeight: '700' },
}));

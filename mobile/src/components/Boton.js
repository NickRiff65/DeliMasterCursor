import { ActivityIndicator, Pressable, Text } from 'react-native';
import { colores, crearEstilos, espacio, radio } from '../theme';

// Botón tipo píldora, plano: el principal es tinta con texto claro (el mismo criterio del
// chip seleccionado); el secundario es superficie con borde; sin degradados ni sombras.
export function Boton({ titulo, onPress, cargando = false, variante = 'primario', deshabilitado = false }) {
  const inactivo = cargando || deshabilitado;
  const secundario = variante === 'secundario';
  const peligro = variante === 'peligro';   // acciones que no se pueden deshacer
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        estilos.base,
        secundario ? estilos.secundario : peligro ? estilos.peligro : estilos.primario,
        pressed && !inactivo && { opacity: 0.85 },
        inactivo && { opacity: 0.55 },
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={secundario ? colores.texto : colores.fondo} />
      ) : (
        <Text style={[estilos.texto, secundario && { color: colores.texto }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  base: {
    minHeight: 52,
    borderRadius: radio.pildora,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espacio.l,
  },
  primario: { backgroundColor: colores.texto },
  secundario: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde },
  peligro: { backgroundColor: colores.error },
  texto: { color: colores.fondo, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
}));

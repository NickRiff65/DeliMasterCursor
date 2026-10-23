import { ActivityIndicator, Pressable, Text } from 'react-native';
import { colores, crearEstilos, degradado, espacio, radio } from '../theme';

// Botón tipo píldora: el principal con degradado y sombra; al tocarlo se hunde levemente
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
        secundario ? estilos.secundario : peligro ? estilos.peligro : [estilos.primario, degradado(colores.degradadoBoton)],
        pressed && !inactivo && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        inactivo && { opacity: 0.55 },
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={secundario ? colores.primario : colores.sobrePrimario} />
      ) : (
        <Text style={[estilos.texto, secundario && { color: colores.primarioOscuro }]}>{titulo}</Text>
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
  primario: { backgroundColor: colores.primario, boxShadow: colores.sombraFuerte },
  secundario: { backgroundColor: colores.primarioSuave, borderWidth: 1.5, borderColor: colores.primario },
  peligro: { backgroundColor: colores.error },
  texto: { color: colores.sobrePrimario, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
}));

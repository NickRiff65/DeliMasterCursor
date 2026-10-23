import { Pressable, Text, View } from 'react-native';
import { colores, crearEstilos, espacio, radio } from '../theme';

// Lista de opciones que se marcan y desmarcan (comunas, categorías).
// opciones: [{ valor, etiqueta }]   seleccion: array de valores
export function SeleccionMultiple({ opciones, seleccion, onCambio }) {
  const alternar = (valor) =>
    onCambio(seleccion.includes(valor) ? seleccion.filter((v) => v !== valor) : [...seleccion, valor]);

  return (
    <View style={estilos.contenedor}>
      {opciones.map(({ valor, etiqueta }) => {
        const activo = seleccion.includes(valor);
        return (
          <Pressable
            key={valor}
            onPress={() => alternar(valor)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: activo }}
            style={({ pressed }) => [estilos.opcion, activo && estilos.activa, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            <Text style={[estilos.texto, activo && estilos.textoActivo]}>{activo ? '✓ ' : ''}{etiqueta}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenedor: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s },
  opcion: {
    paddingHorizontal: 14,
    height: 40,
    justifyContent: 'center',
    borderRadius: radio.pildora,
    borderWidth: 1.5,
    borderColor: colores.bordeTarjeta,
    backgroundColor: colores.superficie,
    boxShadow: colores.sombra,
  },
  activa: { backgroundColor: colores.primarioSuave, borderColor: colores.primario },
  texto: { color: colores.texto, fontSize: 14 },
  textoActivo: { color: colores.primarioOscuro, fontWeight: '600' },
}));

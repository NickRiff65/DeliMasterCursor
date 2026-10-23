import { Pressable, Text, View } from 'react-native';
import { colores, crearEstilos, espacio } from '../theme';

const ETIQUETAS = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

// HU-06: elegir de 1 a 5 estrellas (o solo mostrarlas si `soloLectura`)
export function SelectorEstrellas({ valor, onCambio, soloLectura = false, tamano = 36 }) {
  return (
    <View>
      <View style={estilos.fila} accessibilityRole={soloLectura ? 'text' : 'adjustable'}
        accessibilityLabel={`${valor} de 5 estrellas`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} disabled={soloLectura} onPress={() => onCambio?.(n)} hitSlop={4}
            accessibilityRole="button" accessibilityLabel={`${n} estrellas`}>
            <Text style={{ fontSize: tamano, color: n <= valor ? colores.acento : colores.estrellaVacia }}>★</Text>
          </Pressable>
        ))}
      </View>
      {!soloLectura && valor ? <Text style={estilos.etiqueta}>{ETIQUETAS[valor]}</Text> : null}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  fila: { flexDirection: 'row', gap: espacio.xs },
  etiqueta: { fontSize: 14, color: colores.textoSuave, marginTop: espacio.xs },
}));

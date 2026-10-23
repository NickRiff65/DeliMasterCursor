import { Text, View } from 'react-native';
import { colores, crearEstilos } from '../theme';

// Muestra la reputación: "★ 4,8 (32)" o "Nuevo" si aún no tiene reseñas.
export function Estrellas({ promedio, total, tamano = 14 }) {
  if (!total) {
    return (
      <View style={estilos.nuevo}>
        <Text style={[estilos.textoNuevo, { fontSize: tamano - 2 }]}>Nuevo</Text>
      </View>
    );
  }
  return (
    <Text style={{ fontSize: tamano, color: colores.texto }} accessibilityLabel={`${promedio} estrellas, ${total} reseñas`}>
      <Text style={{ color: colores.acento }}>★ </Text>
      <Text style={{ fontWeight: '700' }}>{Number(promedio).toFixed(1).replace('.', ',')}</Text>
      <Text style={{ color: colores.textoSuave }}> ({total})</Text>
    </Text>
  );
}

const estilos = crearEstilos((colores) => ({
  nuevo: { backgroundColor: colores.primarioSuave, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  textoNuevo: { color: colores.primarioOscuro, fontWeight: '600' },
}));

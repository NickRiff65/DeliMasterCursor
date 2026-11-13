import { Text } from 'react-native';
import { colores, crearEstilos } from '../theme';

// Muestra la reputación: "★ 4,8 (32)" o "Nuevo" si aún no tiene reseñas.
// Sin insignia de color: «Nuevo» es texto gris y la estrella va en ámbar apagado (token acento).
export function Estrellas({ promedio, total, tamano = 14 }) {
  if (!total) {
    return <Text style={[estilos.textoNuevo, { fontSize: tamano - 2 }]}>Nuevo</Text>;
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
  textoNuevo: { color: colores.textoSuave, fontWeight: '600' },
}));

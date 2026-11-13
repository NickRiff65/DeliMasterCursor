import { Text } from 'react-native';
import { colores, crearEstilos } from '../theme';

// Muestra la reputación: "★ 4,8 (32)" o "Sin reseñas" si aún no tiene reseñas.
// Sin insignia de color: «Sin reseñas» es texto gris y la estrella va en ámbar apagado (token acento).
// La etiqueta «NUEVO» por registro reciente vive solo en TarjetaPrestador (evita duplicar «Nuevo»).
export function Estrellas({ promedio, total, tamano = 14 }) {
  if (!total) {
    return <Text style={[estilos.textoSinResenas, { fontSize: tamano - 2 }]}>Sin reseñas</Text>;
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
  textoSinResenas: { color: colores.textoSuave, fontWeight: '600' },
}));

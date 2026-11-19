import { Image, StyleSheet, Text, View } from 'react-native';
import { colores } from '../theme';

// Texto con un ícono de línea delante, en vez de un emoji (PNG con fondo transparente).
// El ícono toma el color del texto y un tamaño proporcional a su letra, así crece con la letra
// grande de la app de maestros. Los márgenes de arriba y abajo pasan a la fila para que el ícono
// y el texto queden alineados.
export function ConIcono({ icono, estilo, numberOfLines, tamano, tinte, children }) {
  const { marginTop, marginBottom, ...texto } = StyleSheet.flatten(estilo) ?? {};
  const lado = tamano ?? Math.round((texto.fontSize ?? 14) * 1.3);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Math.max(4, Math.round(lado / 3)), marginTop, marginBottom }}>
      <Image source={icono} tintColor={tinte ?? texto.color ?? colores.texto} accessibilityIgnoresInvertColors
        style={{ width: lado, height: lado }} />
      <Text style={[texto, { flexShrink: 1 }]} numberOfLines={numberOfLines}>{children}</Text>
    </View>
  );
}

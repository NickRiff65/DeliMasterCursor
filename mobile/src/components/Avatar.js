import { Text, View } from 'react-native';
import { colores } from '../theme';

// Avatar neutro: círculo gris cálido con las iniciales en tinta. Sin colores por persona:
// la lista se lee como un directorio sobrio, no como un arcoíris.
export function iniciales(nombre) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function Avatar({ nombre, tamano = 52 }) {
  return (
    <View
      style={{
        width: tamano, height: tamano, borderRadius: tamano / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colores.neutroFondo, borderWidth: 1, borderColor: colores.borde,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={{ color: colores.texto, fontWeight: '700', fontSize: tamano * 0.36, letterSpacing: 0.5 }}>{iniciales(nombre)}</Text>
    </View>
  );
}

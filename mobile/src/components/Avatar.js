import { Text, View } from 'react-native';
import { colores, degradado } from '../theme';

// Avatar con las iniciales sobre un degradado del tema. El color sale del nombre:
// cada prestador conserva siempre el suyo y la lista se ve variada (en claro, colores; en oscuro, grises).
export function iniciales(nombre) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

// Hash FNV-1a: reparte bien los colores aunque los nombres se parezcan
export function colorDeNombre(nombre) {
  let h = 2166136261;
  for (const letra of nombre) {
    h ^= letra.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % colores.avatares.length;
}

export function Avatar({ nombre, tamano = 52 }) {
  const i = colorDeNombre(nombre);
  return (
    <View
      style={[
        {
          width: tamano, height: tamano, borderRadius: tamano / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colores.avatarRespaldo[i], boxShadow: '0px 6px 14px rgba(0, 0, 0, 0.18)',
        },
        degradado(colores.avatares[i]),
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: tamano * 0.36, letterSpacing: 0.5 }}>{iniciales(nombre)}</Text>
    </View>
  );
}

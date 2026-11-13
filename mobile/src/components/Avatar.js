import { Text, View } from 'react-native';
import { degradado } from '../theme';

// Avatar con las iniciales sobre un degradado de color. El color sale del nombre:
// cada prestador conserva siempre el suyo y la lista se ve variada.
const DEGRADADOS = [
  'linear-gradient(135deg, #0B7568 0%, #2EC4B6 100%)',
  'linear-gradient(135deg, #6D28D9 0%, #C084FC 100%)',
  'linear-gradient(135deg, #C2410C 0%, #FBBF24 100%)',
  'linear-gradient(135deg, #1D4ED8 0%, #60A5FA 100%)',
  'linear-gradient(135deg, #BE185D 0%, #F472B6 100%)',
  'linear-gradient(135deg, #047857 0%, #A3E635 100%)',
];
const RESPALDO = ['#0B7568', '#6D28D9', '#C2410C', '#1D4ED8', '#BE185D', '#06755A'];

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
  return h % DEGRADADOS.length;
}

export function Avatar({ nombre, tamano = 52 }) {
  const i = colorDeNombre(nombre);
  return (
    <View
      style={[
        {
          width: tamano, height: tamano, borderRadius: tamano / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: RESPALDO[i], boxShadow: '0px 6px 14px rgba(0, 0, 0, 0.18)',
        },
        degradado(DEGRADADOS[i]),
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: tamano * 0.36, letterSpacing: 0.5 }}>{iniciales(nombre)}</Text>
    </View>
  );
}

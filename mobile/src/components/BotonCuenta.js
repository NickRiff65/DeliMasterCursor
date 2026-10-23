import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useTema } from '../context/tema';
import { crearEstilos, espacio, radio } from '../theme';

// Acceso a "Mi cuenta" en el encabezado de las pantallas de inicio (ambas apps)
export function BotonCuenta() {
  useTema();
  return (
    <Pressable onPress={() => router.push('/cuenta')} accessibilityRole="button" accessibilityLabel="Mi cuenta" hitSlop={8}
      style={({ pressed }) => [estilos.boton, pressed && { transform: [{ scale: 0.95 }] }]}>
      <Text style={estilos.texto}>👤 Mi cuenta</Text>
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  boton: {
    backgroundColor: colores.superficie, borderRadius: radio.pildora, paddingHorizontal: 14, paddingVertical: 7,
    marginRight: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta, boxShadow: colores.sombra,
  },
  texto: { color: colores.primarioOscuro, fontWeight: '700', fontSize: 14 },
}));

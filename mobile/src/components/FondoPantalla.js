import { View } from 'react-native';
import { useTema } from '../context/tema';
import { colores, degradado } from '../theme';

// Fondo de todas las pantallas: degradado de más oscuro (arriba) a más claro (abajo),
// del modo claro u oscuro. Se aplica una vez en _layout para toda la navegación.
export function FondoPantalla({ children }) {
  useTema();
  return (
    <View style={[{ flex: 1, backgroundColor: colores.fondo }, degradado(colores.degradadoFondo)]}>
      {children}
    </View>
  );
}

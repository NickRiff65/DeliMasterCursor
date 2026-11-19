import { colores, letra } from '../theme';
import { ConIcono } from './ConIcono';

// Línea de texto con el ícono de ubicación delante (en vez del emoji 📍)
export function ConUbicacion({ estilo, numberOfLines, children }) {
  return (
    <ConIcono icono={require('../../assets/iconos/app/ubicacion.png')} estilo={estilo} numberOfLines={numberOfLines}
      tamano={letra(14)} tinte={colores.textoSuave}>
      {children}
    </ConIcono>
  );
}

import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { colores } from '../theme';

// Tiempo restante en un formato que se entiende de un vistazo:
//   menos de una hora → 29:45 (minutos:segundos)
//   menos de un día   → 23 h 58 min (sin pasar de 59 minutos)
//   un día o más      → 1 día 2 h (sin pasar de 23 horas)
export function formatearRestante(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  if (dias) return `${dias} ${dias === 1 ? 'día' : 'días'} ${horas} h`;
  if (horas) return `${horas} h ${minutos} min`;
  return `${minutos}:${String(segundos).padStart(2, '0')}`;
}

// Muestra el tiempo que queda hasta `hasta` (plazo de respuesta del prestador)
// y avisa con `alVencer` cuando llega a cero.
export function CuentaRegresiva({ hasta, alVencer, estilo }) {
  const calcular = () => Math.max(0, new Date(hasta).getTime() - Date.now());
  const [restante, setRestante] = useState(calcular);

  useEffect(() => {
    const t = setInterval(() => {
      const r = calcular();
      setRestante(r);
      if (r === 0) {
        clearInterval(t);
        alVencer?.();
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasta]);

  const urgente = restante < 5 * 60000;
  return (
    <Text style={[{ fontWeight: '700', color: urgente ? colores.error : colores.texto }, estilo]}>
      {restante === 0 ? 'Plazo vencido' : formatearRestante(restante)}
    </Text>
  );
}

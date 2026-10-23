import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { colores } from '../theme';

// Muestra el tiempo que queda hasta `hasta` (HU-05: plazo de respuesta del prestador)
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

  const min = Math.floor(restante / 60000);
  const seg = Math.floor((restante % 60000) / 1000);
  const urgente = restante < 5 * 60000;
  return (
    <Text style={[{ fontWeight: '700', color: urgente ? colores.error : colores.texto }, estilo]}>
      {restante === 0 ? 'Plazo vencido' : `${min}:${String(seg).padStart(2, '0')}`}
    </Text>
  );
}

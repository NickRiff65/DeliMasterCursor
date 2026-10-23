import { useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Chip } from './Chip';
import { DIAS_SEMANA, HORAS_JORNADA, textoHorario } from '../lib/horario';
import { colores, crearEstilos, espacio } from '../theme';

// El maestro elige los días y el horario en que trabaja (al registrarse y en su ficha), entre las
// 08:00 y la medianoche. Así ordena su agenda y el cliente sabe cuándo lo puede atender.
export function HorarioAtencion({ valor, onCambio, error }) {
  const alternarDia = (d) => {
    const dias = valor.dias.includes(d) ? valor.dias.filter((x) => x !== d) : [...valor.dias, d].sort((a, b) => a - b);
    onCambio({ ...valor, dias });
  };
  const resumen = valor.dias.length && valor.hasta > valor.desde ? textoHorario(valor) : null;

  return (
    <View>
      <Text style={estilos.etiqueta}>Días que trabajas</Text>
      <View style={estilos.dias}>
        {DIAS_SEMANA.map((d) => (
          <Chip key={d.valor} texto={d.corto} activo={valor.dias.includes(d.valor)} onPress={() => alternarDia(d.valor)} />
        ))}
      </View>

      <Text style={estilos.etiqueta}>Desde</Text>
      <FilaHoras horas={HORAS_JORNADA.slice(0, -1)} elegida={valor.desde} onElegir={(desde) => onCambio({
        ...valor, desde,
        // Si el término queda antes del nuevo inicio, se corre a una hora después
        hasta: valor.hasta > desde ? valor.hasta : HORAS_JORNADA[HORAS_JORNADA.indexOf(desde) + 2] ?? HORAS_JORNADA.at(-1),
      })} />
      <Text style={estilos.etiqueta}>Hasta</Text>
      <FilaHoras horas={HORAS_JORNADA.filter((h) => h > valor.desde)} elegida={valor.hasta} onElegir={(hasta) => onCambio({ ...valor, hasta })} />

      {error ? <Text style={estilos.error}>{error}</Text>
        : !valor.dias.length ? <Text style={estilos.error}>Elige al menos un día.</Text>
          : valor.hasta <= valor.desde ? <Text style={estilos.error}>La hora de término debe ser después de la de inicio.</Text>
            : <Text style={estilos.resumen}>🕒 {resumen}</Text>}
    </View>
  );
}

// Ancho aproximado de cada botón de hora, para mostrar de entrada la hora elegida
const ANCHO_HORA = 78;

function FilaHoras({ horas, elegida, onElegir }) {
  const fila = useRef(null);
  const ubicada = useRef(false);
  const ubicar = () => {
    if (ubicada.current) return;
    ubicada.current = true;
    fila.current?.scrollTo({ x: Math.max(0, horas.indexOf(elegida) - 2) * ANCHO_HORA, animated: false });
  };
  return (
    <ScrollView ref={fila} horizontal showsHorizontalScrollIndicator={false} style={estilos.horas}
      contentContainerStyle={estilos.horasContenido} onContentSizeChange={ubicar}>
      {horas.map((h) => (
        <Chip key={h} texto={h === '24:00' ? 'Medianoche' : h} activo={h === elegida} onPress={() => onElegir(h)} />
      ))}
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  etiqueta: { fontSize: 14, fontWeight: '600', color: colores.texto, marginTop: espacio.s, marginBottom: espacio.xs },
  dias: { flexDirection: 'row', flexWrap: 'wrap', rowGap: espacio.s, paddingVertical: 4 },
  horas: { flexGrow: 0, marginHorizontal: -espacio.m },
  // Margen para que la sombra de los botones no se corte en el borde de la fila
  horasContenido: { paddingVertical: 8, paddingHorizontal: espacio.m },
  resumen: { fontSize: 14, color: colores.primarioOscuro, fontWeight: '700', marginTop: espacio.s },
  error: { color: colores.error, fontSize: 13, marginTop: espacio.s },
}));

import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Chip } from './Chip';
import { diaDeLaSemana, horasDeLaJornada } from '../lib/horario';
import { colores, crearEstilos, espacio } from '../theme';

// Elegir día y hora de la visita con botones (sin selector nativo: funciona igual en las APK ya
// instaladas, en iPhone por la web y en el navegador). Días: hoy y los próximos 13; horas: 8:00 a 23:30,
// o solo los días y horas de atención del maestro si se indica su horario.
const HORAS = Array.from({ length: 32 }, (_, i) => ({ h: 8 + Math.floor(i / 2), m: (i % 2) * 30 }));
const DIAS = 14;

export function construirFecha(dia, { h, m }) {
  const f = new Date(dia);
  f.setHours(h, m, 0, 0);
  return f;
}

export function SelectorHorario({ valor, onCambio, horario = null, ahora = new Date() }) {
  const dias = useMemo(() => Array.from({ length: DIAS }, (_, i) => {
    const d = new Date(ahora);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const nombre = i === 0 ? 'Hoy' : i === 1 ? 'Mañana'
      : d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }).replace('.', '');
    return { fecha: d, nombre };
  }), [ahora]);

  const elegido = valor ? new Date(valor) : null;
  const diaElegido = elegido ? dias.find((d) => d.fecha.toDateString() === elegido.toDateString()) ?? null : null;
  // Solo horarios con al menos 30 minutos de anticipación
  const horas = horario ? horasDeLaJornada(horario) : HORAS;
  const horasDelDia = (dia) => (horario && !horario.dias.includes(diaDeLaSemana(dia.fecha)) ? []
    : horas.filter((x) => construirFecha(dia.fecha, x).getTime() - ahora.getTime() >= 30 * 60_000));

  return (
    <View>
      <Text style={estilos.etiqueta}>Día de la visita</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.fila}>
        {dias.filter((d) => horasDelDia(d).length).map((d) => (
          <Chip key={d.nombre} texto={d.nombre} activo={diaElegido?.nombre === d.nombre}
            onPress={() => onCambio(construirFecha(d.fecha, horasDelDia(d)[0]).toISOString())} />
        ))}
      </ScrollView>
      {diaElegido ? (
        <>
          <Text style={estilos.etiqueta}>Hora</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.fila}>
            {horasDelDia(diaElegido).map((x) => {
              const texto = `${String(x.h).padStart(2, '0')}:${String(x.m).padStart(2, '0')}`;
              const activo = elegido.getHours() === x.h && elegido.getMinutes() === x.m;
              return <Chip key={texto} texto={texto} activo={activo} onPress={() => onCambio(construirFecha(diaElegido.fecha, x).toISOString())} />;
            })}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  etiqueta: { fontSize: 14, fontWeight: '600', color: colores.texto, marginTop: espacio.s, marginBottom: espacio.xs },
  fila: { paddingVertical: 8, paddingRight: espacio.m },
}));

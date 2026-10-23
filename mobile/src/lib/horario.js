// Horario de atención del maestro: días 1 (lunes) … 7 (domingo) y horas "HH:MM"
export const DIAS_SEMANA = [
  { valor: 1, corto: 'Lun', nombre: 'lunes' },
  { valor: 2, corto: 'Mar', nombre: 'martes' },
  { valor: 3, corto: 'Mié', nombre: 'miércoles' },
  { valor: 4, corto: 'Jue', nombre: 'jueves' },
  { valor: 5, corto: 'Vie', nombre: 'viernes' },
  { valor: 6, corto: 'Sáb', nombre: 'sábado' },
  { valor: 7, corto: 'Dom', nombre: 'domingo' },
];
// DeliMaster apunta también a urgencias de noche y fines de semana: por defecto, todos los días de
// 08:00 a medianoche, y cada maestro lo ajusta dentro de ese rango
export const HORARIO_INICIAL = { dias: [1, 2, 3, 4, 5, 6, 7], desde: '08:00', hasta: '24:00' };

// Horas para elegir el inicio y el término de la jornada: de 08:00 a 24:00 (medianoche), cada 30 minutos
export const HORAS_JORNADA = Array.from({ length: 33 }, (_, i) =>
  `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

// Cómo se muestra una hora: las 24:00 son la medianoche
export const nombreHora = (hhmm) => (hhmm === '24:00' ? 'medianoche' : hhmm);

const dia = (n) => DIAS_SEMANA[n - 1];
const mayuscula = (t) => t[0].toUpperCase() + t.slice(1);

// "Lunes a viernes · 09:00 a 18:00", "Lun, mié y sáb · 08:30 a 17:00", "Todos los días · …"
export function textoHorario(h) {
  if (!h?.dias?.length) return null;
  const dias = [...h.dias].sort((a, b) => a - b);
  const seguidos = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  let texto;
  if (dias.length === 7) texto = 'Todos los días';
  else if (dias.length === 1) texto = `Solo ${dia(dias[0]).nombre}`;
  else if (seguidos && dias.length >= 3) texto = `${mayuscula(dia(dias[0]).nombre)} a ${dia(dias.at(-1)).nombre}`;
  else {
    const cortos = dias.map((d) => dia(d).corto.toLowerCase());
    texto = mayuscula(`${cortos.slice(0, -1).join(', ')} y ${cortos.at(-1)}`);
  }
  return `${texto} · ${h.desde} a ${nombreHora(h.hasta)}`;
}

// Día de la semana de una fecha en el formato del horario (1 = lunes … 7 = domingo)
export const diaDeLaSemana = (fecha) => (new Date(fecha).getDay() || 7);

const aMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Horas de inicio posibles dentro de la jornada, cada 30 minutos (desde ≤ hora < hasta)
export function horasDeLaJornada(h) {
  const horas = [];
  for (let m = aMinutos(h.desde); m < aMinutos(h.hasta); m += 30) horas.push({ h: Math.floor(m / 60), m: m % 60 });
  return horas;
}

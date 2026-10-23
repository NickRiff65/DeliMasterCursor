import { z } from 'zod';

// Horario de atención del maestro: días (1 = lunes … 7 = domingo) y hora de inicio y fin.
// Se elige entre las 08:00 y la medianoche ("24:00"): DeliMaster apunta también a urgencias de noche
// y fines de semana. Por defecto, todos los días de 08:00 a 24:00.
export const HORARIO_POR_DEFECTO = { dias: [1, 2, 3, 4, 5, 6, 7], desde: '08:00', hasta: '24:00' };
export const PRIMERA_HORA = '08:00';
export const ULTIMA_HORA = '24:00';

const hora = z.string({ error: 'Indica la hora' }).regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Hora con formato HH:MM');

export const esquemaHorario = z.object({
  dias: z.array(z.number().int().min(1).max(7), { error: 'Elige los días que trabajas' })
    .min(1, 'Elige al menos un día')
    .transform((ds) => [...new Set(ds)].sort()),
  desde: hora.refine((h) => h >= PRIMERA_HORA && h < ULTIMA_HORA, 'El horario parte desde las 08:00'),
  hasta: hora.refine((h) => h > PRIMERA_HORA && h <= ULTIMA_HORA, 'El horario termina a más tardar a medianoche'),
}).refine((h) => h.hasta > h.desde, { path: ['hasta'], message: 'La hora de término debe ser después de la de inicio' });

// SQL que arma el horario de un prestador (alias p) para las respuestas de la API
export const sqlHorario = (p = 'p') => `json_build_object(
  'dias', ${p}.dias_atencion,
  'desde', to_char(${p}.hora_inicio, 'HH24:MI'),
  'hasta', to_char(${p}.hora_fin, 'HH24:MI'))`;

-- =====================================================================
-- DeliMaster 2.0 · Migración 013 · Horario de atención de 08:00 a medianoche
-- =====================================================================
-- DeliMaster busca que una urgencia (una cañería rota un domingo a las 21:00) tenga un maestro
-- independiente que la atienda: el horario se elige entre las 08:00 y las 24:00, cualquier día.
-- Por defecto, todos los días de 08:00 a medianoche; cada maestro lo ajusta a su gusto.
ALTER TABLE prestadores
  ALTER COLUMN dias_atencion SET DEFAULT '{1,2,3,4,5,6,7}',
  ALTER COLUMN hora_inicio   SET DEFAULT '08:00',
  ALTER COLUMN hora_fin      SET DEFAULT '24:00';

-- Quienes quedaron con el horario por defecto anterior (lunes a viernes de 9 a 18) pasan al nuevo
UPDATE prestadores SET dias_atencion = '{1,2,3,4,5,6,7}', hora_inicio = '08:00', hora_fin = '24:00'
 WHERE dias_atencion = '{1,2,3,4,5}' AND hora_inicio = '09:00' AND hora_fin = '18:00';

-- =====================================================================
-- DeliMaster · Migración 023 · Plazo de respuesta de 1 día hábil,
-- fotos al solicitar y conteo de veces sin respuesta (ayudantía)
-- =====================================================================

-- ------------------------------------------------- plazo de respuesta
-- Antes el maestro tenía unos minutos (config.plazoRespuestaMin) desde la
-- asignación. Ahora tiene 1 día hábil (hora de Chile, sin sábados ni
-- domingos; feriados fuera de alcance): el vencimiento exacto se calcula
-- en la aplicación al asignar (vencimientoRespuesta) y se guarda aquí.
ALTER TABLE solicitudes ADD COLUMN respuesta_vence_en  TIMESTAMPTZ;
ALTER TABLE solicitudes ADD COLUMN veces_sin_respuesta INT NOT NULL DEFAULT 0;

-- Solicitudes asignadas cuyo plazo ya venció (para liberarlas sin recorrer toda la tabla)
CREATE INDEX solicitudes_respuesta_vence ON solicitudes (respuesta_vence_en) WHERE estado = 'asignada';

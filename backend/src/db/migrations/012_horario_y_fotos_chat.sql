-- =====================================================================
-- DeliMaster 2.0 · Migración 012 · Horario de atención del maestro y fotos en el chat
-- =====================================================================

-- Días (1 = lunes … 7 = domingo) y horario en que el maestro trabaja. Se elige al registrarse
-- y se edita en la ficha; el cliente lo ve en el perfil y las visitas se agendan dentro de él.
ALTER TABLE prestadores
  ADD COLUMN dias_atencion SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  ADD COLUMN hora_inicio   TIME NOT NULL DEFAULT '09:00',
  ADD COLUMN hora_fin      TIME NOT NULL DEFAULT '18:00',
  ADD CONSTRAINT horario_valido CHECK (
    hora_fin > hora_inicio
    AND cardinality(dias_atencion) BETWEEN 1 AND 7
    AND dias_atencion <@ '{1,2,3,4,5,6,7}'::smallint[]
  );

-- Un mensaje del chat puede ser una foto (se guarda como foto de la solicitud, con su enlace firmado)
ALTER TABLE mensajes ADD COLUMN foto_id UUID REFERENCES evidencias(id);

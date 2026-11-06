-- =====================================================================
-- DeliMaster · Migración 021 · Privacidad de la dirección, calificación
-- bilateral y avisos automáticos de vencimiento de verificaciones
-- =====================================================================

-- ------------------------------------------------- verificaciones: avisos automáticos
-- El reloj de verificaciones avisa una sola vez por hito (por vencer / vencida);
-- estas marcas evitan repetir el aviso en cada revisión.
ALTER TABLE verificaciones ADD COLUMN aviso_por_vencer_en TIMESTAMPTZ;
ALTER TABLE verificaciones ADD COLUMN aviso_vencida_en    TIMESTAMPTZ;

-- Los avisos de verificación son un tipo de notificación nuevo
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo IN ('solicitud', 'pago', 'verificacion'));

-- ------------------------------------------------- solicitudes: dirección compartida
-- La dirección exacta del cliente no se muestra al maestro al primer contacto:
-- solo ve la comuna. Se revela automáticamente cuando hay un pago asegurado
-- (visita o trabajo pagado) o cuando el cliente la comparte voluntariamente
-- una vez que la visita ya quedó concretada. Esta columna registra ese momento.
ALTER TABLE solicitudes ADD COLUMN direccion_compartida_en TIMESTAMPTZ;

-- ------------------------------------------------- reputación del cliente
-- Hasta ahora solo el prestador acumulaba reputación. El cliente también:
-- los maestros podrán verla antes de aceptar un trabajo.
ALTER TABLE usuarios ADD COLUMN calificacion_promedio NUMERIC(3,2);
ALTER TABLE usuarios ADD COLUMN total_resenas         INT NOT NULL DEFAULT 0;

-- ------------------------------------------------- reseñas del prestador al cliente
-- Espejo de `resenas` (HU-06), en el sentido contrario: una por servicio,
-- solo con el trabajo cerrado oficialmente, y con las partes cruzadas
-- validadas contra la solicitud en la propia base de datos.
CREATE TABLE resenas_prestador (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL UNIQUE REFERENCES solicitudes(id),
  prestador_id UUID NOT NULL REFERENCES prestadores(usuario_id),
  cliente_id   UUID NOT NULL REFERENCES usuarios(id),
  estrellas    SMALLINT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario   TEXT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION validar_resena_prestador() RETURNS trigger AS $$
DECLARE
  s RECORD;
BEGIN
  SELECT estado, prestador_id, cliente_id INTO s FROM solicitudes WHERE id = NEW.solicitud_id;
  IF s.estado IS DISTINCT FROM 'cerrada' THEN
    RAISE EXCEPTION 'Solo se puede calificar al cliente de un servicio cerrado oficialmente (estado actual: %)', s.estado;
  END IF;
  IF s.prestador_id IS DISTINCT FROM NEW.prestador_id OR s.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    RAISE EXCEPTION 'La calificación no corresponde a las partes de la solicitud';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER resenas_prestador_solo_cerradas BEFORE INSERT ON resenas_prestador
  FOR EACH ROW EXECUTE FUNCTION validar_resena_prestador();

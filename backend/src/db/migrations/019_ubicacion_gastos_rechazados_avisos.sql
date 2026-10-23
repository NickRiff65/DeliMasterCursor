-- =====================================================================
-- DeliMaster 2.0 · Migración 019 · Ubicación exacta, gastos rechazados y avisos en la app
-- =====================================================================

-- ---------------------------------------------------------------- ubicación del servicio
-- El cliente indica la dirección exacta (y una referencia) al pedir el servicio; opcionalmente su
-- ubicación GPS (latitud y longitud ya existían). El maestro la ve recién cuando el pago está asegurado.
ALTER TABLE solicitudes
  ADD COLUMN direccion  TEXT CHECK (direccion IS NULL OR length(direccion) BETWEEN 5 AND 200),
  ADD COLUMN referencia TEXT CHECK (referencia IS NULL OR length(referencia) <= 200);

-- ---------------------------------------------------------------- gastos rechazados
-- En una disputa, el equipo puede rechazar gastos que el maestro no justificó: se le devuelven al
-- cliente y dejan de contar como gasto del maestro (no se le descuentan dos veces).
ALTER TABLE gastos
  ADD COLUMN rechazado_en   TIMESTAMPTZ,
  ADD COLUMN rechazo_motivo TEXT;

-- ---------------------------------------------------------------- avisos dentro de la app
-- Lo importante de cada solicitud y de los pagos (por ejemplo, "Te transferimos tu pago") llega como
-- aviso dentro de la app, con el contador de no leídos.
CREATE TABLE notificaciones (
  id           BIGSERIAL PRIMARY KEY,
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  texto        TEXT NOT NULL,
  solicitud_id UUID REFERENCES solicitudes(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL DEFAULT 'solicitud' CHECK (tipo IN ('solicitud', 'pago')),
  leida_en     TIMESTAMPTZ,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notificaciones_usuario ON notificaciones (usuario_id, creado_en DESC);
CREATE INDEX notificaciones_no_leidas ON notificaciones (usuario_id) WHERE leida_en IS NULL;

-- =====================================================================
-- DeliMaster · Migración 027 · Cotización aparte de la visita y chat de las disputas
-- =====================================================================

-- ------------------------------------------------- cotización sin la visita
-- Hasta ahora la cotización incluía la visita ya pagada y el cliente pagaba la diferencia.
-- Decisión del equipo (noviembre 2026): la cotización es solo el trabajo y el cliente la paga
-- completa; la visita va aparte y al maestro se le transfieren ambas. Las cotizaciones que ya
-- existían se marcan como "incluye_visita" para cobrarlas con la regla con que se hicieron.
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS incluye_visita BOOLEAN NOT NULL DEFAULT false;
UPDATE cotizaciones SET incluye_visita = true;

-- ------------------------------------------------- chat de las disputas
-- En una disputa, el equipo conversa por separado con el cliente y con el maestro para reunir
-- más antecedentes. Cada conversación es privada entre el equipo y esa parte.
CREATE TABLE IF NOT EXISTS mensajes_disputa (
  id           BIGSERIAL PRIMARY KEY,
  solicitud_id UUID NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  parte        TEXT NOT NULL CHECK (parte IN ('cliente', 'prestador')),   -- con quién es la conversación
  autor_id     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  de_equipo    BOOLEAN NOT NULL,                                          -- lo escribió el equipo de DeliMaster
  contenido    TEXT NOT NULL CHECK (length(contenido) BETWEEN 1 AND 1000),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensajes_disputa_conversacion ON mensajes_disputa (solicitud_id, parte, creado_en);

-- =====================================================================
-- DeliMaster 2.0 · Migración 005 · Cierre del trabajo y reseñas (HU-06, HU-07)
-- =====================================================================

-- Momento en que el prestador marcó el trabajo como terminado: inicia el plazo
-- para que el cliente confirme el cierre (si no responde, se cierra solo).
ALTER TABLE solicitudes ADD COLUMN finalizada_en TIMESTAMPTZ;

CREATE INDEX solicitudes_finalizadas ON solicitudes (finalizada_en) WHERE estado = 'finalizada';

-- Motivo del reporte cuando el cliente indica un problema (queda para el administrador)
ALTER TABLE solicitudes ADD COLUMN motivo_disputa TEXT;

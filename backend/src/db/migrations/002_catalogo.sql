-- =====================================================================
-- DeliMaster 2.0 · Migración 002 · Catálogo y reputación (HU-01, HU-02, HU-07)
-- =====================================================================

-- Número de reseñas recibidas: base del puntaje ponderado del catálogo.
ALTER TABLE prestadores
  ADD COLUMN total_resenas INTEGER NOT NULL DEFAULT 0 CHECK (total_resenas >= 0);

-- Búsqueda por comuna atendida
CREATE INDEX prestadores_comunas ON prestadores USING GIN (comunas_atendidas);

-- Búsqueda de verificaciones aprobadas por prestador y categoría
CREATE INDEX verificaciones_aprobadas ON verificaciones (prestador_id, categoria_id)
  WHERE estado = 'aprobada';

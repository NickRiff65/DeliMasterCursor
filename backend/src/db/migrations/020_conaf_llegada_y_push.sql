-- =====================================================================
-- DeliMaster · Migración 020 · Tala con CONAF, GPS de llegada y avisos push
-- =====================================================================

-- La tala ya figuraba con organismo CONAF, pero entraba al catálogo sin revisión.
-- El plan de manejo o el permiso de corta se revisan igual que SEC y SAG.
UPDATE categorias SET requiere_verificacion = true WHERE slug = 'tala';

-- Dónde estaba el prestador cuando ingresó el código de llegada, y a cuántos metros
-- del punto que marcó el cliente (null si el cliente no compartió ubicación).
ALTER TABLE solicitudes
  ADD COLUMN llegada_latitud     NUMERIC(9,6),
  ADD COLUMN llegada_longitud    NUMERIC(9,6),
  ADD COLUMN llegada_distancia_m INTEGER CHECK (llegada_distancia_m IS NULL OR llegada_distancia_m >= 0);

-- Teléfonos que pueden recibir un aviso aunque la app esté cerrada. El token es el de Expo.
CREATE TABLE dispositivos_push (
  token          TEXT PRIMARY KEY,
  usuario_id     UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plataforma     TEXT NOT NULL CHECK (plataforma IN ('ios', 'android')),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dispositivos_push_usuario ON dispositivos_push (usuario_id);

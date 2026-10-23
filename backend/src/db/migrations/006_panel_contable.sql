-- =====================================================================
-- DeliMaster 2.0 · Migración 006 · Panel contable del prestador (HU-09)
-- =====================================================================

-- Foto de una boleta y lo que propuso el lector automático (OCR).
-- Se guarda aparte del gasto porque primero se lee y el prestador confirma o corrige el monto.
CREATE TABLE boletas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id  UUID NOT NULL REFERENCES prestadores(usuario_id) ON DELETE CASCADE,
  solicitud_id  UUID NOT NULL REFERENCES solicitudes(id),
  archivo       TEXT NOT NULL,                 -- nombre del archivo en el almacenamiento
  ocr_monto     INTEGER,                       -- total propuesto (null si no se pudo leer)
  ocr_confianza NUMERIC(4,3) CHECK (ocr_confianza BETWEEN 0 AND 1),
  ocr_lector    TEXT,                          -- google_vision | tesseract
  ocr_texto     TEXT,                          -- texto leído, como respaldo
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX boletas_solicitud ON boletas (solicitud_id);

-- Un gasto puede venir de una boleta (OCR confirmado o corregido) o ingresarse a mano
ALTER TABLE gastos ADD COLUMN boleta_id UUID UNIQUE REFERENCES boletas(id) ON DELETE SET NULL;
CREATE INDEX gastos_solicitud ON gastos (solicitud_id);

-- =====================================================================
-- DeliMaster · Migración 024 · EXIF antifraude en las fotos de evidencia
-- =====================================================================

-- Datos que la cámara del teléfono guarda dentro del JPEG (fecha original, GPS y equipo).
-- Se leen del archivo original al subir la foto, antes de convertirla a WebP.
-- Una foto sin fecha ni equipo probablemente es una captura de pantalla o una imagen
-- descargada: queda marcada como sospechosa para que el equipo la revise en una disputa.
-- Las coordenadas NO se muestran a la otra parte; son solo respaldo para el equipo.
ALTER TABLE evidencias ADD COLUMN exif_fecha       TIMESTAMPTZ;
ALTER TABLE evidencias ADD COLUMN exif_lat         NUMERIC;
ALTER TABLE evidencias ADD COLUMN exif_lng         NUMERIC;
ALTER TABLE evidencias ADD COLUMN exif_dispositivo TEXT;
ALTER TABLE evidencias ADD COLUMN sospechosa       BOOLEAN NOT NULL DEFAULT false;

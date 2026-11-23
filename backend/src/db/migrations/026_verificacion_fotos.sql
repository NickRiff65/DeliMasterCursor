-- =====================================================================
-- DeliMaster · Migración 026 · Verificación de las fotos (reales y tomadas en el momento)
-- =====================================================================

-- Además de leer el EXIF del archivo (024), se guarda cómo se verificó cada foto:
--   verificacion: 'verificada' (cámara, fecha reciente y sin señales raras), 'revisar' (antigua,
--                 editada, fecha imposible o lejos del lugar) o 'sin_datos' (sin datos de cámara).
--   verificacion_motivos: por qué hay que revisarla ('antigua', 'editada', 'lejos', ...).
--   metadatos_origen: si los datos venían en el archivo o los leyó la app del original
--                     (la app reduce la foto antes de subirla y eso borra el EXIF).
--   tomada_con: cámara de la app, galería o selector de la versión web.
--   minutos_antes: cuántos minutos antes de subirla se tomó la foto.
--   distancia_m: distancia al punto del trabajo, si ambos tienen ubicación (solo la ve el equipo).
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS exif_software        TEXT;
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS metadatos_origen     TEXT CHECK (metadatos_origen IN ('archivo', 'app'));
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS tomada_con           TEXT CHECK (tomada_con IN ('camara', 'galeria', 'web'));
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS minutos_antes        INTEGER;
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS distancia_m          INTEGER;
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS verificacion         TEXT NOT NULL DEFAULT 'sin_datos'
  CHECK (verificacion IN ('verificada', 'revisar', 'sin_datos'));
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS verificacion_motivos TEXT[] NOT NULL DEFAULT '{}';

-- Fotos anteriores: se clasifican con lo que se guardó de ellas (fecha y equipo del EXIF)
UPDATE evidencias SET
  metadatos_origen = CASE WHEN exif_fecha IS NOT NULL OR exif_dispositivo IS NOT NULL THEN 'archivo' END,
  minutos_antes = CASE WHEN exif_fecha IS NOT NULL THEN round(extract(epoch FROM creado_en - exif_fecha) / 60)::int END,
  verificacion = CASE
    WHEN exif_fecha IS NULL AND exif_dispositivo IS NULL THEN 'sin_datos'
    WHEN exif_fecha IS NULL OR abs(extract(epoch FROM creado_en - exif_fecha)) > 86400 THEN 'revisar'
    ELSE 'verificada' END,
  verificacion_motivos = CASE
    WHEN exif_fecha IS NULL AND exif_dispositivo IS NULL THEN ARRAY['sin_datos']
    WHEN exif_fecha IS NULL THEN ARRAY['sin_fecha']
    WHEN abs(extract(epoch FROM creado_en - exif_fecha)) > 86400 THEN ARRAY['antigua']
    ELSE ARRAY[]::text[] END;

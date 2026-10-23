-- =====================================================================
-- DeliMaster · Migración 009 · Fotos de evidencia de un trabajo
-- =====================================================================

-- El prestador sube fotos del trabajo terminado y el cliente fotos del problema que reporta.
-- Son la evidencia con la que el equipo resuelve una disputa (HU-16).
CREATE TABLE evidencias (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES solicitudes(id),
  autor_id     UUID NOT NULL REFERENCES usuarios(id),
  rol          TEXT NOT NULL CHECK (rol IN ('cliente', 'prestador')),
  archivo      TEXT NOT NULL,                -- nombre del archivo en el almacenamiento
  descripcion  TEXT CHECK (char_length(descripcion) <= 200),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX evidencias_solicitud ON evidencias (solicitud_id, creado_en);

-- Una evidencia no se puede borrar: si se pudiera, perdería su valor en una disputa.
CREATE FUNCTION impedir_borrado_evidencia() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las fotos de evidencia no se pueden eliminar';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER evidencias_sin_borrado BEFORE DELETE ON evidencias
  FOR EACH ROW EXECUTE FUNCTION impedir_borrado_evidencia();

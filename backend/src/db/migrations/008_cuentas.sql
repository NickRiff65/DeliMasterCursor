-- =====================================================================
-- DeliMaster · Migración 008 · Cuentas: términos, sesiones y recuperación
-- =====================================================================

-- Aceptación de los Términos de uso y la Política de privacidad (Ley N.º 21.719):
-- qué versión aceptó cada persona y cuándo. Si se publica una versión nueva, se vuelve a pedir.
ALTER TABLE usuarios
  ADD COLUMN terminos_version      TEXT,
  ADD COLUMN terminos_aceptados_en TIMESTAMPTZ,
  -- Los tokens emitidos antes de esta fecha dejan de valer (por ejemplo, al cambiar la contraseña)
  ADD COLUMN sesiones_desde        TIMESTAMPTZ;

-- Códigos de un solo uso para recuperar la contraseña. Se guarda solo su hash:
-- quien lea la base de datos no puede usarlos.
CREATE TABLE codigos_recuperacion (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash TEXT NOT NULL,
  expira_en   TIMESTAMPTZ NOT NULL,
  intentos    SMALLINT NOT NULL DEFAULT 0,
  usado_en    TIMESTAMPTZ,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX codigos_recuperacion_vigentes ON codigos_recuperacion (usuario_id) WHERE usado_en IS NULL;

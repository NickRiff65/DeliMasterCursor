-- =====================================================================
-- DeliMaster · Migración 022 · Verificación automática contra la SEC
-- =====================================================================

-- ------------------------------------------------- datos que se consultan en el registro
-- Sin RUT la solicitud sigue funcionando (APK antiguas), pero va a revisión manual.
ALTER TABLE verificaciones ADD COLUMN rut              TEXT;
ALTER TABLE verificaciones ADD COLUMN apellido_paterno TEXT;
ALTER TABLE verificaciones ADD COLUMN apellido_materno TEXT;

-- ------------------------------------------------- trazabilidad de la consulta
-- Una aprobación automática no tiene revisado_por: la responde metodo_revision.
-- consulta_motivo le explica al equipo por qué una solicitud llegó al panel.
ALTER TABLE verificaciones ADD COLUMN metodo_revision TEXT NOT NULL DEFAULT 'manual'
  CHECK (metodo_revision IN ('manual', 'automatica'));
ALTER TABLE verificaciones ADD COLUMN consulta_resultado TEXT
  CHECK (consulta_resultado IN ('vigente', 'no_vigente', 'no_encontrado', 'no_disponible'));
ALTER TABLE verificaciones ADD COLUMN consulta_motivo TEXT;
ALTER TABLE verificaciones ADD COLUMN consultado_en   TIMESTAMPTZ;
ALTER TABLE verificaciones ADD COLUMN revalidado_en   TIMESTAMPTZ;

-- ------------------------------------------------- una sola cuenta por RUT
-- El registro confirma que un RUT está habilitado, no quién lo escribió: el RUT
-- queda amarrado a una sola cuenta y los pagos solo van a ese mismo RUT.
ALTER TABLE prestadores ADD COLUMN rut_verificado TEXT UNIQUE;

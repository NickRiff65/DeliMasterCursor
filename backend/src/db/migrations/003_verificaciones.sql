-- =====================================================================
-- DeliMaster 2.0 · Migración 003 · Verificación de prestadores (HU-11)
-- =====================================================================

-- Un prestador no puede tener dos solicitudes pendientes para la misma categoría.
CREATE UNIQUE INDEX verificaciones_una_pendiente
  ON verificaciones (prestador_id, categoria_id) WHERE estado = 'pendiente';

-- Una verificación resuelta debe registrar quién la revisó y cuándo;
-- un rechazo debe explicar el motivo al prestador.
ALTER TABLE verificaciones ADD CONSTRAINT verificacion_resuelta_completa CHECK (
  estado = 'pendiente'
  OR (revisado_en IS NOT NULL AND (estado <> 'rechazada' OR observacion IS NOT NULL))
);

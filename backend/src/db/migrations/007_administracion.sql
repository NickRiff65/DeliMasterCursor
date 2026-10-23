-- =====================================================================
-- DeliMaster · Migración 007 · Administración (HU-13, HU-14, HU-16, HU-17)
-- =====================================================================

-- HU-17: la SEC entrega un certificado de instalador autorizado con un código QR verificable
-- en su sitio y una vigencia de tres meses. Se guarda el código y la fecha de vencimiento:
-- una verificación vencida deja de habilitar al prestador en el catálogo.
ALTER TABLE verificaciones
  ADD COLUMN codigo_certificado TEXT,
  ADD COLUMN vence_en DATE;

-- Verificaciones SEC aprobadas antes de esta migración: vencen tres meses después de su revisión
UPDATE verificaciones SET vence_en = (revisado_en + interval '3 months')::date
 WHERE organismo = 'SEC' AND estado = 'aprobada' AND vence_en IS NULL;

ALTER TABLE verificaciones ADD CONSTRAINT verificacion_sec_con_vencimiento CHECK (
  organismo <> 'SEC' OR estado <> 'aprobada' OR vence_en IS NOT NULL
);

-- HU-13: datos para transferir el pago al prestador (el RUT es obligatorio para una transferencia)
ALTER TABLE prestadores ADD COLUMN rut TEXT;

-- Moderación: usuarios con mensajes bloqueados por el filtro anti-fuga
CREATE INDEX mensajes_bloqueados ON mensajes (emisor_id) WHERE bloqueado;

-- Disputas abiertas (HU-16) y fondos por transferir (HU-13)
CREATE INDEX solicitudes_en_disputa ON solicitudes (actualizado_en) WHERE estado = 'en_disputa';

-- Moderación: quién desactivó una cuenta, cuándo y por qué (trazabilidad)
ALTER TABLE usuarios
  ADD COLUMN desactivado_motivo TEXT,
  ADD COLUMN desactivado_por    UUID REFERENCES usuarios(id),
  ADD COLUMN desactivado_en     TIMESTAMPTZ;

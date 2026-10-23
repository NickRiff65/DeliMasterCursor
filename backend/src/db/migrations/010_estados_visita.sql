-- =====================================================================
-- DeliMaster 2.0 · Migración 010 · Estados de la modalidad "visita + cotización"
-- Va sola: PostgreSQL no permite usar un valor nuevo de un ENUM en la misma transacción
-- en que se agrega (lo usa la migración 011).
-- =====================================================================

ALTER TYPE estado_solicitud ADD VALUE IF NOT EXISTS 'visita_por_pagar' AFTER 'asignada';  -- el prestador aceptó con visita
ALTER TYPE estado_solicitud ADD VALUE IF NOT EXISTS 'visita_pagada' AFTER 'visita_por_pagar'; -- visita retenida, esperando la llegada
ALTER TYPE estado_solicitud ADD VALUE IF NOT EXISTS 'en_diagnostico' AFTER 'visita_pagada';   -- llegó (código válido), cotizando
ALTER TYPE estado_solicitud ADD VALUE IF NOT EXISTS 'cotizada' AFTER 'en_diagnostico';        -- cotización enviada al cliente

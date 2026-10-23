-- =====================================================================
-- DeliMaster 2.0 · Migración 017 · Eliminar la cuenta (Ley N.º 21.719, derecho de supresión)
-- =====================================================================
-- La persona puede eliminar su cuenta desde la app. Se borran sus datos personales (nombre, correo,
-- celular, comuna, ficha, datos bancarios y tarjeta guardada) y la cuenta queda cerrada para siempre.
-- Los registros de pagos, el libro contable, los mensajes y las fotos de los trabajos se conservan sin
-- su nombre, por obligaciones contables y como respaldo de reclamos.
ALTER TABLE usuarios ADD COLUMN eliminada_en TIMESTAMPTZ;

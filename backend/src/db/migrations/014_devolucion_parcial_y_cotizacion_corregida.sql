-- =====================================================================
-- DeliMaster 2.0 · Migración 014 · Devolución parcial en disputas y cotización corregida
-- =====================================================================

-- Disputa resuelta en parte: el equipo devuelve al cliente solo una parte del pago (por ejemplo, los
-- gastos en materiales sin boleta) y el resto se libera al maestro. El movimiento conserva el monto que
-- pagó el cliente (monto_bruto) y registra cuánto se le devolvió; la comisión se recalcula sobre lo
-- que queda para el maestro.
ALTER TABLE ledger_movimientos
  ADD COLUMN monto_reembolsado INTEGER NOT NULL DEFAULT 0 CHECK (monto_reembolsado >= 0);
ALTER TABLE ledger_movimientos DROP CONSTRAINT ledger_cuadra;
ALTER TABLE ledger_movimientos
  ADD CONSTRAINT ledger_cuadra CHECK (monto_bruto = comision + monto_neto + monto_reembolsado);

-- Detalle de un evento del dinero (por ejemplo, "Devolución parcial al cliente")
ALTER TABLE ledger_eventos ADD COLUMN detalle TEXT;

-- El maestro puede corregir la cotización mientras el cliente no responde: la anterior queda "reemplazada"
ALTER TABLE cotizaciones DROP CONSTRAINT cotizaciones_estado_check;
ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_estado_check
  CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'reemplazada'));

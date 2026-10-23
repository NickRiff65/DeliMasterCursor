-- =====================================================================
-- DeliMaster 2.0 · Migración 011 · Visita de diagnóstico y cotización en la app
--
-- Dos modalidades de cobro, que el prestador elige al aceptar:
--   precio_cerrado  el cliente paga el total al contratar (flujo original)
--   visita          el cliente paga la visita; el prestador la recibe al llegar (código de llegada),
--                   cotiza en terreno y, si el cliente acepta, se paga el saldo (total − visita)
-- Una solicitud puede tener entonces dos pagos (visita y saldo), cada uno con su movimiento
-- en el ledger. La comisión se aplica a cada pago, es decir, al total del trabajo.
-- =====================================================================

ALTER TABLE solicitudes
  ADD COLUMN modalidad            TEXT NOT NULL DEFAULT 'precio_cerrado'
                                  CHECK (modalidad IN ('precio_cerrado', 'visita')),
  ADD COLUMN tarifa_visita        INTEGER CHECK (tarifa_visita > 0),
  ADD COLUMN visita_programada_en TIMESTAMPTZ,
  -- Código de 4 dígitos que solo ve el cliente; el prestador lo ingresa al llegar
  ADD COLUMN codigo_llegada       TEXT CHECK (codigo_llegada ~ '^[0-9]{4}$'),
  ADD COLUMN intentos_codigo      SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN llegada_en           TIMESTAMPTZ,
  ADD CONSTRAINT visita_completa CHECK (
    modalidad = 'precio_cerrado' OR (tarifa_visita IS NOT NULL AND visita_programada_en IS NOT NULL)
  );

-- ---------------------------------------------------------------- pagos y ledger: visita, saldo o total
ALTER TABLE pagos ADD COLUMN concepto TEXT NOT NULL DEFAULT 'total' CHECK (concepto IN ('total', 'visita', 'saldo'));
DROP INDEX pagos_un_autorizado;
-- Un solo pago autorizado por concepto (una visita y un saldo, o un total)
CREATE UNIQUE INDEX pagos_un_autorizado ON pagos (solicitud_id, concepto) WHERE estado = 'autorizado';

ALTER TABLE ledger_movimientos ADD COLUMN concepto TEXT NOT NULL DEFAULT 'total' CHECK (concepto IN ('total', 'visita', 'saldo'));
ALTER TABLE ledger_movimientos DROP CONSTRAINT ledger_movimientos_solicitud_id_key;
ALTER TABLE ledger_movimientos ADD CONSTRAINT ledger_un_movimiento_por_concepto UNIQUE (solicitud_id, concepto);

-- ---------------------------------------------------------------- cotizaciones
-- El total incluye la visita: si el cliente acepta, paga el saldo (total − visita).
CREATE TABLE cotizaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  UUID NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  prestador_id  UUID NOT NULL REFERENCES prestadores(usuario_id),
  mano_obra     INTEGER NOT NULL CHECK (mano_obra >= 0),
  materiales    INTEGER NOT NULL DEFAULT 0 CHECK (materiales >= 0),
  total         INTEGER NOT NULL CHECK (total > 0),
  detalle       TEXT NOT NULL CHECK (length(detalle) BETWEEN 10 AND 1000),
  estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondida_en TIMESTAMPTZ,
  CONSTRAINT cotizacion_cuadra CHECK (total = mano_obra + materiales)
);
CREATE UNIQUE INDEX cotizaciones_una_pendiente ON cotizaciones (solicitud_id) WHERE estado = 'pendiente';

-- Visitas pagadas cuya hora ya pasó sin llegada (para devolverlas automáticamente)
CREATE INDEX solicitudes_visitas_pagadas ON solicitudes (visita_programada_en) WHERE estado = 'visita_pagada';

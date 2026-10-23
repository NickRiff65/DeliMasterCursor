-- =====================================================================
-- DeliMaster 2.0 · Migración 015 · Tarjeta guardada (Webpay Oneclick)
-- =====================================================================
-- El cliente puede guardar su tarjeta al pagar la visita y pagar el saldo (o el próximo trabajo) sin
-- volver a ingresarla. DeliMaster nunca guarda el número de la tarjeta: Transbank entrega un
-- identificador (tbk_user), que se guarda cifrado, más el tipo y los últimos 4 dígitos para mostrarla.
CREATE TABLE tarjetas (
  usuario_id  UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  tbk_user    TEXT NOT NULL,                       -- cifrado (AES-256-GCM)
  tipo        TEXT,                                -- Visa, Mastercard, Redcompra…
  ultimos4    TEXT NOT NULL CHECK (ultimos4 ~ '^[0-9]{4}$'),
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inscripciones en curso: el cliente está en la página de Transbank registrando su tarjeta.
-- Si la inscribe para pagar algo (solicitud y concepto), el cobro se hace al volver.
CREATE TABLE inscripciones (
  token        TEXT PRIMARY KEY,
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  url_webpay   TEXT NOT NULL,
  solicitud_id UUID REFERENCES solicitudes(id),
  volver_a     TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'iniciada' CHECK (estado IN ('iniciada', 'completada', 'rechazada')),
  respuesta    JSONB,
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cómo se pagó: Webpay Plus (el cliente ingresa la tarjeta) o la tarjeta guardada (Oneclick Mall,
-- que además usa una orden de compra de la tienda hija para cobrar y devolver)
ALTER TABLE pagos
  ADD COLUMN medio TEXT NOT NULL DEFAULT 'webpay' CHECK (medio IN ('webpay', 'oneclick')),
  ADD COLUMN orden_hija TEXT UNIQUE;

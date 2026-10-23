-- =====================================================================
-- DeliMaster 2.0 · Migración 001 · Esquema inicial
-- Montos en pesos chilenos enteros (INTEGER). Fechas con zona horaria.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------- tipos
CREATE TYPE rol_usuario AS ENUM ('cliente', 'prestador', 'admin');

CREATE TYPE estado_verificacion AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- Ciclo de vida de una solicitud (máquina de estados, ver docs/plan-desarrollo.md)
CREATE TYPE estado_solicitud AS ENUM (
  'creada',        -- el cliente la creó (puede venir de la cola sin conexión)
  'asignada',      -- el cliente eligió un prestador del catálogo
  'confirmada',    -- el prestador aceptó dentro del tiempo límite
  'pagada',        -- Webpay autorizó el pago; fondos retenidos en el ledger
  'finalizada',    -- el prestador marcó el trabajo como terminado
  'cerrada',       -- cierre oficial: se libera el pago y se habilita la reseña
  'cancelada',
  'en_disputa'
);

CREATE TYPE estado_ledger AS ENUM ('retenido', 'liberado', 'transferido', 'reembolsado');

CREATE TYPE estado_pago AS ENUM ('iniciado', 'autorizado', 'rechazado', 'anulado');

CREATE TYPE origen_gasto AS ENUM ('ocr', 'manual');

-- Mantiene actualizado_en al día en cada UPDATE
CREATE FUNCTION tocar_actualizado_en() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- usuarios
CREATE TABLE usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rol            rol_usuario NOT NULL,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL,
  telefono       TEXT,                     -- nunca se expone a la contraparte (enmascaramiento)
  password_hash  TEXT NOT NULL,            -- Bcrypt
  comuna         TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));
CREATE TRIGGER usuarios_actualizado BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

-- ---------------------------------------------------------------- categorías
CREATE TABLE categorias (
  id                    SERIAL PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,
  nombre                TEXT NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('oficio', 'campo')),
  requiere_verificacion BOOLEAN NOT NULL DEFAULT false,
  organismo             TEXT CHECK (organismo IN ('SEC', 'SAG', 'CONAF')),
  palabras_clave        TEXT[] NOT NULL DEFAULT '{}',  -- HU-08; en minúsculas y sin tildes ni ñ
  activa                BOOLEAN NOT NULL DEFAULT false -- se activan por fases según el cronograma
);

-- ---------------------------------------------------------------- prestadores
CREATE TABLE prestadores (
  usuario_id            UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  descripcion           TEXT,
  comunas_atendidas     TEXT[] NOT NULL DEFAULT '{}',
  disponible            BOOLEAN NOT NULL DEFAULT true,
  -- Reputación: solo se recalcula con servicios cerrados oficialmente (HU-06, HU-07)
  calificacion_promedio NUMERIC(3,2) NOT NULL DEFAULT 0,
  trabajos_cerrados     INTEGER NOT NULL DEFAULT 0,
  -- Datos para la transferencia manual del pago (HU-13)
  banco                 TEXT,
  tipo_cuenta           TEXT,
  numero_cuenta         TEXT,
  actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER prestadores_actualizado BEFORE UPDATE ON prestadores
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

CREATE TABLE prestador_categorias (
  prestador_id UUID REFERENCES prestadores(usuario_id) ON DELETE CASCADE,
  categoria_id INTEGER REFERENCES categorias(id),
  PRIMARY KEY (prestador_id, categoria_id)
);

-- Verificación contra registros oficiales (HU-11). Se guarda fuente y resultado como evidencia.
CREATE TABLE verificaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id    UUID NOT NULL REFERENCES prestadores(usuario_id) ON DELETE CASCADE,
  categoria_id    INTEGER NOT NULL REFERENCES categorias(id),
  organismo       TEXT NOT NULL CHECK (organismo IN ('SEC', 'SAG', 'CONAF')),
  numero_registro TEXT NOT NULL,
  estado          estado_verificacion NOT NULL DEFAULT 'pendiente',
  fuente_url      TEXT,
  observacion     TEXT,
  revisado_por    UUID REFERENCES usuarios(id),
  revisado_en     TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verificaciones_pendientes ON verificaciones (estado) WHERE estado = 'pendiente';

-- ---------------------------------------------------------------- solicitudes
-- El id lo genera el celular (UUID) para que reenviar una solicitud creada
-- sin conexión no la duplique (HU-12): un segundo INSERT con el mismo id falla.
CREATE TABLE solicitudes (
  id                   UUID PRIMARY KEY,
  grupo_id             UUID,                 -- agrupa servicios detectados en un mismo mensaje (HU-08)
  cliente_id           UUID NOT NULL REFERENCES usuarios(id),
  prestador_id         UUID REFERENCES prestadores(usuario_id),
  categoria_id         INTEGER NOT NULL REFERENCES categorias(id),
  descripcion_original TEXT NOT NULL,        -- texto tal como lo escribió el cliente
  comuna               TEXT,
  latitud              NUMERIC(9,6),
  longitud             NUMERIC(9,6),
  precio_acordado      INTEGER CHECK (precio_acordado > 0),
  estado               estado_solicitud NOT NULL DEFAULT 'creada',
  creado_en_dispositivo TIMESTAMPTZ,         -- cuándo se creó realmente (puede ser antes de sincronizar)
  creado_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_en           TIMESTAMPTZ
);
CREATE INDEX solicitudes_cliente ON solicitudes (cliente_id, creado_en DESC);
CREATE INDEX solicitudes_prestador ON solicitudes (prestador_id, estado);
CREATE TRIGGER solicitudes_actualizado BEFORE UPDATE ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

-- Historial de cambios de estado: trazabilidad ante disputas
CREATE TABLE solicitud_eventos (
  id              BIGSERIAL PRIMARY KEY,
  solicitud_id    UUID NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  estado_anterior estado_solicitud,
  estado_nuevo    estado_solicitud NOT NULL,
  actor_id        UUID REFERENCES usuarios(id),
  detalle         TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX solicitud_eventos_solicitud ON solicitud_eventos (solicitud_id, creado_en);

-- ---------------------------------------------------------------- pagos (Webpay Plus)
CREATE TABLE pagos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id   UUID NOT NULL REFERENCES solicitudes(id),
  orden_compra   TEXT NOT NULL UNIQUE,       -- buy_order enviado a Transbank
  token_webpay   TEXT UNIQUE,
  monto          INTEGER NOT NULL CHECK (monto > 0),
  estado         estado_pago NOT NULL DEFAULT 'iniciado',
  respuesta      JSONB,                      -- respuesta completa de Transbank como respaldo
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Una solicitud solo puede tener un pago autorizado
CREATE UNIQUE INDEX pagos_un_autorizado ON pagos (solicitud_id) WHERE estado = 'autorizado';
CREATE TRIGGER pagos_actualizado BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

-- ---------------------------------------------------------------- ledger de garantía
-- Un movimiento por solicitud pagada. Webpay deposita el monto en la cuenta de DeliMaster;
-- este registro indica cuánto se le debe al prestador y en qué estado está ese dinero.
CREATE TABLE ledger_movimientos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id     UUID NOT NULL UNIQUE REFERENCES solicitudes(id),
  pago_id          UUID NOT NULL UNIQUE REFERENCES pagos(id),
  prestador_id     UUID NOT NULL REFERENCES prestadores(usuario_id),
  monto_bruto      INTEGER NOT NULL CHECK (monto_bruto > 0),
  comision         INTEGER NOT NULL CHECK (comision >= 0),
  monto_neto       INTEGER NOT NULL CHECK (monto_neto > 0),
  estado           estado_ledger NOT NULL DEFAULT 'retenido',
  comprobante      TEXT,                     -- N.º de transferencia bancaria (HU-13)
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  liberado_en      TIMESTAMPTZ,
  transferido_en   TIMESTAMPTZ,
  CONSTRAINT ledger_cuadra CHECK (monto_bruto = comision + monto_neto),
  CONSTRAINT ledger_fechas CHECK (
    (estado = 'retenido'    AND liberado_en IS NULL AND transferido_en IS NULL) OR
    (estado = 'liberado'    AND liberado_en IS NOT NULL AND transferido_en IS NULL) OR
    (estado = 'transferido' AND liberado_en IS NOT NULL AND transferido_en IS NOT NULL AND comprobante IS NOT NULL) OR
    (estado = 'reembolsado')
  )
);
CREATE INDEX ledger_por_liberar ON ledger_movimientos (estado) WHERE estado = 'liberado';

-- Auditoría de cada cambio de estado del dinero: fecha, usuario y monto
CREATE TABLE ledger_eventos (
  id              BIGSERIAL PRIMARY KEY,
  movimiento_id   UUID NOT NULL REFERENCES ledger_movimientos(id),
  estado_anterior estado_ledger,
  estado_nuevo    estado_ledger NOT NULL,
  monto           INTEGER NOT NULL,
  actor_id        UUID REFERENCES usuarios(id),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El ledger es solo de avance: un movimiento nunca se borra.
CREATE FUNCTION impedir_borrado_ledger() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos del ledger no se pueden eliminar';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_sin_borrado BEFORE DELETE ON ledger_movimientos
  FOR EACH ROW EXECUTE FUNCTION impedir_borrado_ledger();

-- ---------------------------------------------------------------- chat
CREATE TABLE mensajes (
  id             BIGSERIAL PRIMARY KEY,
  solicitud_id   UUID NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  emisor_id      UUID NOT NULL REFERENCES usuarios(id),
  contenido      TEXT NOT NULL,
  bloqueado      BOOLEAN NOT NULL DEFAULT false,  -- filtro anti-fuga (HU-04)
  motivo_bloqueo TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mensajes_solicitud ON mensajes (solicitud_id, creado_en);

-- ---------------------------------------------------------------- reseñas
CREATE TABLE resenas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL UNIQUE REFERENCES solicitudes(id),   -- una reseña por servicio
  cliente_id   UUID NOT NULL REFERENCES usuarios(id),
  prestador_id UUID NOT NULL REFERENCES prestadores(usuario_id),
  estrellas    SMALLINT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario   TEXT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo se puede reseñar un servicio cerrado oficialmente (HU-06). Se valida en la base de datos
-- además de en la API, para que ninguna ruta futura pueda saltarse la regla.
CREATE FUNCTION validar_resena() RETURNS trigger AS $$
DECLARE
  est estado_solicitud;
BEGIN
  SELECT estado INTO est FROM solicitudes WHERE id = NEW.solicitud_id;
  IF est IS DISTINCT FROM 'cerrada' THEN
    RAISE EXCEPTION 'Solo se pueden reseñar servicios cerrados oficialmente (estado actual: %)', est;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER resenas_solo_cerradas BEFORE INSERT ON resenas
  FOR EACH ROW EXECUTE FUNCTION validar_resena();

-- ---------------------------------------------------------------- portafolio y panel contable
CREATE TABLE fotos_trabajo (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id UUID NOT NULL REFERENCES prestadores(usuario_id) ON DELETE CASCADE,
  solicitud_id UUID REFERENCES solicitudes(id),
  url          TEXT NOT NULL,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Boletas de materiales (HU-09). El OCR propone el monto; el prestador puede corregirlo.
CREATE TABLE gastos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  UUID NOT NULL REFERENCES solicitudes(id),
  prestador_id  UUID NOT NULL REFERENCES prestadores(usuario_id),
  monto         INTEGER NOT NULL CHECK (monto > 0),
  origen        origen_gasto NOT NULL,
  confianza_ocr NUMERIC(4,3) CHECK (confianza_ocr BETWEEN 0 AND 1),
  imagen_url    TEXT,
  descripcion   TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gastos_prestador ON gastos (prestador_id, creado_en DESC);

-- ---------------------------------------------------------------- datos iniciales
-- Fase 1 del cronograma: electricidad (verificada con SEC) y poda de altura, activas.
INSERT INTO categorias (slug, nombre, tipo, requiere_verificacion, organismo, palabras_clave, activa) VALUES
  ('electricidad', 'Electricidad', 'oficio', true,  'SEC',
     '{electricista,electricidad,enchufe,luz,corto,tablero,automatico,cable}', true),
  ('poda-altura',  'Poda de altura', 'campo', false, NULL,
     '{poda,podar,arbol,rama,ramas,altura}', true),
  ('gasfiteria',   'Gasfitería', 'oficio', false, NULL,
     '{gasfiter,gasfiteria,caneria,fuga,desague,lavaplatos,wc,calefont}', false),
  ('cerrajeria',   'Cerrajería', 'oficio', false, NULL,
     '{cerrajero,cerradura,llave,chapa}', false),
  ('mecanica',     'Mecánica', 'oficio', false, NULL,
     '{mecanico,auto,motor,frenos,vehiculo}', false),
  ('tala',         'Tala y volteo de árboles', 'campo', false, 'CONAF',
     '{talar,tala,cortar arbol,volteo}', false),
  ('riego',        'Riego tecnificado', 'campo', false, NULL,
     '{riego,regadio,goteo,aspersor,canal,canales}', false),
  ('preparacion-suelo', 'Preparación de suelo con maquinaria', 'campo', false, NULL,
     '{arar,arado,rastraje,tractor,suelo}', false),
  ('agroquimicos', 'Aplicación de agroquímicos', 'campo', true, 'SAG',
     '{fumigar,fumigacion,plaguicida,agroquimico,pulverizar}', false),
  ('cercos',       'Cercos eléctricos y perimetrales', 'campo', false, NULL,
     '{cerco,cerca,alambrado,ganado}', false);

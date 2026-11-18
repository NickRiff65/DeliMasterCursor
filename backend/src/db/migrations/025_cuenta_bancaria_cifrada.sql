-- =====================================================================
-- DeliMaster · Migración 025 · Cuenta bancaria del maestro cifrada en reposo
-- =====================================================================

-- El número de cuenta deja de guardarse en texto plano: la aplicación lo cifra con AES-256-GCM
-- (utils/cuentaBancaria.js) antes de escribirlo y lo descifra solo para su dueño y para el equipo
-- que le transfiere. La columna sigue siendo TEXT; cambia lo que contiene ("iv.etiqueta.datos").
-- Las cuentas que ya existían se cifran al ejecutar `npm run migrate` y al iniciar el servidor,
-- porque la clave vive en el .env y no en la base de datos.
COMMENT ON COLUMN prestadores.numero_cuenta IS
  'Número de cuenta bancaria cifrado con AES-256-GCM (iv.etiqueta.datos en base64url). Nunca en texto plano.';

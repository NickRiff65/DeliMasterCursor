-- =====================================================================
-- DeliMaster 2.0 · Migración 018 · Nombre y apellido por separado
-- =====================================================================
-- Al registrarse se piden el nombre y el apellido en campos distintos, para asegurar que la persona
-- indique su apellido. La columna "nombre" sigue guardando el nombre completo (es la que se muestra);
-- estas dos permiten editar cada parte. Las cuentas anteriores las tienen vacías: la app separa la
-- primera palabra como nombre y el resto como apellido hasta que la persona los edite.
ALTER TABLE usuarios
  ADD COLUMN nombres   TEXT,
  ADD COLUMN apellidos TEXT;

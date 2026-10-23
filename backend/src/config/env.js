// Configuración centralizada. Falla al iniciar si falta una variable obligatoria,
// en vez de fallar más tarde en medio de una operación.

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno obligatoria ${nombre} (ver .env.example)`);
  }
  return valor;
}

const esTest = process.env.NODE_ENV === 'test';

// En producción (PaaS) el proveedor entrega DATABASE_URL; en local se usan las variables DB_*.
function configBaseDatos(nombreBase) {
  if (process.env.DATABASE_URL && !esTest) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD,
    database: nombreBase,
  };
}

// El secreto firma las sesiones y los enlaces de boletas: debe ser largo y no el de ejemplo
function secretoJwt() {
  if (esTest) return process.env.JWT_SECRET ?? 'secreto-de-pruebas';
  const secreto = requerida('JWT_SECRET');
  if (secreto.length < 32 || /CAMBIAR/i.test(secreto)) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres aleatorios (no uses el valor de ejemplo)');
  }
  return secreto;
}

// Lista separada por comas ("https://a.cl,https://b.cl"); vacía = sin restricción (solo desarrollo)
const lista = (valor) => (valor ?? '').split(',').map((v) => v.trim()).filter(Boolean);

export const config = {
  entorno: process.env.NODE_ENV ?? 'development',
  esTest,
  esProduccion: process.env.NODE_ENV === 'production',
  puerto: Number(process.env.PORT ?? 3000),
  // Las pruebas usan una base separada para no borrar datos de desarrollo.
  db: configBaseDatos(esTest ? (process.env.DB_NAME_TEST ?? 'delimaster_test') : (process.env.DB_NAME ?? 'delimaster')),
  jwtSecret: secretoJwt(),
  jwtExpira: process.env.JWT_EXPIRA ?? '7d',
  // Las sesiones de administración duran menos: dan acceso a datos de todos y a mover dinero
  jwtExpiraAdmin: process.env.JWT_EXPIRA_ADMIN ?? '8h',
  // Orígenes web que pueden llamar a la API (panel y versión web de las apps). Vacío = todos (desarrollo)
  corsOrigenes: lista(process.env.CORS_ORIGENES),
  // Detrás de un proxy (PaaS) hay que confiar en él para conocer la IP y el protocolo reales
  confiarEnProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false,
  // URL pública de la API (producción). Sin ella se deduce de cada petición (sirve en cualquier red local)
  urlPublicaApi: process.env.URL_PUBLICA_API?.replace(/\/$/, '') || null,
  comisionPorcentaje: Number(process.env.COMISION_PORCENTAJE ?? 12),
  // HU-05: minutos que tiene el prestador para aceptar o rechazar una asignación
  plazoRespuestaMin: Number(process.env.PLAZO_RESPUESTA_MIN ?? 30),
  // Horas que tiene el cliente para confirmar el cierre; después se cierra solo (protege al prestador)
  plazoCierreHoras: Number(process.env.PLAZO_CIERRE_HORAS ?? 72),
};

if (config.comisionPorcentaje < 10 || config.comisionPorcentaje > 15) {
  throw new Error('COMISION_PORCENTAJE debe estar entre 10 y 15, según el modelo de negocio');
}

if (config.esProduccion && !config.corsOrigenes.length) {
  throw new Error('En producción define CORS_ORIGENES con los dominios del panel y de la versión web');
}

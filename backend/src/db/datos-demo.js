// Datos de demostración realistas para la base de DESARROLLO (nunca en producción).
//
//   npm.cmd run db:demo        ·  todas las cuentas usan la contraseña CLAVE_DEMO
//
// Crea clientes y maestros de Chillán y Coihueco con un historial coherente: trabajos cerrados con pago,
// comisión, transferencia, chat, gastos y reseñas reales. La reputación de cada prestador se
// calcula desde esas reseñas (nada inventado). Deja además casos listos para mostrar el panel
// de administración: una disputa abierta, una verificación por revisar, un certificado por
// vencer, pagos por transferir y un usuario para moderación.
//
// Es aditivo e idempotente: se puede correr varias veces sin duplicar y nunca borra datos
// (el libro contable no permite borrar movimientos).
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { pool, enTransaccion } from './pool.js';
import { config } from '../config/env.js';
import { calcularComision } from '../modules/pagos/pagos.servicio.js';
import { digitoVerificador } from '../utils/rut.js';
import { VERSION_TERMINOS } from '../modules/auth/auth.servicio.js';

const CLAVE_DEMO = 'demo1234';
const DIA = 86_400_000;
const HORA = 3_600_000;

// ------------------------------------------------------------------ utilidades
// UUID estable a partir de una clave: correr el script dos veces no duplica nada
function idDemo(clave) {
  const h = createHash('sha1').update(`delimaster-demo:${clave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Números pseudoaleatorios con semilla: el mismo historial en cada computador del equipo
function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = generador(20261008);
const entre = (min, max) => Math.floor(min + azar() * (max - min + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const redondear = (monto, paso = 5000) => Math.max(paso, Math.round(monto / paso) * paso);
const rut = (cuerpo) => `${cuerpo}-${digitoVerificador(String(cuerpo))}`;
// Mezcla reproducible (Fisher-Yates con la misma semilla)
function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Fecha "hace n días" a una hora de trabajo
function haceDias(dias, hora = entre(9, 17)) {
  const f = new Date(Date.now() - dias * DIA);
  f.setHours(hora, entre(0, 59), 0, 0);
  return f;
}
const despues = (fecha, horas) => new Date(fecha.getTime() + horas * HORA);

// ------------------------------------------------------------------ personas (ficticias)
const CLIENTES = [
  { clave: 'ana', nombre: 'Ana Pérez', email: 'ana.perez@demo.cl', comuna: 'Chillán' },
  { clave: 'carolina', nombre: 'Carolina Muñoz', email: 'carolina.munoz@demo.cl', comuna: 'Chillán' },
  { clave: 'jorge', nombre: 'Jorge Sepúlveda', email: 'jorge.sepulveda@demo.cl', comuna: 'Coihueco' },
  { clave: 'valentina', nombre: 'Valentina Rojas', email: 'valentina.rojas@demo.cl', comuna: 'Chillán' },
  { clave: 'hector', nombre: 'Héctor Fuentealba', email: 'hector.fuentealba@demo.cl', comuna: 'Coihueco' },
  { clave: 'francisca', nombre: 'Francisca Lagos', email: 'francisca.lagos@demo.cl', comuna: 'Chillán' },
  { clave: 'ricardo', nombre: 'Ricardo Parra', email: 'ricardo.parra@demo.cl', comuna: 'Coihueco' },
  { clave: 'manuel', nombre: 'Manuel Jara', email: 'manuel.jara@demo.cl', comuna: 'Chillán' },
];

// estrellas: calificación de cada trabajo (la reputación sale de aquí, no se escribe a mano)
// recientes: trabajos cerrados hace 1–2 días, aún por transferir (aparecen en el panel)
const PRESTADORES = [
  {
    clave: 'juan', nombre: 'Juan Soto', email: 'juan.soto@demo.cl', categoria: 'electricidad',
    descripcion: 'Electricista autorizado SEC clase D. Tableros, enchufes, iluminación y fallas eléctricas. 12 años de experiencia.',
    comunas: ['Chillán'], verificado: true, banco: ['BancoEstado', 'CuentaRUT', 13456789],
    estrellas: [5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 3], precio: [25000, 120000], recientes: 2,
  },
  {
    clave: 'maria', nombre: 'María Fuentes', email: 'maria.fuentes@demo.cl', categoria: 'electricidad',
    descripcion: 'Instalaciones eléctricas domiciliarias, certificación TE1 y conexión de cocinas a inducción.',
    comunas: ['Chillán', 'Coihueco'], verificado: true, banco: ['Banco de Chile', 'Cuenta Corriente', 15782431],
    estrellas: [5, 5, 5, 5, 5, 4], precio: [35000, 140000], recientes: 0, porVencer: true,
  },
  {
    clave: 'pedro', nombre: 'Pedro Muñoz', email: 'pedro.munoz@demo.cl', categoria: 'electricidad',
    descripcion: 'Electricista. Reparaciones rápidas, cambio de enchufes e interruptores.',
    comunas: ['Chillán'], verificado: true, banco: ['Santander', 'Cuenta Vista', 17234905],
    estrellas: [4, 4, 3], precio: [20000, 60000], recientes: 0,
  },
  {
    clave: 'luis', nombre: 'Luis Contreras', email: 'luis.contreras@demo.cl', categoria: 'poda-altura',
    descripcion: 'Poda de altura con equipo de seguridad certificado y motosierra propia. Cuadrilla de 3 personas.',
    comunas: ['Coihueco', 'Chillán'], verificado: false, banco: ['BancoEstado', 'CuentaRUT', 12345678],
    estrellas: [5, 5, 5, 5, 5, 5, 4, 4, 4, 3], precio: [45000, 180000], recientes: 1,
  },
  {
    clave: 'agricola', nombre: 'Agrícola Coihueco Sur', email: 'contacto@agricolanuble.demo.cl', categoria: 'poda-altura',
    descripcion: 'Contratista agrícola con cuadrilla propia: poda de huertos, nogales y manejo de arboledas en predios rurales.',
    comunas: ['Coihueco'], verificado: false, banco: null,   // aún sin datos bancarios
    estrellas: [5, 5, 4], precio: [150000, 380000], recientes: 3,
  },
  {
    clave: 'roberto', nombre: 'Roberto Cifuentes', email: 'roberto.cifuentes@demo.cl', categoria: 'poda-altura',
    descripcion: 'Poda y despeje de árboles en sectores cordilleranos. Recién llegado a DeliMaster.',
    comunas: ['Coihueco'], verificado: false, banco: ['BCI', 'Cuenta Corriente', 16543210],
    estrellas: [], precio: [0, 0], recientes: 0,
  },
  {
    clave: 'rodrigo', nombre: 'Rodrigo Valdés', email: 'rodrigo.valdes@demo.cl', categoria: 'electricidad',
    descripcion: 'Electricista instalador. Mi certificado SEC está en revisión.',
    comunas: ['Chillán'], verificado: false, pendiente: true, banco: null,
    estrellas: [], precio: [0, 0], recientes: 0,
  },
  {
    clave: 'carlos', nombre: 'Carlos Rivas', email: 'carlos.rivas@demo.cl', categoria: 'gasfiteria',
    descripcion: 'Gasfiter con 15 años de experiencia. Filtraciones, destapes, cambio de llaves y WC. Atiendo urgencias de noche y fines de semana.',
    comunas: ['Chillán', 'Coihueco'], verificado: false, banco: ['BancoEstado', 'CuentaRUT', 14567890],
    estrellas: [5, 5, 5, 5, 4, 5, 4, 5], precio: [18000, 85000], recientes: 1,
  },
  {
    clave: 'patricio', nombre: 'Patricio Lagos', email: 'patricio.lagos@demo.cl', categoria: 'cerrajeria',
    descripcion: 'Cerrajero. Apertura de puertas sin daño, cambio de chapas y copias de llaves. Llego en menos de una hora en Chillán.',
    comunas: ['Chillán'], verificado: false, banco: ['Banco Falabella', 'Cuenta Corriente', 15678234],
    estrellas: [5, 5, 4, 5, 5], precio: [15000, 45000], recientes: 0,
  },
  {
    clave: 'esteban', nombre: 'Esteban Ruiz', email: 'esteban.ruiz@demo.cl', categoria: 'gas',
    descripcion: 'Instalador de gas autorizado SEC. Calefont, cocinas, estufas y redes de gas licuado y natural.',
    comunas: ['Chillán', 'Coihueco'], verificado: true, banco: ['Scotiabank', 'Cuenta Corriente', 16789012],
    estrellas: [5, 5, 4, 5], precio: [30000, 150000], recientes: 0,
  },
  {
    clave: 'sergio', nombre: 'Sergio Medina', email: 'sergio.medina@demo.cl', categoria: 'carpinteria',
    descripcion: 'Carpintero. Muebles a medida, reparación de puertas y closets, terrazas de madera.',
    comunas: ['Chillán', 'Coihueco'], verificado: false, banco: ['BancoEstado', 'CuentaRUT', 13987654],
    estrellas: [5, 4, 5], precio: [40000, 250000], recientes: 0,
  },
  {
    clave: 'andres', nombre: 'Andrés Toro', email: 'andres.toro@demo.cl', categoria: 'techumbre',
    descripcion: 'Reparación de techos, goteras y canaletas. Zinc, tejas y bajadas de agua antes de las lluvias.',
    comunas: ['Coihueco', 'Chillán'], verificado: false, banco: ['BCI', 'Cuenta Vista', 17890123],
    estrellas: [5, 5, 4, 4], precio: [35000, 180000], recientes: 0,
  },
];

const DESCRIPCIONES = {
  electricidad: [
    'Se corta la luz cuando uso el hervidor y el microondas al mismo tiempo',
    'Necesito cambiar el tablero eléctrico antiguo de la casa',
    'Instalar tres enchufes nuevos en el living',
    'Un enchufe de la cocina se quemó y huele a plástico',
    'El automático salta todas las noches, necesito revisarlo',
    'Instalar focos LED en el patio y en la entrada',
    'Cambiar los interruptores de toda la casa',
    'No funciona la luz del baño ni el enchufe del espejo',
    'Conectar una cocina a inducción nueva',
    'Instalar un enchufe exclusivo para la lavadora',
  ],
  'poda-altura': [
    'Podar dos robles que tocan el tendido eléctrico',
    'Sacar ramas secas de un pino de unos 15 metros',
    'Poda de altura de un aromo que cae sobre el techo',
    'Despejar ramas sobre el camino de entrada del predio',
    'Poda de formación de 20 cerezos jóvenes',
    'Rebajar la altura de una hilera de álamos',
    'Retirar un gancho grande que quebró el viento',
    'Poda de nogales antes de la temporada',
  ],
};

Object.assign(DESCRIPCIONES, {
  gasfiteria: [
    'Se rompió una cañería bajo el lavaplatos y está saliendo agua',
    'El WC está tapado y no baja el agua',
    'Gotea la llave de la ducha toda la noche',
    'Hay una filtración en la pared del baño',
    'Cambiar el sifón y las llaves del lavamanos',
  ],
  cerrajeria: [
    'Me quedé afuera de la casa, se me quedaron las llaves adentro',
    'Cambiar la chapa de la puerta principal',
    'La cerradura del portón está trabada',
    'Necesito copias de llaves y un candado nuevo',
  ],
  gas: [
    'Instalar un calefont nuevo en el patio de servicio',
    'Hay olor a gas cerca de la cocina',
    'Conectar una estufa a gas y revisar el regulador',
  ],
  carpinteria: [
    'Reparar la puerta del dormitorio que no cierra',
    'Hacer un closet empotrado en el pasillo',
    'Arreglar una terraza de madera con tablas sueltas',
  ],
  techumbre: [
    'Tengo una gotera en el living cuando llueve',
    'Limpiar y reparar las canaletas antes del invierno',
    'Cambiar planchas de zinc sueltas por el viento',
  ],
});

const GASTOS = {
  electricidad: ['Enchufes y cajas de derivación', 'Cable 2,5 mm (20 m)', 'Automático 16 A', 'Interruptor diferencial', 'Focos LED'],
  'poda-altura': ['Combustible para motosierra', 'Cadena de motosierra', 'Arriendo de escala telescópica', 'Retiro de ramas en camioneta'],
  gasfiteria: ['Sifón y flexibles', 'Llave monomando', 'Teflón y sellos', 'Tubería PPR (3 m)'],
  cerrajeria: ['Cilindro de chapa', 'Chapa de seguridad', 'Copias de llaves'],
  gas: ['Regulador y flexible de gas', 'Llave de paso de gas', 'Ducto de evacuación'],
  carpinteria: ['Tablas de pino', 'Bisagras y tornillos', 'Barniz'],
  techumbre: ['Planchas de zinc', 'Canaleta de PVC (3 m)', 'Silicona y tornillos autoperforantes'],
};

const COMENTARIOS = {
  5: ['Excelente trabajo, llegó a la hora y dejó todo limpio.', 'Muy profesional, explicó lo que hizo y el precio fue justo.',
    'Rápido y ordenado. Lo vuelvo a contratar sin dudas.', 'Resolvió el problema en una sola visita. Muy recomendable.',
    'Trabajó con todos los elementos de seguridad. Impecable.', 'Cumplió con todo lo conversado en el chat.', null],
  4: ['Buen trabajo, solo se atrasó un poco en llegar.', 'Quedó bien, aunque tuve que recordarle retirar los restos.',
    'Correcto y amable. El precio un poco alto, pero vale la pena.', null],
  3: ['El trabajo quedó bien, pero llegó dos horas tarde y sin avisar.', 'Cumplió, aunque dejó ramas en el patio.'],
};

const CHAT = [
  ['prestador', 'Hola, puedo ir mañana a las 10. ¿Le acomoda?'],
  ['cliente', 'Perfecto, lo espero. La casa tiene portón verde.'],
  ['prestador', 'Voy en camino, llego en unos 15 minutos.'],
  ['prestador', 'Listo, ya terminé. Revise y me cuenta, por favor.'],
  ['cliente', 'Gracias, quedó muy bien.'],
];

// ------------------------------------------------------------------ cuentas
async function asegurarUsuario(db, { rol, nombre, email, comuna, telefono }, hash) {
  await db.query(
    `INSERT INTO usuarios (rol, nombre, email, telefono, password_hash, comuna, creado_en, terminos_version, terminos_aceptados_en)
     VALUES ($1, $2, $3, $4, $5, $6, now() - interval '150 days', $7, now() - interval '150 days')
     ON CONFLICT ((lower(email))) DO NOTHING`,
    [rol, nombre, email, telefono ?? null, hash, comuna, VERSION_TERMINOS]);
  const { rows } = await db.query('SELECT id FROM usuarios WHERE lower(email) = $1', [email]);
  return rows[0].id;
}

async function cuentas(db, hash) {
  const ids = { clientes: {}, prestadores: {} };
  ids.admin = await asegurarUsuario(db, { rol: 'admin', nombre: 'Administrador DeliMaster', email: 'admin@demo.cl', comuna: 'Chillán' }, hash);
  for (const c of CLIENTES) ids.clientes[c.clave] = await asegurarUsuario(db, { rol: 'cliente', ...c }, hash);

  for (const p of PRESTADORES) {
    const id = await asegurarUsuario(db, { rol: 'prestador', nombre: p.nombre, email: p.email, comuna: p.comunas[0], telefono: '912345678' }, hash);
    ids.prestadores[p.clave] = id;
    await db.query(
      `INSERT INTO prestadores (usuario_id, descripcion, comunas_atendidas) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id) DO UPDATE SET descripcion = EXCLUDED.descripcion, comunas_atendidas = EXCLUDED.comunas_atendidas`,
      [id, p.descripcion, p.comunas]);
    await db.query(
      `INSERT INTO prestador_categorias (prestador_id, categoria_id) SELECT $1, id FROM categorias WHERE slug = $2
       ON CONFLICT DO NOTHING`, [id, p.categoria]);
    if (p.banco) {
      const [banco, tipo, cuerpo] = p.banco;
      await db.query(
        'UPDATE prestadores SET rut = $2, banco = $3, tipo_cuenta = $4, numero_cuenta = $5 WHERE usuario_id = $1 AND rut IS NULL',
        [id, rut(cuerpo), banco, tipo, tipo === 'CuentaRUT' ? String(cuerpo) : `00${cuerpo}`]);
    }
    if (p.verificado) {
      // Certificado SEC vigente (si ya tiene uno aprobado y vigente, no se agrega otro)
      await db.query(
        `INSERT INTO verificaciones (id, prestador_id, categoria_id, organismo, numero_registro, codigo_certificado,
                                     estado, fuente_url, revisado_por, revisado_en, vence_en)
         SELECT $1, $2, c.id, c.organismo, $3, $4, 'aprobada', 'https://www.sec.cl', $5, now() - interval '20 days', current_date + 70
           FROM categorias c
          WHERE c.slug = $6
            AND NOT EXISTS (SELECT 1 FROM verificaciones v WHERE v.prestador_id = $2 AND v.categoria_id = c.id
                              AND v.estado = 'aprobada' AND (v.vence_en IS NULL OR v.vence_en >= current_date))
         ON CONFLICT (id) DO NOTHING`,
        [idDemo(`verif:${p.clave}`), id, `SEC-${entre(10000, 99999)}`,
          `${entre(1000, 9999)}-${entre(1000, 9999)}-${entre(1000, 9999)}`, ids.admin, p.categoria]);
    }
    if (p.porVencer) {
      // Para mostrar el aviso de renovación en el panel: su certificado vence en 9 días
      await db.query(
        `UPDATE verificaciones SET vence_en = current_date + 9
          WHERE prestador_id = $1 AND estado = 'aprobada' AND organismo = 'SEC'`, [id]);
    }
    if (p.pendiente) {
      await db.query(
        `INSERT INTO verificaciones (id, prestador_id, categoria_id, organismo, numero_registro, codigo_certificado, creado_en)
         SELECT $1, $2, c.id, c.organismo, 'SEC-58213', '4417-9902-3318', now() - interval '5 hours'
           FROM categorias c WHERE c.slug = $3
         ON CONFLICT DO NOTHING`, [idDemo(`verif-pendiente:${p.clave}`), id, p.categoria]);
    }
  }
  return ids;
}

// ------------------------------------------------------------------ trabajos
// Inserta un trabajo con todo su recorrido. Devuelve false si ya existía (no duplica).
async function trabajo(db, t) {
  const { rows } = await db.query(
    `INSERT INTO solicitudes (id, cliente_id, prestador_id, categoria_id, descripcion_original, comuna, precio_acordado,
                              estado, creado_en, creado_en_dispositivo, actualizado_en, asignada_en, confirmada_en,
                              finalizada_en, cerrado_en, motivo_disputa)
     SELECT $1, $2, $3, c.id, $4, $5, $6::int, $7::estado_solicitud, $8::timestamptz, $8::timestamptz,
            COALESCE($11::timestamptz, $10::timestamptz), $9::timestamptz, $9::timestamptz + interval '25 minutes',
            $10::timestamptz, $11::timestamptz, $12
       FROM categorias c WHERE c.slug = $13
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [t.id, t.cliente, t.prestador, t.descripcion, t.comuna, t.precio, t.estado, t.creado,
      despues(t.creado, 0.2), t.finalizada, t.cerrada ?? null, t.motivo ?? null, t.categoria]);
  if (!rows[0]) return false;

  const ev = (anterior, nuevo, fecha, actor, detalle = null) => db.query(
    `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, actor_id, detalle, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6)`, [t.id, anterior, nuevo, actor, detalle, fecha]);
  const autorizacion = String(entre(1000, 9999));
  const pagado = despues(t.creado, 1);
  await ev(null, 'creada', t.creado, t.cliente);
  await ev('creada', 'asignada', despues(t.creado, 0.2), t.cliente);
  await ev('asignada', 'confirmada', despues(t.creado, 0.6), t.prestador, `Precio: $${t.precio.toLocaleString('es-CL')}`);
  await ev('confirmada', 'pagada', pagado, null, `Webpay · autorización ${autorizacion}`);
  await ev('pagada', 'finalizada', t.finalizada, t.prestador);
  if (t.estado === 'cerrada') await ev('finalizada', 'cerrada', t.cerrada, t.cliente);
  if (t.estado === 'en_disputa') await ev('finalizada', 'en_disputa', despues(t.finalizada, 5), t.cliente, t.motivo);

  // Pago con Webpay (simulado) y movimiento en el libro contable de garantía
  const { rows: [pago] } = await db.query(
    `INSERT INTO pagos (solicitud_id, orden_compra, monto, estado, respuesta, creado_en, actualizado_en)
     VALUES ($1, $2, $3, 'autorizado', $4, $5, $5) RETURNING id`,
    [t.id, `DEMO${t.id.slice(0, 8).toUpperCase()}`, t.precio, { demo: true, confirmacion: { authorization_code: autorizacion } }, pagado]);
  const comision = calcularComision(t.precio);
  const estadoLedger = t.estado !== 'cerrada' ? 'retenido' : t.transferida ? 'transferido' : 'liberado';
  const transferidoEn = t.transferida ? despues(t.cerrada, 20) : null;
  const { rows: [mov] } = await db.query(
    `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto,
                                     estado, comprobante, creado_en, liberado_en, transferido_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [t.id, pago.id, t.prestador, t.precio, comision, t.precio - comision, estadoLedger,
      t.transferida ? `TRF-${transferidoEn.toISOString().slice(0, 10).replace(/-/g, '')}-${t.clave}` : null,
      pagado, t.estado === 'cerrada' ? t.cerrada : null, transferidoEn]);
  const lev = (anterior, nuevo, monto, fecha, actor) => db.query(
    `INSERT INTO ledger_eventos (movimiento_id, estado_anterior, estado_nuevo, monto, actor_id, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6)`, [mov.id, anterior, nuevo, monto, actor, fecha]);
  await lev(null, 'retenido', t.precio, pagado, null);
  if (t.estado === 'cerrada') await lev('retenido', 'liberado', t.precio - comision, t.cerrada, t.cliente);
  if (t.transferida) await lev('liberado', 'transferido', t.precio - comision, transferidoEn, t.admin);

  // Conversación por el chat, antes de que termine el trabajo
  const pasos = t.chat.length;
  for (let i = 0; i < pasos; i++) {
    const [quien, texto] = t.chat[i];
    const momento = new Date(pagado.getTime() + ((t.finalizada - pagado) * (i + 1)) / (pasos + 1));
    await db.query(
      'INSERT INTO mensajes (solicitud_id, emisor_id, contenido, creado_en) VALUES ($1, $2, $3, $4)',
      [t.id, quien === 'cliente' ? t.cliente : t.prestador, texto, momento]);
  }

  // Gastos en materiales que registró el prestador (panel contable)
  for (const g of t.gastos) {
    await db.query(
      `INSERT INTO gastos (solicitud_id, prestador_id, monto, origen, descripcion, creado_en)
       VALUES ($1, $2, $3, 'manual', $4, $5)`, [t.id, t.prestador, g.monto, g.descripcion, despues(t.creado, 3)]);
  }

  if (t.resena) {
    await db.query(
      `INSERT INTO resenas (solicitud_id, cliente_id, prestador_id, estrellas, comentario, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [t.id, t.cliente, t.prestador, t.resena.estrellas, t.resena.comentario, despues(t.cerrada, 3)]);
    // Calificación bilateral: en la mayoría de los trabajos cerrados el maestro también
    // calificó al cliente, así la reputación de los clientes demo no parte vacía.
    if (t.estado === 'cerrada' && azar() < 0.8) {
      await db.query(
        `INSERT INTO resenas_prestador (solicitud_id, prestador_id, cliente_id, estrellas, comentario, creado_en)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (solicitud_id) DO NOTHING`,
        [t.id, t.prestador, t.cliente, elegir([5, 5, 4, 5, 3]),
         elegir(['Cliente puntual y claro con lo que necesitaba', 'Buen trato, todo coordinado por la app', 'Estaba en el lugar a la hora acordada', 'Pago sin problemas, recomendado']),
         despues(t.cerrada, 3)]);
    }
  }
  return true;
}

// Cliente que vive en una de las comunas que atiende el prestador (si no hay, cualquiera)
function clienteParaComunas(comunas) {
  const cercanos = CLIENTES.filter((c) => comunas.includes(c.comuna));
  return elegir(cercanos.length ? cercanos : CLIENTES);
}

async function historial(db, ids) {
  let nuevos = 0;
  for (const p of PRESTADORES) {
    const total = p.estrellas.length;
    // Calificaciones en orden aleatorio: las reseñas recientes no son siempre las mismas
    const calificaciones = mezclar(p.estrellas);
    // Días desde el cierre: los recientes (1–2 días) siguen por transferir; el resto, en los últimos 4 meses
    const dias = Array.from({ length: total }, (_, i) => (i < p.recientes ? entre(1, 2) : entre(4, 120)))
      .sort((a, b) => b - a);
    for (let i = 0; i < total; i++) {
      const c = clienteParaComunas(p.comunas);
      // Se arma hacia atrás desde el cierre para que nada quede con fecha futura
      const cerrada = haceDias(dias[i]);
      const finalizada = despues(cerrada, -entre(2, 30));
      const creado = despues(finalizada, -entre(20, 70));
      const estrellas = calificaciones[i];
      const precio = redondear(entre(p.precio[0], p.precio[1]));
      const conGastos = azar() < 0.45;
      const id = idDemo(`trabajo:${p.clave}:${i}`);
      const resena = { estrellas, comentario: elegir(COMENTARIOS[estrellas]) };
      const insertado = await trabajo(db, {
        id, clave: p.clave.toUpperCase(),
        cliente: ids.clientes[c.clave], prestador: ids.prestadores[p.clave], admin: ids.admin,
        categoria: p.categoria, descripcion: elegir(DESCRIPCIONES[p.categoria]),
        comuna: p.comunas.includes(c.comuna) ? c.comuna : p.comunas[0],
        precio, estado: 'cerrada', creado, finalizada, cerrada, transferida: dias[i] >= 4,
        chat: CHAT.slice(0, entre(2, CHAT.length)),
        gastos: conGastos
          ? [{ descripcion: elegir(GASTOS[p.categoria]), monto: redondear(entre(4000, Math.min(45000, precio * 0.3)), 500) }]
          : [],
        resena,
      });
      if (insertado) nuevos++;
      // Si el trabajo ya existía, se actualiza solo su reseña (versiones anteriores de este script)
      else await db.query('UPDATE resenas SET estrellas = $2, comentario = $3 WHERE solicitud_id = $1', [id, resena.estrellas, resena.comentario]);
    }
  }
  return nuevos;
}

// ------------------------------------------------------------------ casos para el panel
async function casosParaElPanel(db, ids) {
  const creados = [];

  // 1) Disputa abierta: la clienta reportó un problema antes del cierre; el dinero sigue retenido
  const insertada = await trabajo(db, {
    id: idDemo('caso:disputa'), clave: 'MARIA', cliente: ids.clientes.valentina, prestador: ids.prestadores.maria,
    admin: ids.admin, categoria: 'electricidad', comuna: 'Chillán', precio: 45000, estado: 'en_disputa',
    descripcion: 'Un enchufe del dormitorio hace chispas al conectar la estufa',
    creado: haceDias(3, 10), finalizada: haceDias(1, 12),
    motivo: 'El enchufe sigue haciendo chispas igual que antes. La técnica dijo que lo había cambiado, pero no volvió.',
    chat: [['prestador', 'Hola Valentina, puedo ir hoy a las 18:00.'], ['cliente', 'Perfecto, la espero.'],
      ['prestador', 'Listo, quedó cambiado el enchufe.']],
    gastos: [{ descripcion: 'Enchufe doble con tierra', monto: 6500 }], resena: null,
  });
  if (insertada) {
    await db.query(
      `INSERT INTO mensajes (solicitud_id, emisor_id, contenido, creado_en)
       VALUES ($1, $2, 'Sigue haciendo chispas, ¿puede volver a revisarlo?', now() - interval '20 hours')`,
      [idDemo('caso:disputa'), ids.clientes.valentina]);
    creados.push('disputa abierta (Valentina Rojas y María Fuentes)');
  }

  // 2) Moderación: un cliente insistió en sacar la conversación de la plataforma
  const idModeracion = idDemo('caso:moderacion');
  const { rows } = await db.query(
    `INSERT INTO solicitudes (id, cliente_id, prestador_id, categoria_id, descripcion_original, comuna, estado,
                              creado_en, actualizado_en, asignada_en)
     SELECT $1, $2, $3, c.id, 'Instalar un enchufe para el refrigerador nuevo', 'San Carlos', 'cancelada',
            now() - interval '2 days', now() - interval '47 hours', now() - interval '2 days' + interval '3 minutes'
       FROM categorias c WHERE c.slug = 'electricidad'
     ON CONFLICT (id) DO NOTHING RETURNING id`, [idModeracion, ids.clientes.jorge, ids.prestadores.pedro]);
  if (rows[0]) {
    const intentos = [
      ['Mejor llámame al 9 8812 3344 y lo coordinamos', 'telefono,contacto_externo'],
      ['o por whatsapp, es más rápido', 'contacto_externo'],
      ['te pago en efectivo y nos ahorramos la comisión', 'pago_externo'],
      ['mi correo es jorge.sepulveda.sc arroba gmail punto com', 'correo'],
    ];
    for (let i = 0; i < intentos.length; i++) {
      await db.query(
        `INSERT INTO mensajes (solicitud_id, emisor_id, contenido, bloqueado, motivo_bloqueo, creado_en)
         VALUES ($1, $2, $3, true, $4, now() - interval '2 days' + make_interval(mins => $5))`,
        [idModeracion, ids.clientes.jorge, intentos[i][0], intentos[i][1], 5 + i * 3]);
    }
    await db.query(
      `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, actor_id, detalle, creado_en)
       VALUES ($1, NULL, 'creada', $2, NULL, now() - interval '2 days'),
              ($1, 'creada', 'asignada', $2, NULL, now() - interval '2 days'),
              ($1, 'asignada', 'cancelada', $2, 'Ya no lo necesito', now() - interval '47 hours')`,
      [idModeracion, ids.clientes.jorge]);
    creados.push('usuario para moderación (Jorge Sepúlveda, 4 mensajes bloqueados)');
  }
  return creados;
}

// La reputación y los trabajos cerrados se recalculan desde los datos reales (HU-07)
async function recalcularReputacion(db) {
  await db.query(`
    UPDATE prestadores p SET
      calificacion_promedio = COALESCE(r.promedio, 0),
      total_resenas = COALESCE(r.total, 0),
      trabajos_cerrados = COALESCE(c.cerrados, 0)
    FROM prestadores x
    LEFT JOIN (SELECT prestador_id, round(avg(estrellas)::numeric, 2) AS promedio, count(*)::int AS total
                 FROM resenas GROUP BY prestador_id) r ON r.prestador_id = x.usuario_id
    LEFT JOIN (SELECT prestador_id, count(*)::int AS cerrados
                 FROM solicitudes WHERE estado = 'cerrada' GROUP BY prestador_id) c ON c.prestador_id = x.usuario_id
    WHERE p.usuario_id = x.usuario_id`);
  // Y la reputación de los clientes, desde las calificaciones que les dejaron los maestros
  await db.query(`
    UPDATE usuarios u SET
      calificacion_promedio = r.promedio,
      total_resenas = COALESCE(r.total, 0)
    FROM usuarios x
    LEFT JOIN (SELECT cliente_id, round(avg(estrellas)::numeric, 2) AS promedio, count(*)::int AS total
                 FROM resenas_prestador GROUP BY cliente_id) r ON r.cliente_id = x.id
    WHERE u.id = x.id`);
}

async function cargar() {
  if (config.esProduccion) throw new Error('Los datos de demostración no se cargan en producción');
  const hash = await bcrypt.hash(CLAVE_DEMO, 10);
  const resumen = await enTransaccion(async (db) => {
    const ids = await cuentas(db, hash);
    const nuevos = await historial(db, ids);
    const casos = await casosParaElPanel(db, ids);
    // Las cuentas de demostración ya aceptaron los términos vigentes (las sesiones de prueba no se interrumpen)
    await db.query(`UPDATE usuarios SET terminos_version = $1, terminos_aceptados_en = creado_en
                     WHERE email LIKE '%demo.cl' AND terminos_version IS DISTINCT FROM $1`, [VERSION_TERMINOS]);
    // Cuentas de demostración creadas por versiones anteriores de este script: también desde hace 5 meses
    await db.query(`UPDATE usuarios SET creado_en = now() - interval '150 days'
                     WHERE email LIKE '%demo.cl' AND creado_en > now() - interval '60 days'`);
    await recalcularReputacion(db);
    const { rows } = await db.query(
      `SELECT u.nombre, p.calificacion_promedio::float AS promedio, p.total_resenas, p.trabajos_cerrados
         FROM prestadores p JOIN usuarios u ON u.id = p.usuario_id
        WHERE u.email LIKE '%demo.cl' ORDER BY p.total_resenas DESC, u.nombre`);
    return { nuevos, casos, reputaciones: rows };
  });

  console.log(`✔ Cuentas: ${CLIENTES.length} clientes, ${PRESTADORES.length} prestadores y 1 administrador (contraseña: ${CLAVE_DEMO})`);
  console.log(`✔ Trabajos cerrados nuevos (con pago, chat y reseña): ${resumen.nuevos}`);
  for (const c of resumen.casos) console.log(`✔ Caso para el panel: ${c}`);
  console.log('  Reputación calculada desde las reseñas:');
  for (const r of resumen.reputaciones) {
    const rep = r.total_resenas ? `${r.promedio.toFixed(1)} ★ (${r.total_resenas} reseñas)` : 'sin reseñas';
    console.log(`    ${r.nombre.padEnd(22)} ${rep} · ${r.trabajos_cerrados} trabajos cerrados`);
  }
}

try {
  await cargar();
} catch (err) {
  console.error(`✘ ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

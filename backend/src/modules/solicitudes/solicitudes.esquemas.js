import { z } from 'zod';
import { esquemaComuna } from '../../utils/comunas.js';
import { esquemaMetadatosFoto } from '../../utils/verificacionFoto.js';

// Fotos del problema que se pueden adjuntar al pedir el servicio (pedido del equipo, noviembre 2026: 3)
export const MAX_FOTOS_AL_SOLICITAR = 3;

const descripcion = z.string().trim()
  .min(8, 'Cuéntanos un poco más de lo que necesitas')
  .max(1000, 'La descripción no puede superar 1000 caracteres');

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Categoría no válida');

export const esquemaInterpretar = z.object({ descripcion });

// Detección del problema por foto: las mismas fotos que se adjuntan al pedir (1 a 3, en base64)
export const esquemaAnalizarFotos = z.object({
  fotos: z.array(z.string().min(100, 'La foto no es válida'))
    .min(1, 'Sube al menos una foto del problema')
    .max(MAX_FOTOS_AL_SOLICITAR, `Puedes analizar hasta ${MAX_FOTOS_AL_SOLICITAR} fotos`),
});

// Monto mínimo de un trabajo con precio cerrado (lo que el maestro cobra al aceptar).
// Valores fijos de la ayudantía (noviembre 2026): subió de $1.000 a $5.000.
export const PRECIO_MINIMO_CERRADO = 5000;
// Tarifa mínima de la visita de diagnóstico (decisión del equipo, noviembre 2026)
export const TARIFA_VISITA_MINIMA = 5000;

export const esquemaCrear = z.object({
  // UUID generado en el celular: permite reenviar sin duplicar (HU-12)
  id: z.uuid('El identificador de la solicitud no es válido'),
  descripcion,
  // Si el cliente corrigió lo que entendió el sistema, manda las categorías elegidas
  // Una solicitud es un solo servicio: así un clic de más en la app no crea solicitudes de más
  categorias: z.array(slug).min(1).max(1, 'Pide un servicio por solicitud. Si necesitas otro, pídelo aparte.')
    .transform((cs) => [...new Set(cs)]).optional(),
  comuna: esquemaComuna.optional(),
  // Dónde es el trabajo: el maestro la ve recién cuando el pago está asegurado
  direccion: z.string({ error: 'Indica la dirección exacta' }).trim()
    .min(5, 'Indica la dirección exacta (calle y número, o sector y parcela)').max(200, 'Máximo 200 caracteres'),
  referencia: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  // Ubicación GPS opcional ("Usar mi ubicación"): debe caer en la zona de Chillán y Coihueco
  latitud: z.number().min(-37.1, 'La ubicación está fuera de Chillán y Coihueco').max(-36.2, 'La ubicación está fuera de Chillán y Coihueco').optional(),
  longitud: z.number().min(-72.6, 'La ubicación está fuera de Chillán y Coihueco').max(-71.2, 'La ubicación está fuera de Chillán y Coihueco').optional(),
  creado_en_dispositivo: z.iso.datetime({ offset: true }).optional(),
  // Fotos con varios problemas: la IA los separa en una solicitud por trabajo. Las que siguen a la
  // primera indican de cuál se separaron, y el límite diario las cuenta como un mismo pedido.
  separada_de: z.uuid('La solicitud de origen no es válida').optional(),
  // Fotos del problema al momento de pedir (máx. 3): quedan como evidencias de la solicitud
  // para que el maestro cotice con más exactitud. Cada una es la imagen en base64 o, desde la app
  // actual, { imagen_base64, metadatos } con la fecha y el equipo leídos de la foto original.
  fotos: z.array(z.union([
    z.string().min(1, 'La foto está vacía'),
    z.object({ imagen_base64: z.string().min(1, 'La foto está vacía'), metadatos: esquemaMetadatosFoto }),
  ])).max(MAX_FOTOS_AL_SOLICITAR, `Puedes adjuntar hasta ${MAX_FOTOS_AL_SOLICITAR} fotos al solicitar`).optional(),
});

export const esquemaAsignar = z.object({
  prestador_id: z.uuid('Prestador no válido'),
});

const pesosEnteros = (mensaje) => z.number({ error: mensaje }).int('Debe ser un número entero de pesos');

export const esquemaResponder = z.object({
  aceptar: z.boolean({ error: 'Indica si aceptas o rechazas el trabajo' }),
  // precio_cerrado: el cliente paga el total al contratar · visita: paga la visita y luego el saldo cotizado
  modalidad: z.enum(['precio_cerrado', 'visita'], { error: 'Modalidad no válida' }).default('precio_cerrado'),
  // Precio en pesos chilenos (enteros) que el prestador propone al aceptar con precio cerrado
  precio: pesosEnteros('Indica el precio').min(PRECIO_MINIMO_CERRADO, 'El precio mínimo es $5.000').max(10_000_000, 'El precio es demasiado alto').optional(),
  // Visita de diagnóstico: tarifa (mínimo $5.000; el rango de la comuna se valida en el servicio)
  tarifa_visita: pesosEnteros('Indica la tarifa de visita').min(TARIFA_VISITA_MINIMA, 'La visita mínima es $5.000').max(200_000).optional(),
  // Día y hora en que el maestro irá: la visita de diagnóstico o, con precio cerrado, el trabajo
  visita_programada_en: z.iso.datetime({ offset: true, error: 'Indica la fecha y hora de la visita' }).optional(),
}).superRefine((r, ctx) => {
  if (!r.aceptar) return;
  if (r.modalidad === 'precio_cerrado' && r.precio === undefined) {
    ctx.addIssue({ code: 'custom', path: ['precio'], message: 'Indica el precio del trabajo para aceptarlo' });
  }
  if (r.modalidad === 'visita' && r.tarifa_visita === undefined) {
    ctx.addIssue({ code: 'custom', path: ['tarifa_visita'], message: 'Indica la tarifa de la visita' });
  }
  // Con visita es obligatorio; con precio cerrado la app lo pide siempre (el servidor lo valida si viene,
  // y lo acepta sin él para no dejar sin responder a quien aún tenga una versión anterior de la app)
  if (r.modalidad === 'visita' && !r.visita_programada_en) {
    ctx.addIssue({ code: 'custom', path: ['visita_programada_en'], message: 'Indica qué día y a qué hora irás' });
  }
});

// Misma caja que al crear la solicitud: Chillán y Coihueco, con margen rural
const latitudZona = z.number().min(-37.1, 'La ubicación está fuera de Chillán y Coihueco').max(-36.2, 'La ubicación está fuera de Chillán y Coihueco');
const longitudZona = z.number().min(-72.6, 'La ubicación está fuera de Chillán y Coihueco').max(-71.2, 'La ubicación está fuera de Chillán y Coihueco');

// El prestador llegó: el código de 4 dígitos y, si el cliente marcó el lugar, su propia ubicación
export const esquemaLlegada = z.object({
  codigo: z.string({ error: 'Ingresa el código' }).trim().regex(/^[0-9]{4}$/, 'El código tiene 4 dígitos'),
  latitud: latitudZona.optional(),
  longitud: longitudZona.optional(),
}).superRefine((r, ctx) => {
  if ((r.latitud == null) !== (r.longitud == null)) {
    ctx.addIssue({ code: 'custom', path: ['latitud'], message: 'Indica la latitud y la longitud' });
  }
});

// Cotización después del diagnóstico (el total = mano de obra + materiales, e incluye la visita)
export const esquemaCotizacion = z.object({
  mano_obra: pesosEnteros('Indica el valor de la mano de obra').min(0).max(20_000_000, 'El monto es demasiado alto'),
  materiales: pesosEnteros('Indica el valor de los materiales').min(0).max(20_000_000, 'El monto es demasiado alto').default(0),
  detalle: z.string({ error: 'Describe el trabajo' }).trim()
    .min(10, 'Describe qué incluye el trabajo (al menos 10 caracteres)').max(1000, 'Máximo 1000 caracteres'),
});

export const esquemaRespuestaCotizacion = z.object({
  aceptar: z.boolean({ error: 'Indica si aceptas o rechazas la cotización' }),
  // La cotización que el cliente tiene en pantalla: si el maestro la corrigió entretanto, se le avisa
  cotizacion_id: z.uuid('Cotización no válida').optional(),
});

export const esquemaCancelar = z.object({
  motivo: z.string().trim().max(300).optional(),
});

export const esquemaListado = z.object({
  estado: z.enum([
    'creada', 'asignada', 'visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'cotizada',
    'confirmada', 'pagada', 'finalizada', 'cerrada', 'cancelada', 'en_disputa',
  ]).optional(),
});

export const esquemaReportar = z.object({
  motivo: z.string().trim().min(10, 'Cuéntanos qué pasó (al menos 10 caracteres)').max(500),
});

// HU-06: calificación de 1 a 5 estrellas con comentario opcional
export const esquemaResena = z.object({
  estrellas: z.number().int('La calificación debe ser un número entero').min(1, 'Mínimo 1 estrella').max(5, 'Máximo 5 estrellas'),
  comentario: z.string().trim().max(500, 'El comentario no puede superar 500 caracteres').optional(),
});

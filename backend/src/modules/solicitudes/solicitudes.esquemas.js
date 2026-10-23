import { z } from 'zod';
import { esquemaComuna } from '../../utils/comunas.js';

const descripcion = z.string().trim()
  .min(8, 'Cuéntanos un poco más de lo que necesitas')
  .max(1000, 'La descripción no puede superar 1000 caracteres');

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Categoría no válida');

export const esquemaInterpretar = z.object({ descripcion });

export const esquemaCrear = z.object({
  // UUID generado en el celular: permite reenviar sin duplicar (HU-12)
  id: z.uuid('El identificador de la solicitud no es válido'),
  descripcion,
  // Si el cliente corrigió lo que entendió el sistema, manda las categorías elegidas
  categorias: z.array(slug).min(1).max(5).transform((cs) => [...new Set(cs)]).optional(),
  comuna: esquemaComuna.optional(),
  // Dónde es el trabajo: el maestro la ve recién cuando el pago está asegurado
  direccion: z.string({ error: 'Indica la dirección exacta' }).trim()
    .min(5, 'Indica la dirección exacta (calle y número, o sector y parcela)').max(200, 'Máximo 200 caracteres'),
  referencia: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  // Ubicación GPS opcional ("Usar mi ubicación"): debe caer en la zona de Chillán y Coihueco
  latitud: z.number().min(-37.1, 'La ubicación está fuera de Chillán y Coihueco').max(-36.2, 'La ubicación está fuera de Chillán y Coihueco').optional(),
  longitud: z.number().min(-72.6, 'La ubicación está fuera de Chillán y Coihueco').max(-71.2, 'La ubicación está fuera de Chillán y Coihueco').optional(),
  creado_en_dispositivo: z.iso.datetime({ offset: true }).optional(),
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
  precio: pesosEnteros('Indica el precio').min(1000, 'El precio mínimo es $1.000').max(10_000_000, 'El precio es demasiado alto').optional(),
  // Visita de diagnóstico: tarifa (el rango de la comuna se valida en el servicio) y fecha y hora
  tarifa_visita: pesosEnteros('Indica la tarifa de visita').min(1000).max(200_000).optional(),
  visita_programada_en: z.iso.datetime({ offset: true, error: 'Indica la fecha y hora de la visita' }).optional(),
}).superRefine((r, ctx) => {
  if (!r.aceptar) return;
  if (r.modalidad === 'precio_cerrado' && r.precio === undefined) {
    ctx.addIssue({ code: 'custom', path: ['precio'], message: 'Indica el precio del trabajo para aceptarlo' });
  }
  if (r.modalidad === 'visita' && r.tarifa_visita === undefined) {
    ctx.addIssue({ code: 'custom', path: ['tarifa_visita'], message: 'Indica la tarifa de la visita' });
  }
  if (r.modalidad === 'visita' && !r.visita_programada_en) {
    ctx.addIssue({ code: 'custom', path: ['visita_programada_en'], message: 'Indica cuándo harás la visita' });
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

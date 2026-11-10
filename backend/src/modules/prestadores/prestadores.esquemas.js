import { z } from 'zod';
import { esquemaHorario } from './horario.js';
import { esquemaComuna } from '../../utils/comunas.js';
import { normalizarRut, rutValido } from '../../utils/rut.js';

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Categoría no válida');

// HU-01: filtros del catálogo
export const esquemaCatalogo = z.object({
  categoria: slug.optional(),
  comuna: esquemaComuna.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(50).default(20),
  // Orden que elige el cliente; por defecto, reputación (CU-05)
  orden: z.enum(['reputacion', 'trabajos', 'resenas']).default('reputacion'),
  // Solo maestros atendiendo ahora según su horario (CU-05: «verificados y en horario»)
  disponible_ahora: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

// Ficha que edita el propio prestador
export const esquemaFicha = z.object({
  descripcion: z.string().trim().max(600, 'La descripción no puede superar 600 caracteres').optional(),
  comunas_atendidas: z.array(esquemaComuna)
    .min(1, 'Indica al menos una comuna')
    .max(21)
    .transform((cs) => [...new Set(cs)])
    .optional(),
  categorias: z.array(slug)
    .min(1, 'Indica al menos una categoría')
    .max(10)
    .transform((cs) => [...new Set(cs)])
    .optional(),
  disponible: z.boolean().optional(),
  horario: esquemaHorario.optional(),
}).refine((f) => Object.keys(f).length > 0, 'No hay cambios que guardar');

// HU-13: datos para que el equipo transfiera al prestador los pagos liberados
export const TIPOS_CUENTA = ['Cuenta Corriente', 'Cuenta Vista', 'Cuenta de Ahorro', 'CuentaRUT'];

export const esquemaDatosPago = z.object({
  rut: z.string().trim()
    .refine(rutValido, 'El RUT no es válido (revisa el dígito verificador)')
    .transform(normalizarRut),
  banco: z.string().trim().min(3, 'Indica el banco').max(60, 'Nombre de banco demasiado largo'),
  tipo_cuenta: z.enum(TIPOS_CUENTA, { error: 'Elige un tipo de cuenta válido' }),
  numero_cuenta: z.string().trim()
    .transform((n) => n.replace(/[\s.-]/g, ''))
    .pipe(z.string().regex(/^\d{4,20}$/, 'El número de cuenta debe tener solo dígitos (4 a 20)')),
});

import { z } from 'zod';
import { normalizarRut, rutValido } from '../../utils/rut.js';

export const esquemaSolicitud = z.object({
  categoria: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Categoría no válida'),
  numero_registro: z.string().trim()
    .min(3, 'Ingresa el número de registro o licencia')
    .max(40, 'El número de registro es demasiado largo'),
  // HU-17: código bajo el QR del certificado SEC (obligatorio para electricidad; se valida en el servicio)
  codigo_certificado: z.string().trim()
    .min(4, 'El código del certificado es muy corto')
    .max(60, 'El código del certificado es demasiado largo')
    .optional(),
  // Datos para consultar el registro de la SEC. Son opcionales para no romper las APK antiguas:
  // sin ellos la solicitud va a revisión manual.
  rut: z.string().trim()
    .refine(rutValido, 'El RUT no es válido (revisa el dígito verificador)')
    .transform(normalizarRut)
    .optional(),
  apellido_paterno: z.string().trim().min(2, 'Ingresa tu apellido paterno').max(60, 'El apellido es demasiado largo').optional(),
  apellido_materno: z.string().trim().min(2, 'Ingresa tu apellido materno').max(60, 'El apellido es demasiado largo').optional(),
});

export const esquemaFiltroAdmin = z.object({
  estado: z.enum(['pendiente', 'aprobada', 'rechazada']).default('pendiente'),
});

export const esquemaResolucion = z.object({
  decision: z.enum(['aprobada', 'rechazada'], { error: 'La decisión debe ser aprobada o rechazada' }),
  // Solo http/https: un enlace javascript: se ejecutaría al abrirlo en el panel (OWASP A03)
  fuente_url: z.url({ protocol: /^https?$/, error: 'La fuente debe ser una dirección web (http o https)' }).max(500).optional(),
  observacion: z.string().trim().min(5, 'La observación es muy corta').max(500).optional(),
  vence_en: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
    .refine((f) => !Number.isNaN(Date.parse(f)), 'Fecha no válida').optional(),
}).refine((r) => r.decision !== 'rechazada' || r.observacion, {
  path: ['observacion'],
  message: 'Indica al prestador el motivo del rechazo',
});

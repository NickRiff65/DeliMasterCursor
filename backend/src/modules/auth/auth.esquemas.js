import { z } from 'zod';
import { esquemaHorario } from '../prestadores/horario.js';
import { esquemaComuna } from '../../utils/comunas.js';

// Contraseña: mínimo 8 caracteres con al menos una letra y un número.
// Máximo 72 porque Bcrypt ignora lo que sigue a los 72 bytes.
export const esquemaPassword = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar los 72 caracteres')
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, 'La contraseña debe incluir al menos una letra')
  .regex(/\d/, 'La contraseña debe incluir al menos un número');

const email = z.string().trim().toLowerCase()
  .pipe(z.email('El correo no es válido').max(254));

// Teléfono chileno: se aceptan formatos como +56912345678, 912345678 o "9 1234 5678".
const telefono = z.string().trim()
  .transform((t) => t.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+?56)?9\d{8}$/, 'El teléfono debe ser un celular chileno válido'));

// Nombre y apellido van por separado: así la persona siempre indica su apellido
const nombre = z.string({ error: 'Ingresa tu nombre' }).trim().min(2, 'El nombre es muy corto').max(60)
  .transform((t) => t.replace(/\s+/g, ' '));
const apellido = z.string({ error: 'Ingresa tu apellido' }).trim().min(2, 'Ingresa tu apellido').max(60)
  .transform((t) => t.replace(/\s+/g, ' '));

export const esquemaRegistro = z.object({
  // El rol admin nunca se puede crear desde el registro público.
  rol: z.enum(['cliente', 'prestador'], { error: 'El rol debe ser cliente o prestador' }),
  nombre,
  apellido,
  email,
  password: esquemaPassword,
  telefono: telefono.optional(),
  comuna: esquemaComuna.optional(),
  // Maestros: días y horario en que trabajan (se puede cambiar después en la ficha)
  horario: esquemaHorario.optional(),
  // Ley N.º 21.719: el registro exige aceptar expresamente los términos y la política de privacidad
  acepta_terminos: z.literal(true, { error: 'Debes aceptar los Términos de uso y la Política de privacidad' }),
});

export const esquemaLogin = z.object({
  email,
  password: z.string().min(1, 'Ingresa tu contraseña').max(72),
});

// Datos que cada persona puede editar de su cuenta (el correo no se cambia aquí)
export const esquemaPerfil = z.object({
  nombre: nombre.optional(),
  apellido: apellido.optional(),
  // Vacío = quitar el celular
  telefono: z.union([telefono, z.literal('').transform(() => null), z.null()]).optional(),
  comuna: esquemaComuna.optional(),
}).refine((d) => Object.keys(d).length > 0, 'No hay cambios que guardar');

export const esquemaCambioPassword = z.object({
  actual: z.string().min(1, 'Ingresa tu contraseña actual').max(72),
  nueva: esquemaPassword,
}).refine((d) => d.actual !== d.nueva, { path: ['nueva'], message: 'La nueva contraseña debe ser distinta de la actual' });

export const esquemaRecuperar = z.object({ email });

export const esquemaRestablecer = z.object({
  email,
  codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
  nueva: esquemaPassword,
});

export const esquemaTerminos = z.object({ version: z.string().trim().min(1).max(20) });

// Eliminar la cuenta: se confirma con la contraseña
export const esquemaEliminarCuenta = z.object({
  password: z.string({ error: 'Ingresa tu contraseña' }).min(1, 'Ingresa tu contraseña').max(72),
});

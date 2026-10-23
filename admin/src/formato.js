export const pesos = (n) => `$${Number(n ?? 0).toLocaleString('es-CL')}`;
export const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
// Fecha AAAA-MM-DD (sin hora) mostrada como "8 ene 2027"
export const fechaDia = (dia) => (dia ? new Date(`${dia}T00:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const diasHasta = (dia) => {
  if (!dia) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${dia}T00:00:00`) - hoy) / 86_400_000);
};
export const enDias = (n) => { const f = new Date(); f.setDate(f.getDate() + n); return f.toLocaleDateString('sv-SE'); };
export const nombreMes = (aaaaMm) => new Date(`${aaaaMm}-01T00:00:00`).toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');

export const MOTIVOS = {
  telefono: 'Teléfono',
  correo: 'Correo',
  datos_bancarios: 'Datos bancarios',
  contacto_externo: 'Contacto por fuera',
  pago_externo: 'Pago por fuera',
  enlace: 'Enlace',
};

export const ESTADOS = {
  creada: 'Creada', asignada: 'Asignada',
  visita_por_pagar: 'Visita por pagar', visita_pagada: 'Visita agendada', en_diagnostico: 'En diagnóstico', cotizada: 'Cotizada',
  confirmada: 'Confirmada', pagada: 'Pagada',
  finalizada: 'Terminada', cerrada: 'Cerrada', cancelada: 'Cancelada', en_disputa: 'En disputa',
};

export const ESTADOS_PAGO = {
  retenido: 'Retenido', liberado: 'Liberado', transferido: 'Transferido', reembolsado: 'Reembolsado',
};

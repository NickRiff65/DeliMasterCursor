// RUT chileno: cuerpo numérico + dígito verificador (módulo 11).

// Deja el RUT como "12345678-K": sin puntos, con guion y la K en mayúscula
export function normalizarRut(texto) {
  const limpio = String(texto ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return null;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

export function digitoVerificador(cuerpo) {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}

export function rutValido(texto) {
  const rut = normalizarRut(texto);
  if (!rut) return false;
  const [cuerpo, dv] = rut.split('-');
  return /^\d{7,8}$/.test(cuerpo) && digitoVerificador(cuerpo) === dv;
}

// "12345678-5" -> "12.345.678-5"
export function formatearRut(texto) {
  const rut = normalizarRut(texto);
  if (!rut) return '';
  const [cuerpo, dv] = rut.split('-');
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

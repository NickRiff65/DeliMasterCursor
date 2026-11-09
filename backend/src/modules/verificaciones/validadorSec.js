// Consulta del registro de instaladores de la SEC. Se aísla en este módulo, igual que la pasarela de pago,
// para que el resto del sistema no dependa de cómo responde el sitio y las pruebas puedan reemplazarlo.
//
// La SEC no ofrece una API: publica un validador web (https://wlhttp.sec.cl/validadorInstaladores/) que
// busca por tipo de servicio, RUT y apellidos. La lectura real todavía no está hecha, porque hace falta
// una consulta real para conocer su respuesta y revisar las normas de uso del sitio. Mientras tanto
// responde 'no_disponible' y cada solicitud pasa a la revisión manual del panel, igual que antes.
//
// consultar({ servicio: 'ELECTRICO' | 'GAS', rut, apellidoPaterno, apellidoMaterno }) devuelve
//   { resultado: 'vigente' | 'no_vigente' | 'no_encontrado' | 'no_disponible', nombre }
const sinConexion = {
  async consultar() {
    return { resultado: 'no_disponible' };
  },
};

let validadorActual = sinConexion;

export const consultarRegistroSec = (datos) => validadorActual.consultar(datos);

// Solo para pruebas automáticas
export function usarValidadorSec(otro) {
  validadorActual = otro ?? sinConexion;
}

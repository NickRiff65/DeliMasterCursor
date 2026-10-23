// Pasarela de pago Transbank: Webpay Plus (el cliente ingresa su tarjeta en cada pago) y Oneclick Mall
// (el cliente guarda su tarjeta una vez y los pagos siguientes se cobran sin volver a ingresarla).
// Se aísla en este módulo para que el resto del sistema no dependa del SDK y para que las pruebas
// automáticas puedan reemplazarla (nadie puede "pagar con tarjeta" dentro de una prueba).
import tbk from 'transbank-sdk';

const { WebpayPlus, Oneclick, TransactionDetail, IntegrationCommerceCodes, IntegrationApiKeys } = tbk;
const produccion = () => process.env.WEBPAY_AMBIENTE === 'produccion';

function crearTransaccion() {
  if (produccion()) {
    // En producción se usan las credenciales que Transbank entrega al comercio (variables de entorno)
    return WebpayPlus.Transaction.buildForProduction(process.env.WEBPAY_CODIGO_COMERCIO, process.env.WEBPAY_API_KEY);
  }
  // Ambiente de integración: credenciales públicas de prueba incluidas en el SDK oficial
  return WebpayPlus.Transaction.buildForIntegration(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY);
}

// Oneclick Mall: un comercio "mall" y una tienda hija (DeliMaster) que es la que cobra
const ONECLICK = () => (produccion()
  ? { mall: process.env.ONECLICK_CODIGO_COMERCIO, tienda: process.env.ONECLICK_CODIGO_TIENDA, apiKey: process.env.ONECLICK_API_KEY }
  : { mall: IntegrationCommerceCodes.ONECLICK_MALL, tienda: IntegrationCommerceCodes.ONECLICK_MALL_CHILD1, apiKey: IntegrationApiKeys.WEBPAY });

function oneclick(Clase) {
  const { mall, apiKey } = ONECLICK();
  return produccion() ? Clase.buildForProduction(mall, apiKey) : Clase.buildForIntegration(mall, apiKey);
}

// "XXXXXXXXXXXX6623" → "6623"
const ultimos4 = (numero) => String(numero ?? '').replace(/\D/g, '').slice(-4);

const transbank = {
  nombre: 'transbank',

  // ---------------------------------------------------------------- Webpay Plus
  // Crea la transacción: devuelve { token, url } para redirigir al cliente al formulario de pago
  async crear({ ordenCompra, sesion, monto, urlRetorno }) {
    return crearTransaccion().create(ordenCompra, sesion, monto, urlRetorno);
  },
  // Confirma la transacción al volver de Webpay (sin esto el pago no se concreta)
  async confirmar(token) {
    return crearTransaccion().commit(token);
  },
  // Devolución (total o parcial) de un pago hecho con Webpay Plus
  async reembolsar(token, monto) {
    return crearTransaccion().refund(token, monto);
  },

  // ---------------------------------------------------------------- Oneclick (tarjeta guardada)
  // El cliente registra su tarjeta en la página de Transbank: devuelve { token, url }
  async iniciarInscripcion({ usuario, email, urlRetorno }) {
    const r = await oneclick(Oneclick.MallInscription).start(usuario, email, urlRetorno);
    return { token: r.token, url: r.url_webpay };
  },
  // Al volver: { aprobada, tbkUser, tipo, ultimos4, respuesta }
  async finalizarInscripcion(token) {
    const r = await oneclick(Oneclick.MallInscription).finish(token);
    return {
      aprobada: r.response_code === 0 && Boolean(r.tbk_user),
      tbkUser: r.tbk_user, tipo: r.card_type ?? null, ultimos4: ultimos4(r.card_number), respuesta: r,
    };
  },
  async eliminarInscripcion({ tbkUser, usuario }) {
    return oneclick(Oneclick.MallInscription).delete(tbkUser, usuario);
  },
  // Cobra con la tarjeta guardada, sin que el cliente vuelva a ingresarla.
  // Devuelve { autorizado, codigo, respuesta } (autorizado solo si coincide el monto y la orden)
  async cobrarTarjeta({ usuario, tbkUser, ordenCompra, ordenHija, monto }) {
    const detalle = new TransactionDetail(monto, ONECLICK().tienda, ordenHija, 1);
    const r = await oneclick(Oneclick.MallTransaction).authorize(usuario, tbkUser, ordenCompra, [detalle]);
    const d = r.details?.[0] ?? {};
    return {
      autorizado: d.response_code === 0 && d.status === 'AUTHORIZED' && Number(d.amount) === monto && d.buy_order === ordenHija,
      codigo: d.authorization_code ?? null,
      respuesta: r,
    };
  },
  // Devolución (total o parcial) de un pago hecho con la tarjeta guardada
  async reembolsarTarjeta({ ordenCompra, ordenHija, monto }) {
    return oneclick(Oneclick.MallTransaction).refund(ordenCompra, ONECLICK().tienda, ordenHija, monto);
  },
};

let pasarelaActual = transbank;
const usar = (metodo) => (...a) => pasarelaActual[metodo](...a);

export const pasarela = Object.fromEntries([
  'crear', 'confirmar', 'reembolsar',
  'iniciarInscripcion', 'finalizarInscripcion', 'eliminarInscripcion', 'cobrarTarjeta', 'reembolsarTarjeta',
].map((m) => [m, usar(m)]));

// Devuelve dinero de un pago, según cómo se pagó
export function reembolsarPago(pago, monto) {
  return pago.medio === 'oneclick'
    ? pasarela.reembolsarTarjeta({ ordenCompra: pago.orden_compra, ordenHija: pago.orden_hija, monto })
    : pasarela.reembolsar(pago.token_webpay, monto);
}

// Solo para pruebas automáticas
export function usarPasarela(otra) {
  pasarelaActual = otra ?? transbank;
}

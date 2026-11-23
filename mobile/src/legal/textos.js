// Términos de uso y Política de privacidad de DeliMaster.
// VERSION_TERMINOS debe coincidir con la del backend (auth.servicio.js): si se publica una versión
// nueva, la app vuelve a pedir la aceptación a cada persona.
export const VERSION_TERMINOS = '2.0';   // 1.7: datos de cámara de las fotos; 1.8: plazo de 1 día, cotización aparte de la visita, groserías y chat del reclamo; 1.9: código de llegada y devolución si no llega, también con precio cerrado; 2.0: detección del problema por foto con IA
export const FECHA_TERMINOS = 'noviembre de 2026';

// Cada app muestra su versión: un párrafo puede ser un texto (para ambas apps) o
// { cliente, prestador } con la versión de cada una (si falta una, esa app no lo muestra).
// Las obligaciones son las mismas para todos; solo cambia lo que le corresponde leer a cada uno.
export function paraApp(secciones, rol) {
  return secciones
    .map(([titulo, parrafos]) => [titulo, parrafos.map((p) => (typeof p === 'string' ? p : p[rol])).filter(Boolean)])
    .filter(([, parrafos]) => parrafos.length);
}

// Lo más importante, en la pantalla que pide aceptar una versión nueva
export const RESUMEN_TERMINOS = {
  cliente: [
    'Tu pago queda retenido hasta que el trabajo se cierra.',
    'Si el maestro cobra visita, se paga aparte de la cotización del trabajo y te la devolvemos si no llega.',
    'Antes del pago, el chat no deja compartir teléfonos, correos ni pagos por fuera.',
    'Solo se califican trabajos cerrados en DeliMaster.',
    'Tu teléfono y tus datos bancarios nunca se muestran a la otra parte.',
    'Si pides que la IA detecte el problema con tus fotos, se envían solo las imágenes (sin tus datos) a un proveedor de inteligencia artificial.',
  ],
  prestador: [
    'Tienes 1 día para aceptar o rechazar cada solicitud; si no respondes, el cliente puede elegir a otro maestro.',
    'El pago del cliente queda retenido en DeliMaster y se te transfiere al cierre, descontada la comisión (12%, con un máximo de $25.000 por trabajo).',
    'Al llegar al lugar, confirmas tu llegada con el código de 4 dígitos que te dicta el cliente.',
    'Antes del pago, el chat no deja compartir teléfonos, correos ni pagos por fuera.',
    'Los oficios regulados (SEC, SAG y CONAF) se muestran en el catálogo solo con tu verificación vigente.',
    'Tu teléfono y tus datos bancarios nunca se muestran a los clientes.',
  ],
};

export const TERMINOS = [
  ['Qué es DeliMaster', [
    'DeliMaster conecta a clientes con prestadores independientes de oficios y trabajos de campo en Chillán y Coihueco. Intermedia la contratación, el pago y la comunicación, pero no ejecuta los trabajos: cada prestador es responsable del servicio que presta.',
  ]],
  ['Tu cuenta', [
    'Para usar DeliMaster debes ser mayor de 18 años y entregar datos verdaderos. Cada persona tiene una sola cuenta y es responsable de cuidar su contraseña, que puede cambiar o recuperar desde la aplicación.',
  ]],
  ['Cómo se contrata', [
    'El cliente describe lo que necesita y elige a un prestador del catálogo. El prestador tiene 1 día (24 horas) para aceptar o rechazar; si no responde, el cliente puede elegir a otro. Al aceptar elige cómo cobrar: con precio cerrado, cuando ya sabe cuánto cuesta el trabajo (el cliente paga ese precio, el prestador indica el día en que irá y, al llegar, ingresa el código de 4 dígitos que recibe el cliente al pagar; sin ese código no puede dar el trabajo por terminado), o con una visita de diagnóstico y una cotización en la aplicación.',
    {
      cliente: 'Si adjuntas fotos, puedes pedir que una inteligencia artificial detecte el problema y proponga el servicio y la descripción. Es solo una sugerencia: la revisas y la corriges antes de publicar, y DeliMaster no garantiza que sea exacta.',
      prestador: 'La descripción de una solicitud puede haberla propuesto una inteligencia artificial a partir de las fotos del cliente, que la revisa antes de publicarla. DeliMaster no garantiza que sea exacta: revisa siempre las fotos y, si falta información, pregúntale al cliente por el chat antes de aceptar o cotizar.',
    },
  ]],
  ['Visita de diagnóstico y cotización', [
    'El prestador fija la tarifa de la visita dentro del rango que DeliMaster define para cada comuna (desde $5.000), e indica el día y la hora. El cliente paga la visita en la aplicación y recibe un código de 4 dígitos.',
    'Al llegar, el prestador ingresa ese código: así se confirma la visita y su pago pasa al prestador. Si el cliente compartió la ubicación del trabajo, el prestador también debe estar a menos de 1.500 metros de ese punto. El cliente no debe entregar el código antes de que el prestador llegue.',
    'Después del diagnóstico, el prestador envía la cotización por la aplicación, con el detalle del trabajo; mientras el cliente no responda, puede corregirla y el cliente ve el monto anterior. Si el cliente la acepta, paga el valor completo de la cotización, que queda protegido igual que cualquier pago. La visita es un cobro aparte: no se descuenta de la cotización y, al cierre, el prestador recibe ambas, descontada la comisión. Si la rechaza, la solicitud termina y la visita queda para el prestador por el diagnóstico realizado.',
    'El trabajo cotizado se paga en la aplicación. Si el cliente y el prestador lo acuerdan por fuera, pierden la garantía de pago, la revisión de reclamos y la reseña.',
  ]],
  ['Pago protegido', [
    'El cliente paga con Webpay (Transbank). DeliMaster nunca ve ni guarda el número de la tarjeta.',
    'El dinero queda retenido por DeliMaster: la visita, hasta que el prestador confirma su llegada; el pago del trabajo, hasta el cierre, cuando el cliente confirma que quedó bien o, si no responde, 72 horas después de que el prestador lo marca como terminado. Luego se transfiere al prestador dentro de 48 horas hábiles, descontada la comisión.',
  ]],
  ['Cancelaciones y devoluciones', [
    'Antes de pagar, el cliente puede cancelar sin costo.',
    'Con la visita pagada, si el cliente cancela con al menos 2 horas de anticipación se le devuelve la visita; con menos anticipación, la visita queda para el prestador.',
    'Si el prestador no llega, desde 30 minutos después de la hora acordada el cliente puede pedir en la aplicación que se le devuelva la visita; si no lo pide, se devuelve automáticamente a las 24 horas.',
    'Con precio cerrado, si el prestador no confirma su llegada con el código, desde 30 minutos después de la hora acordada el cliente puede pedir en la aplicación que se le devuelva el pago completo; el trabajo se cancela.',
    'Las devoluciones se hacen por Webpay a la misma tarjeta; el banco puede tardar algunos días en reflejarlas.',
  ]],
  ['Comisión', [
    'DeliMaster cobra una comisión de 12% sobre cada pago del trabajo (la visita y la cotización, o el precio cerrado), con un máximo de $25.000 por trabajo, que se descuenta del monto que recibe el prestador. Registrarse y usar la aplicación no tiene costo. Si la comisión cambia, se avisará con anticipación.',
  ]],
  ['Reclamos y disputas', [
    'Antes del cierre, el cliente puede reportar un problema. El dinero sigue retenido y el equipo revisa la evidencia (chat, fotos, cotización e historial) para decidir si libera el pago del trabajo al prestador, lo reembolsa al cliente o le devuelve solo una parte (por ejemplo, gastos en materiales que el prestador no justificó con su boleta), a través de Webpay. La visita no se reembolsa en una disputa sobre el trabajo, porque corresponde al diagnóstico ya realizado. Mientras revisa, el equipo puede conversar por la aplicación con el cliente y con el prestador, por separado, para pedirles más antecedentes. La decisión y su fundamento quedan registrados.',
  ]],
  ['Chat y filtro de seguridad', [
    'Hasta que el pago está protegido, el chat bloquea teléfonos, correos, datos bancarios, enlaces y propuestas de pagar por fuera de la plataforma. Después del pago se pueden compartir teléfonos para coordinar la visita, pero se siguen bloqueando las propuestas de pago por fuera y los datos bancarios. En todo momento se bloquean las groserías y los insultos.',
    'Los mensajes bloqueados no llegan a la otra persona y quedan registrados. El equipo puede revisarlos para resolver disputas o moderar la plataforma.',
  ]],
  ['Reseñas y orden del catálogo', [
    'Solo el cliente de un trabajo cerrado en DeliMaster puede calificarlo, una vez. El catálogo ordena a los prestadores con un promedio ponderado que considera sus calificaciones y cuántas tiene; quien recién comienza parte con una puntuación inicial para tener visibilidad. DeliMaster no vende posiciones en el catálogo.',
  ]],
  ['Verificación de oficios regulados', [
    'Los oficios que exigen habilitación legal solo se muestran con un registro vigente revisado por el equipo: electricidad e instalaciones de gas (SEC), aplicación de agroquímicos (SAG) y tala (CONAF, plan de manejo o permiso de corta). El certificado de la SEC dura tres meses y debe renovarse. La verificación confirma el registro oficial, pero no garantiza la calidad de un trabajo.',
  ]],
  ['Lo que no está permitido', [
    'Acordar pagos fuera de la plataforma, entregar datos falsos, hacerse pasar por otra persona, ofrecer servicios regulados sin la habilitación correspondiente y publicar contenido ofensivo o fraudulento. DeliMaster puede suspender o desactivar las cuentas que lo hagan, registrando el motivo.',
  ]],
  ['Responsabilidades', [
    'Los prestadores trabajan de forma independiente: DeliMaster no dirige ni supervisa su trabajo, y cada uno es responsable de la calidad del servicio y de sus obligaciones tributarias. DeliMaster responde por la custodia del dinero retenido y por el funcionamiento de la plataforma.',
  ]],
  ['Cambios y legislación', [
    'Si estos términos cambian, la aplicación pedirá aceptarlos de nuevo antes de seguir. Se rigen por las leyes de Chile.',
  ]],
];

export const PRIVACIDAD = [
  ['Responsable', [
    'El equipo de DeliMaster es responsable del tratamiento de tus datos, conforme a las leyes N.º 19.628 y N.º 21.719.',
  ]],
  ['Qué datos usamos', [
    'Cuenta: nombre, correo, celular (opcional), comuna y tu contraseña, que se guarda cifrada y nadie puede leer.',
    {
      cliente: 'Uso del servicio: tus solicitudes, la dirección y, si la compartes, la ubicación del trabajo, los mensajes del chat (incluidos los bloqueados), los pagos (monto, orden y código de autorización), la tarjeta guardada si decides guardarla (solo un identificador cifrado de Transbank, el tipo y los últimos 4 dígitos), las reseñas y, si aceptas los avisos del celular, el identificador de ese teléfono.',
      prestador: 'Uso del servicio: los trabajos que recibes, tu ubicación al confirmar que llegaste a un trabajo, los mensajes del chat (incluidos los bloqueados), los pagos y transferencias de tus trabajos, las reseñas y, si aceptas los avisos del celular, el identificador de ese teléfono.',
    },
    { prestador: 'Tu actividad como prestador: ficha, horario, portafolio, certificados (número y código), datos bancarios para recibir pagos (guardados cifrados), fotos de boletas y gastos del panel contable.' },
    'Fotos de los trabajos: además de la imagen, los datos que guarda la cámara en ella (fecha y hora en que se tomó, equipo, programa con que se guardó y, si los trae, la ubicación). Los usamos para verificar que la foto es real y se tomó en el momento.',
    'Seguridad: registros de intentos de inicio de sesión fallidos y de acciones bloqueadas.',
  ]],
  ['Para qué los usamos', [
    {
      cliente: 'Para operar la contratación y los pagos; detectar el problema a partir de tus fotos cuando lo pides; resolver disputas; prevenir fraudes y fugas de pago, y obtener estadísticas generales que no identifican a nadie.',
      prestador: 'Para mostrarte en el catálogo y operar los trabajos, los pagos y las transferencias; verificar los oficios regulados; resolver disputas; prevenir fraudes y fugas de pago; ofrecerte el panel contable, y obtener estadísticas generales que no identifican a nadie.',
    },
  ]],
  ['Por qué podemos usarlos', [
    'Porque los aceptas al registrarte y porque son necesarios para prestarte el servicio que pides.',
  ]],
  ['Quién ve tus datos', [
    {
      cliente: 'El maestro de un trabajo solo ve tu primer nombre, tu comuna y tu reputación como cliente; tu dirección exacta, recién cuando el pago queda asegurado o cuando tú la compartes. Nunca ve tu teléfono, correo ni datos de pago a través de la aplicación. De tus fotos ve si quedaron verificadas, pero no su ubicación ni el equipo con que se tomaron.',
      prestador: 'Los clientes ven tu nombre, tus servicios, comunas, horario, portafolio, verificaciones y reputación. Nunca ven tu teléfono, correo ni datos bancarios a través de la aplicación. De tus fotos de trabajo ven si quedaron verificadas, pero no su ubicación ni el equipo con que se tomaron.',
    },
    'El equipo de DeliMaster accede a ellos solo para operar la plataforma, resolver disputas y moderar. Además, los procesan los proveedores necesarios: Transbank (pagos), el servicio de alojamiento y base de datos y, si está activo, Google Cloud Vision (lectura de boletas). No vendemos tus datos.',
    { cliente: 'Si usas «Detectar el problema con la foto», tus fotos se envían al proveedor de inteligencia artificial que las analiza: Anthropic (Claude) o Google (Gemini), ambas empresas de Estados Unidos, por lo que ese análisis se hace fuera de Chile. Reciben solo las imágenes, sin tu nombre ni tus datos de contacto y sin los datos de la cámara (fecha, equipo ni ubicación). Mientras DeliMaster use el servicio gratuito de Google, Google puede usar esas imágenes para mejorar sus productos y personas de Google pueden revisarlas; por eso, evita que en las fotos aparezcan personas o documentos. Si no usas ese botón, tus fotos no se envían.' },
  ]],
  ['Cuánto tiempo los guardamos', [
    {
      cliente: 'Mientras tu cuenta esté activa. Los registros de pagos se conservan por obligaciones contables y de trazabilidad.',
      prestador: 'Mientras tu cuenta esté activa. Los registros de pagos y del libro contable se conservan por obligaciones contables y de trazabilidad. Las fotos de tus boletas se guardan hasta que las eliminas.',
    },
  ]],
  ['Tus derechos', [
    'Puedes pedir acceso, rectificación, supresión, oposición, portabilidad y bloqueo de tus datos. Tu nombre, celular y comuna los puedes editar en «Mi cuenta»; para lo demás, solicítalo al equipo de DeliMaster.',
  ]],
  ['Seguridad', [
    'Conexión cifrada, contraseñas protegidas con hash, sesión guardada de forma cifrada en el celular, fotos de boletas con enlaces que vencen en una hora y registro de eventos de seguridad.',
  ]],
  ['Menores de edad y cambios', [
    'DeliMaster no está dirigido a menores de 18 años. Si esta política cambia, te lo avisaremos y pediremos tu aceptación de nuevo.',
  ]],
];

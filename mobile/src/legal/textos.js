// Términos de uso y Política de privacidad de DeliMaster.
// VERSION_TERMINOS debe coincidir con la del backend (auth.servicio.js): si se publica una versión
// nueva, la app vuelve a pedir la aceptación a cada persona.
export const VERSION_TERMINOS = '1.4';
export const FECHA_TERMINOS = 'octubre de 2026';

export const AVISO_PROYECTO = 'DeliMaster es un proyecto en desarrollo (Proyecto de Título, INACAP Chillán). '
  + 'Antes de operar comercialmente, estos documentos serán revisados por un abogado.';

export const TERMINOS = [
  ['Qué es DeliMaster', [
    'DeliMaster conecta a clientes con prestadores independientes de oficios y trabajos de campo en Chillán y Coihueco. Intermedia la contratación, el pago y la comunicación, pero no ejecuta los trabajos: cada prestador es responsable del servicio que presta.',
  ]],
  ['Tu cuenta', [
    'Para usar DeliMaster debes ser mayor de 18 años y entregar datos verdaderos. Cada persona tiene una sola cuenta y es responsable de cuidar su contraseña, que puede cambiar o recuperar desde la aplicación.',
  ]],
  ['Cómo se contrata', [
    'El cliente describe lo que necesita y elige a un prestador del catálogo. El prestador tiene 30 minutos para aceptar o rechazar. Al aceptar elige cómo cobrar: con precio cerrado, cuando ya sabe cuánto cuesta el trabajo (el cliente paga ese precio), o con una visita de diagnóstico y una cotización en la aplicación.',
  ]],
  ['Visita de diagnóstico y cotización', [
    'El prestador fija la tarifa de la visita dentro del rango que DeliMaster define para cada comuna, e indica el día y la hora. El cliente paga la visita en la aplicación y recibe un código de 4 dígitos.',
    'Al llegar, el prestador ingresa ese código: así se confirma la visita y su pago pasa al prestador. Si el cliente compartió la ubicación del trabajo, el prestador también debe estar a menos de 1.500 metros de ese punto. El cliente no debe entregar el código antes de que el prestador llegue.',
    'Después del diagnóstico, el prestador envía la cotización por la aplicación, con el detalle del trabajo; mientras el cliente no responda, puede corregirla y el cliente ve el monto anterior. Si el cliente la acepta, paga el saldo (el total menos la visita ya pagada), que queda protegido igual que cualquier pago. Si la rechaza, la solicitud termina y la visita queda para el prestador por el diagnóstico realizado.',
    'El trabajo cotizado se paga en la aplicación. Si el cliente y el prestador lo acuerdan por fuera, pierden la garantía de pago, la revisión de reclamos y la reseña.',
  ]],
  ['Pago protegido', [
    'El cliente paga con Webpay (Transbank). DeliMaster nunca ve ni guarda el número de la tarjeta. Si el cliente decide guardarla para no volver a ingresarla (Webpay Oneclick), Transbank la guarda y DeliMaster solo conserva un identificador cifrado, el tipo y los últimos 4 dígitos. Con ella solo se cobra cuando el cliente confirma un pago en la aplicación, y puede cambiarla o quitarla cuando quiera en Mi cuenta.',
    'El dinero queda retenido por DeliMaster: la visita, hasta que el prestador confirma su llegada; el pago del trabajo, hasta el cierre, cuando el cliente confirma que quedó bien o, si no responde, 72 horas después de que el prestador lo marca como terminado. Luego se transfiere al prestador dentro de 48 horas hábiles, descontada la comisión.',
  ]],
  ['Cancelaciones y devoluciones', [
    'Antes de pagar, el cliente puede cancelar sin costo.',
    'Con la visita pagada, si el cliente cancela con al menos 2 horas de anticipación se le devuelve la visita; con menos anticipación, la visita queda para el prestador.',
    'Si el prestador no llega, desde 30 minutos después de la hora acordada el cliente puede pedir en la aplicación que se le devuelva la visita; si no lo pide, se devuelve automáticamente a las 24 horas.',
    'Las devoluciones se hacen por Webpay a la misma tarjeta; el banco puede tardar algunos días en reflejarlas.',
  ]],
  ['Comisión', [
    'DeliMaster cobra una comisión de 12% sobre cada pago del trabajo (la visita y el saldo, o el precio cerrado), que se descuenta del monto que recibe el prestador. Registrarse y usar la aplicación no tiene costo. Si la comisión cambia, se avisará con anticipación.',
  ]],
  ['Reclamos y disputas', [
    'Antes del cierre, el cliente puede reportar un problema. El dinero sigue retenido y el equipo revisa la evidencia (chat, fotos, cotización e historial) para decidir si libera el pago del trabajo al prestador, lo reembolsa al cliente o le devuelve solo una parte (por ejemplo, gastos en materiales que el prestador no justificó con su boleta), a través de Webpay. La visita no se reembolsa en una disputa sobre el trabajo, porque corresponde al diagnóstico ya realizado. La decisión y su fundamento quedan registrados.',
  ]],
  ['Chat y filtro de seguridad', [
    'Hasta que el pago está protegido, el chat bloquea teléfonos, correos, datos bancarios, enlaces y propuestas de pagar por fuera de la plataforma. Después del pago se pueden compartir teléfonos para coordinar la visita, pero se siguen bloqueando las propuestas de pago por fuera y los datos bancarios.',
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
    'El equipo de DeliMaster (Proyecto de Título TIHI84, INACAP sede Chillán) es responsable del tratamiento de tus datos, conforme a las leyes N.º 19.628 y N.º 21.719.',
  ]],
  ['Qué datos usamos', [
    'Cuenta: nombre, correo, celular (opcional), comuna y tu contraseña, que se guarda cifrada y nadie puede leer.',
    'Uso del servicio: tus solicitudes, la dirección y, si la compartes, la ubicación del trabajo, la ubicación del prestador al confirmar que llegó, los mensajes del chat (incluidos los bloqueados), los pagos (monto, orden y código de autorización), la tarjeta guardada si decides guardarla (solo un identificador cifrado de Transbank, el tipo y los últimos 4 dígitos), las reseñas y, si aceptas los avisos del celular, el identificador de ese teléfono.',
    'Prestadores: ficha, certificados (número y código), datos bancarios para recibir pagos, fotos de boletas y gastos del panel contable.',
    'Seguridad: registros de intentos de inicio de sesión fallidos y de acciones bloqueadas.',
  ]],
  ['Para qué los usamos', [
    'Para operar la contratación, los pagos y las transferencias; verificar oficios regulados; resolver disputas; prevenir fraudes y fugas de pago; ofrecer el panel contable al prestador, y obtener estadísticas generales que no identifican a nadie.',
  ]],
  ['Por qué podemos usarlos', [
    'Porque los aceptas al registrarte y porque son necesarios para prestarte el servicio que pides.',
  ]],
  ['Quién ve tus datos', [
    'La otra parte de un trabajo solo ve tu primer nombre (si eres cliente) o tu nombre, comunas y reputación (si eres prestador). Nunca ve tu teléfono, correo ni datos bancarios a través de la aplicación.',
    'El equipo de DeliMaster accede a ellos solo para operar la plataforma, resolver disputas y moderar. Además, los procesan los proveedores necesarios: Transbank (pagos), el servicio de alojamiento y base de datos y, si está activo, Google Cloud Vision (lectura de boletas). No vendemos tus datos.',
  ]],
  ['Cuánto tiempo los guardamos', [
    'Mientras tu cuenta esté activa. Los registros de pagos y del libro contable se conservan por obligaciones contables y de trazabilidad. Las fotos de boletas se guardan hasta que el prestador las elimina.',
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

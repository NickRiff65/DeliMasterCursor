# Plan de desarrollo

Alineado con el cronograma del Informe de Formulación (Tabla 9). Se marca cada entregable al completarlo.

## Sprint 1 · Diseño (semanas 3–4) — OE2
- [x] Estructura del repositorio
- [x] Base del backend: servidor Express, configuración, manejo de errores, endpoint de salud
- [x] Modelo de datos inicial (migración 001), incluido el ledger de garantía
- [ ] Prototipos de interfaz (Figma) de DeliMaster Lite y Pro
- [x] Diagramas: entidad-relación y casos de uso (para el informe técnico) — ver [diagramas.md](diagramas.md)

## Sprint 2 · Base (semanas 5–6) — OE3
- [x] HU-10 Registro e inicio de sesión (JWT + Bcrypt)
- [x] HU-11 Verificación de prestadores (SEC/SAG): solicitud del prestador y resolución del administrador (API)
- [x] HU-01 / HU-02 / HU-07 Catálogo filtrable, perfil del prestador y orden por reputación
- [x] Proyecto Expo de DeliMaster Lite: login, registro, catálogo y perfil del prestador
- [x] DeliMaster Pro (variante del mismo proyecto): panel, ficha y verificación del prestador

## Sprint 3 · Comunicación (semanas 7–8) — OE3
- [x] HU-04 Chat en tiempo real (Socket.io) con filtro anti-fuga
- [x] HU-08 Solicitud en lenguaje natural (backend + pantallas en Lite)
- [x] HU-12 Cola local sin conexión (expo-sqlite + expo-network)

## Sprint 4 · Confianza (semanas 9–10) — OE4
- [x] HU-03 Integración Webpay Plus (ambiente de integración) + ledger "retenido" — probado con pago real de integración
- [x] HU-05 Asignación y respuesta del prestador con plazo (backend + pantallas)
- [x] Cierre del trabajo: finalizar, confirmar (ledger liberado), cierre automático a las 72 h y reporte de problemas
- [x] HU-06 / HU-07 Reseñas solo de trabajos cerrados; reputación recalculada desde las reseñas reales

## Sprint 5 · Retención y seguridad (semanas 11–12) — OE4, OE5
- [x] HU-09 Panel contable con OCR (Google Cloud Vision o Tesseract local) y respaldo manual — probado con boleta real
- [x] HU-13 / HU-14 Panel Web de Administración (React + Vite): resumen con indicadores, transferencias con comprobante, moderación
- [x] HU-16 Resolución de disputas: liberar al prestador o reembolsar al cliente por Webpay
- [x] HU-17 Certificado SEC con código y vencimiento (3 meses): renovación desde DeliMaster Pro
- [x] Datos bancarios del prestador (RUT validado) y script para crear la cuenta de administración
- [x] Términos de uso y Política de privacidad con aceptación registrada (versión y fecha)
- [x] Mi cuenta: editar nombre, celular y comuna; cambiar contraseña (cierra las demás sesiones)
- [x] Recuperar contraseña con código de un solo uso (hash, 15 minutos, 5 intentos)
- [x] Fotos de evidencia del trabajo (prestador) y del problema (cliente), visibles en las disputas del panel
- [x] Análisis OWASP (API, Mobile y Web Top 10): 15 hallazgos corregidos, 0 críticos o altos abiertos — ver [seguridad-owasp.md](seguridad-owasp.md)

## Sprint 6 · Evaluación (semana 13) — OE6
- [x] Preparación: kit de evaluación (protocolo, consentimiento, tareas, cuestionario SUS) y planilla con cálculo automático — ver [evaluacion/](evaluacion/README.md)
- [x] Datos de demostración realistas para las sesiones (`npm run db:demo`)
- [ ] Entrevistas de validación con 5 clientes y 5 prestadores (OE1)
- [ ] Prueba de usabilidad con SUS ≥ 68 (OE6)
- [ ] Pruebas funcionales de los 22 flujos críticos
- [ ] Corrección de hallazgos de severidad alta e informe de evaluación

## Decisiones técnicas
| Decisión | Motivo |
|---|---|
| Montos en pesos enteros (`INTEGER`) | El CLP no usa decimales; evita errores de redondeo en el ledger. |
| `UUID` generado en el cliente para solicitudes | Permite reenviar solicitudes creadas sin conexión sin duplicarlas (HU-12). |
| SQL plano con migraciones numeradas | Transparente para el equipo y control total de las transacciones del ledger. |
| Historial de estados en tablas `*_eventos` | Trazabilidad ante disputas (fecha, actor y cambio). |
| Reglas críticas también en la base de datos | Ledger cuadrado y sin borrado, reseñas solo de servicios cerrados: ninguna ruta futura puede saltárselas. |
| Express 5 | Captura los errores de funciones `async` (Express 4 dejaba la petición colgada). |
| Orden del catálogo por promedio bayesiano | Una reseña de 5★ no supera a 40 de 4,8★; los prestadores nuevos parten con 4,0 y tienen visibilidad inicial. |
| Comunas validadas contra las 21 de Ñuble | Datos consistentes para filtrar ("chillan" = "Chillán"). |
| Mensajes por REST y avisos por Socket.io | La API valida y filtra cada mensaje; el socket solo entrega en tiempo real. Así no hay dos caminos para enviar que mantener seguros. |
| Mensajes bloqueados se guardan pero no se entregan | Sirven para medir la tasa de fuga (KPI) y quien escribe entiende por qué no se envió. |
| Cierre automático a las 72 h | El dinero no puede quedar retenido para siempre si el cliente no responde; protege al prestador. |
| Reloj de plazos en el servidor | La respuesta de 30 min, el cierre de 72 h y la devolución de la visita corren cada minuto aunque nadie abra la app. |
| Reputación recalculada desde la tabla de reseñas | Evita errores acumulados; el promedio siempre corresponde a reseñas reales. |
| Pasarela de pago intercambiable (pasarela.js) | Las pruebas automáticas simulan a Transbank; el resto del código no depende del SDK. |
| El monto del pago lo fija el servidor y se valida al confirmar | Evita que una app alterada pague menos; la confirmación debe coincidir en monto y orden de compra. |
| URL de retorno según el host de la petición | Funciona en cualquier red (casa, punto de acceso del celular) sin configurar nada. |
| expo-network en vez de NetInfo (HU-12) | Módulo oficial de Expo con la misma función y soporte web; el informe técnico debe mencionarlo así. |
| Cola en SQLite (celular) y localStorage (web) | expo-sqlite en web es experimental y exige cabeceras especiales; Metro elige el archivo por plataforma. |
| Caché de Metro separada por variante (metro.config.js) | Lite y Pro pueden correr a la vez sin que una entregue la configuración de la otra. |
| OCR intercambiable: Google Cloud Vision o Tesseract local | Vision exige cuenta con tarjeta; Tesseract funciona sin costo ni internet. Basta con definir GOOGLE_VISION_API_KEY para cambiar. |
| El OCR solo propone el total; el prestador confirma | Ningún lector es perfecto; se guarda si el monto vino de la boleta o se ingresó a mano. |
| Fotos de boletas con enlace firmado que vence en 1 hora | La foto no queda pública aunque alguien copie el enlace; no requiere enviar el token en la etiqueta de imagen. |
| Panel de administración aparte (React + Vite), no dentro de las apps | Es una herramienta de escritorio para el equipo; no se distribuye a clientes ni prestadores. |
| La cuenta se revisa en cada petición (además del JWT) | Desactivar a un usuario corta sus sesiones al instante, no recién cuando vence el token. |
| Transferencias "todo o nada" con comprobante | Una transferencia bancaria paga varios trabajos; si un pago no corresponde, no se registra ninguno. |
| Reembolso primero en Transbank y después en la base | Si Webpay rechaza el reembolso, la disputa sigue abierta y el dinero retenido; nunca queda un estado a medias. |
| Tras el pago, el chat permite teléfonos pero bloquea pagos por fuera | Las partes deben poder coordinarse, pero no desviar trabajos adicionales fuera de la plataforma (RN-08). |
| Vencimiento de la verificación en la base de datos | El catálogo, el perfil y la asignación usan la misma condición de vigencia; nada puede saltársela. |
| Límites de uso por usuario y por cuenta (express-rate-limit) | El OCR consume mucha CPU y el chat se puede inundar; el freno por IP no basta contra fuerza bruta distribuida. |
| Sesión de administración de 8 horas | Da acceso a datos de todos y a mover dinero; las apps mantienen 7 días por comodidad. |
| Registro de eventos de seguridad en JSON | Permite buscar intentos de ataque en los registros del proveedor sin guardar contraseñas ni tokens. |
| Aceptación de términos con versión y fecha | Prueba el consentimiento (Ley 21.719); una versión nueva se vuelve a pedir en la app. |
| Código de 6 dígitos y no enlace para recuperar la contraseña | Se escribe en la misma app del celular; se guarda solo su hash, vence en 15 minutos y se anula al quinto intento. |
| `sesiones_desde` en la cuenta | Cambiar o recuperar la contraseña cierra las demás sesiones aunque los JWT no hayan vencido. |
| Las fotos de evidencia no se pueden borrar (disparador en la base) | Si se pudieran borrar, perderían su valor para resolver una disputa. |

# Análisis de seguridad OWASP — DeliMaster

**Objetivo específico OE5:** cerrar el 100% de las vulnerabilidades críticas y altas detectadas en un análisis de seguridad basado en OWASP antes del término de la semana 12.

**Fecha:** 8 de octubre de 2026 · **Equipo:** Mario Quiroga, Vicente Suárez y Nicolás Riffo

**Resultado:** no se encontraron vulnerabilidades críticas ni altas. Se detectaron 15 hallazgos (5 de severidad media y 10 baja) y todos quedaron corregidos y respaldados por pruebas automatizadas. Quedan 6 riesgos aceptados de severidad baja o informativa, con su justificación. **El criterio del OE5 se cumple.**

---

## 1. Alcance

| Componente | Tecnología | Referencia OWASP aplicada |
|---|---|---|
| API REST y tiempo real | Node.js 24, Express 5, Socket.io 4, PostgreSQL 16 | API Security Top 10 (2023) |
| DeliMaster Lite y DeliMaster Pro | React Native con Expo SDK 57 | Mobile Top 10 (2024) |
| Panel Web de Administración | React 19 con Vite | Top 10 (2021) |

Quedan fuera del alcance la infraestructura de producción (aún no contratada) y los servicios de terceros (Transbank, proveedor de OCR), cuya seguridad es responsabilidad de cada proveedor.

## 2. Metodología

1. **Revisión de código** de cada módulo contra las categorías OWASP: autorización por objeto y por función, autenticación, validación de entradas, exposición de datos, configuración y consumo de recursos.
2. **Auditoría de dependencias** con `npm audit` en los tres proyectos, clasificando cada advertencia según si el paquete viaja en el producto o solo se usa para compilar.
3. **Pruebas de ataque automatizadas** (`backend/tests/seguridad.test.js` y `seguridad-limites.test.js`): cada prueba intenta un ataque concreto (acceder a datos ajenos, falsificar un token, autoasignarse el rol de administrador, inundar el chat, adivinar contraseñas) y comprueba que la API lo rechaza. Se verificó además que la prueba del chat **falla** si se quita la corrección.
4. **Pruebas manuales** en el navegador de los flujos del panel de administración y de las apps.

**Escala de severidad** (impacto × probabilidad): *Crítica* (compromiso total o de dinero, explotable sin autenticación), *Alta* (acceso a datos o dinero ajeno con una cuenta común), *Media* (exposición parcial o abuso que degrada el servicio), *Baja* (requiere condiciones poco probables o tiene impacto acotado), *Informativa* (buena práctica sin riesgo explotable).

## 3. Hallazgos corregidos

| ID | Hallazgo | OWASP | Severidad | Corrección | Evidencia |
|---|---|---|---|---|---|
| H-01 | Un prestador que rechazaba una solicitud (o al que se le vencía el plazo) seguía en la sala del chat y recibía en tiempo real los mensajes que el cliente le escribía al siguiente prestador. | API1 | Media | Al rechazar, vencer el plazo o cancelar, todos salen de la sala (`expulsarDeSala`). | `seguridad.test.js` · "quien rechaza una solicitud deja de recibir el chat" |
| H-02 | Fuera del inicio de sesión no había límites de uso: se podía saturar el OCR de boletas (uso intensivo de CPU), el chat, la creación de solicitudes y el inicio de pagos. | API4 | Media | Límites por usuario: 20 boletas cada 10 min, 30 mensajes por minuto, 30 solicitudes por hora, 10 pagos cada 10 min; techo general de 1.000 peticiones cada 5 min por IP. La foto se lee recién después de validar la sesión y el límite. | `seguridad-limites.test.js` · "no puede inundar el chat" |
| H-03 | El freno contra fuerza bruta era solo por IP: un atacante con muchas IP podía probar contraseñas de una misma cuenta sin límite. | API2 | Media | Además del límite por IP, 5 intentos fallidos por cuenta cada 15 minutos. | `seguridad-limites.test.js` · "tras 5 contraseñas incorrectas" |
| H-04 | Una cuenta desactivada conservaba su sesión hasta que vencía el token (7 días). | API2 | Media | La cuenta y su rol se consultan en la base de datos en cada petición y al conectarse por Socket.io. | `admin.test.js` · "moderación…"; `seguridad.test.js` · "el rol sale de la base de datos" |
| H-05 | Después del pago, el chat dejaba pasar ofertas de pago por fuera de la plataforma ("me pagas en efectivo"), lo que permite desviar trabajos adicionales. | API6 | Media | Tras el pago se permiten teléfonos para coordinar, pero se bloquean las ofertas de pago por fuera y los datos bancarios (regla RN-08). | `chat.test.js` · "después del pago se siguen bloqueando las ofertas de pago por fuera" |
| H-06 | La API y Socket.io aceptaban peticiones de cualquier origen web, sin opción de restringirlo. | API8 | Baja | `CORS_ORIGENES` define los dominios permitidos; en producción es obligatoria y el servidor no arranca sin ella. La API usa tokens en el encabezado (no cookies), por lo que no es vulnerable a CSRF. | Configuración (`src/config/env.js`) |
| H-07 | La sesión de administración duraba 7 días, igual que la de las apps. | API2 | Baja | La sesión de administración dura 8 horas (configurable con `JWT_EXPIRA_ADMIN`). | `seguridad.test.js` · "la sesión de administración vence en 8 horas" |
| H-08 | `GET /` publicaba el inventario completo de rutas de la API. | API9 | Baja | El índice solo existe fuera de producción. | Revisión de código (`src/app.js`) |
| H-09 | Las URL públicas (retorno de Webpay, fotos de boletas) se deducían del encabezado `Host` y del protocolo, lo que detrás del proxy de un PaaS produce enlaces `http` o manipulables. | API8 | Baja | `URL_PUBLICA_API` fija la URL en producción y `TRUST_PROXY` permite conocer la IP y el protocolo reales. | Configuración |
| H-10 | No se validaba la robustez de `JWT_SECRET`: se podía arrancar con el valor de ejemplo. | API8 | Baja | El servidor no arranca con menos de 32 caracteres ni con el valor de ejemplo. | `seguridad.test.js` · "el servidor no arranca con un JWT_SECRET débil" |
| H-11 | No quedaba registro de eventos de seguridad. | A09 | Baja | Registro estructurado (JSON) de inicios de sesión fallidos, accesos denegados, sesiones de cuentas desactivadas y límites excedidos, sin contraseñas ni tokens y con el correo parcialmente oculto. | `src/utils/seguridad.js` |
| H-12 | La fuente de una verificación aceptaba cualquier URL, incluida `javascript:`, que se ejecutaría al abrirla en el panel. | A03 | Baja | Solo se aceptan enlaces `http` y `https`. | `verificaciones.test.js` · "la fuente… solo puede ser un enlace http o https" |
| H-13 | Una versión publicada de la app podía configurarse por error con una API sin cifrar (`http`). | M5 | Baja | Fuera de desarrollo, la app exige `https://` y no arranca si no lo es. | `mobile/src/lib/config.js` |
| H-14 | Android respaldaba automáticamente los datos de la app en la nube de Google. | M9 | Baja | `allowBackup: false`. El token ya se guardaba cifrado con Keychain (iOS) y Keystore (Android). | `mobile/app.config.js` |
| H-15 | El panel de administración no tenía cabeceras de seguridad definidas para cuando se publique. | A05 | Baja | Archivo `_headers` con CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` y HSTS. | `admin/public/_headers` |

## 4. Riesgos aceptados

| ID | Riesgo | Severidad | Justificación y mitigación |
|---|---|---|---|
| R-01 | `decode-uri-component` (usado por el enrutador de Expo) permite congelar la navegación de la app con un enlace malicioso. | Baja | Solo afecta a quien abre el enlace, sin acceso a datos. La versión corregida (0.5) solo existe como módulo ES y el enrutador la carga con `require`: forzarla rompería la app. Se revisará en cada actualización de Expo. |
| R-02 | `braces`, `node-forge` y `uuid` con advertencias de `npm audit`. | Informativa | Pertenecen a herramientas de compilación (Metro, CLI de Expo, configuración de Xcode) y no viajan en la app. La "corrección" que propone `npm audit` es bajar Expo de la versión 57 a la 44. Se probó aplicar los parches menores de la versión 57 (`expo install --fix`), pero npm reubicó `expo-modules-core` y la app dejó de compilar; se revirtió y se aplicarán en la próxima actualización planificada de Expo, con una instalación limpia. Las herramientas de prueba de las apps (Jest y jest-expo) heredan las mismas advertencias; solo se ejecutan en el computador del equipo. |
| R-03 | El registro indica si un correo ya tiene cuenta (enumeración de usuarios). | Baja | Se mantiene por usabilidad: el usuario necesita saber que ya está registrado. El inicio de sesión no lo revela (mismo mensaje y mismo tiempo de respuesta) y el registro tiene límite por IP. |
| R-04 | En la versión web de demostración, el token se guarda en `localStorage`. | Baja | La versión web se usa solo para demostraciones; las apps guardan el token cifrado (Keychain y Keystore). La interfaz no inserta HTML, lo que reduce el riesgo de XSS. |
| R-05 | Los enlaces de las fotos de boletas se firman con la misma clave que los JWT. | Informativa | La firma usa un prefijo propio (`boleta:`) y un formato distinto al del JWT, por lo que una firma no sirve para la otra. Una clave separada queda como mejora. |
| R-06 | La contraseña exige 8 caracteres con letras y números, pero no se compara con listas de contraseñas filtradas. | Baja | Cumple el mínimo de la guía NIST 800-63B. La verificación contra contraseñas filtradas queda como trabajo futuro. |

## 5. Controles verificados por categoría

### OWASP API Security Top 10 (2023)

| Categoría | Control en DeliMaster | Verificación |
|---|---|---|
| API1 · Autorización a nivel de objeto | Cada servicio comprueba que el usuario sea parte de la solicitud (cliente o prestador asignado); los gastos y las boletas se filtran por prestador; las fotos se entregan con un enlace firmado que vence en una hora; Socket.io solo une a las partes actuales. | `seguridad.test.js` (4 pruebas) |
| API2 · Autenticación | Bcrypt (costo 12); mismo mensaje y tiempo si el correo no existe; JWT HS256 con el algoritmo fijado; cuenta y rol consultados en cada petición; límites por IP y por cuenta; sesión de administración de 8 h. Cambiar o recuperar la contraseña cierra las demás sesiones; los códigos de recuperación se guardan como hash, vencen en 15 minutos y se anulan al quinto intento. | `seguridad.test.js`, `seguridad-limites.test.js` |
| API3 · Autorización a nivel de propiedad | Esquemas zod que descartan los campos no declarados (no se puede enviar `rol: admin`, `activo` ni la reputación); las respuestas nunca incluyen `password_hash` y ocultan el contacto de la contraparte. | `seguridad.test.js` (2 pruebas) |
| API4 · Consumo de recursos | Límites de uso por operación; tamaño máximo del cuerpo (1 MB, 9 MB para fotos); listados paginados o acotados (máximo 50–100 filas); mensajes de hasta 1.000 caracteres. | `seguridad-limites.test.js` |
| API5 · Autorización a nivel de función | `autorizar(rol)` en cada ruta; el panel de administración exige el rol admin; los administradores no pueden crearse por la API. | `seguridad.test.js`, `admin.test.js` |
| API6 · Flujos de negocio sensibles | El monto del pago lo fija el servidor y se valida al confirmar (monto y orden de compra); el ledger no permite borrar movimientos y debe cuadrar (restricciones y disparadores); reseñas solo de servicios cerrados; transferencias "todo o nada"; reembolso primero en Transbank. | `pagos.test.js`, `cierre.test.js`, `admin.test.js` |
| API7 · SSRF | El servidor no descarga URL entregadas por usuarios: el OCR recibe la imagen en base64 y la URL de la fuente solo se guarda como texto. | Revisión de código |
| API8 · Configuración | Helmet (CSP, HSTS, `nosniff`, sin `x-powered-by`); errores sin detalles internos; CORS configurable y obligatorio en producción; validación del secreto al arrancar. | `seguridad.test.js` (2 pruebas) |
| API9 · Inventario | Índice de rutas oculto en producción; rutas documentadas en `docs/api.http`. | Revisión de código |
| API10 · Consumo inseguro de APIs | La respuesta de Transbank se valida (código, estado, monto y orden de compra) antes de retener el dinero; el total que propone el OCR siempre lo confirma el prestador. | `pagos.test.js`, `gastos.test.js` |

Además, **todas las consultas SQL usan parámetros**: las únicas interpolaciones son constantes del código o listas fijas de columnas, nunca datos del usuario.

### OWASP Mobile Top 10 (2024)

| Categoría | Control |
|---|---|
| M1 · Credenciales | La app no contiene claves ni secretos; solo la URL pública de la API. |
| M2 · Cadena de suministro | Dependencias auditadas y clasificadas según si viajan en la app (ver R-01 y R-02). |
| M3 · Autenticación y autorización | Todas las decisiones se toman en el servidor; la app solo muestra lo que la API autoriza. |
| M4 · Validación de entradas | Validación en el servidor con zod; el aviso de "pago aprobado" solo aparece si el servidor confirma el pago, aunque el enlace diga lo contrario. |
| M5 · Comunicación insegura | HTTPS obligatorio fuera de desarrollo (H-13). |
| M6 · Privacidad | Datos mínimos; el contacto de la contraparte nunca se envía a la app; permisos de cámara y fotos con propósito declarado. |
| M7 · Protección del binario | Fuera del alcance del MVP (sin ofuscación); la app no contiene secretos que proteger. |
| M8 · Configuración | Variantes Lite y Pro con identificadores propios; sin depuración en versiones publicadas. |
| M9 · Almacenamiento inseguro | Token cifrado con Keychain/Keystore; sin respaldo automático (H-14); la cola sin conexión solo guarda el texto de la solicitud. |
| M10 · Criptografía | Se usan las primitivas del sistema y de bibliotecas probadas (Bcrypt, HMAC-SHA256, UUID aleatorios); no hay criptografía propia. |

## 6. Configuración obligatoria para producción

| Variable o acción | Por qué |
|---|---|
| `NODE_ENV=production` | Oculta el índice de rutas y exige `CORS_ORIGENES`. |
| `JWT_SECRET` de 48 bytes aleatorios | Firma de sesiones y enlaces (el servidor rechaza uno débil). |
| `CORS_ORIGENES` con el dominio del panel | Solo ese origen web puede llamar a la API. |
| `TRUST_PROXY=1` y `URL_PUBLICA_API=https://…` | IP real para los límites de uso y enlaces correctos detrás del proxy. |
| `EXPO_PUBLIC_API_URL=https://…` | La app publicada no arranca con `http`. |
| Credenciales de producción de Webpay (`WEBPAY_AMBIENTE`, `WEBPAY_CODIGO_COMERCIO`, `WEBPAY_API_KEY`) | Las de integración son públicas. |
| Cuenta de administración con `npm run crear-admin` (contraseña de 10+ caracteres) | No usar la cuenta de demostración. |
| Base de datos gestionada con conexión cifrada y respaldos diarios | Integridad del ledger ante fallas. |
| Revisar los registros `"seguridad":true` | Detectar ataques de fuerza bruta o abuso. |

## 7. Conclusión

El análisis del 8 de octubre de 2026 no encontró vulnerabilidades críticas ni altas. Las 15 vulnerabilidades encontradas, de severidad media y baja, quedaron corregidas y respaldadas por 18 pruebas automatizadas de seguridad. Esa revisión contó 158 pruebas en el backend; la suite siguió creciendo con visita, tarjeta guardada, avisos y llegada con GPS. El total vigente está en el README de la raíz. Los riesgos restantes son de severidad baja o informativa y tienen una justificación documentada. El hallazgo más relevante (H-01) mostró el valor de probar los flujos completos: la autorización estaba bien resuelta en la API REST, pero el canal de tiempo real conservaba un acceso que ya no correspondía.

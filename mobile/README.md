# DeliMaster Lite y DeliMaster Pro

Una sola base de código (React Native, Expo SDK 57, Expo Router) que genera dos apps,
definidas en `app.config.js`:

| App | Para quién | Comandos |
|---|---|---|
| **DeliMaster Lite** | Clientes | `npm.cmd start` · `npm.cmd run web` (puerto 8081) |
| **DeliMaster Pro** | Prestadores | `npm.cmd run start:pro` · `npm.cmd run web:pro` (puerto 8082) |

Cada app acepta solo su tipo de cuenta: si un cliente entra a Pro (o un prestador a Lite), se le indica qué app usar.

## Pantallas
| App | Ruta | Pantalla | Historia |
|---|---|---|---|
| Ambas | `/login`, `/registro` | Inicio de sesión y registro | HU-10 |
| Lite | `/` | Inicio con las solicitudes del cliente | HU-05 |
| Lite | `/maestros` | Catálogo filtrable por categoría y comuna | HU-01, HU-07 |
| Lite | `/prestador/[id]` | Perfil del prestador y botón Contratar | HU-02 |
| Lite | `/nueva-solicitud` | Pedir un servicio en lenguaje natural, con vista previa | HU-08 |
| Lite | `/solicitud/[id]` | Elegir prestador, pagar, esperar la llegada y ver el historial | HU-05 |
| Pro | `/panel` | Disponibilidad, visibilidad en el catálogo, reputación y ficha | — |
| Pro | `/ficha` | Editar servicios, comunas y descripción | — |
| Pro | `/verificaciones` | Solicitar verificación SEC/SAG y ver su estado | HU-11 |
| Pro | `/recibidas`, `/trabajo/[id]` | Solicitudes asignadas con cuenta regresiva; aceptar con precio o rechazar. Si el cliente marcó el lugar, la llegada pide el GPS del maestro | HU-05 |
| Ambas | `/chat/[id]` | Chat en tiempo real con filtro anti-fuga | HU-04 |
| Lite | `/solicitud/[id]` | Pagar con Webpay, confirmar cierre, reportar problema y calificar | HU-03, HU-06 |
| Pro | `/trabajo/[id]` | Marcar terminado, ver monto a recibir y calificación | HU-06 |
| Pro | `/trabajo/[id]` | Gastos del trabajo: fotografiar la boleta, confirmar el total leído o ingresarlo a mano | HU-09 |
| Pro | `/finanzas` | Ingreso neto, gastos, ganancia y monto por cobrar del mes | HU-09 |
| Pro | `/datos-pago` | RUT, banco y cuenta para recibir las transferencias | HU-13 |
| Ambas | `/solicitud/[id]`, `/trabajo/[id]` | Fotos de evidencia: el prestador sube el trabajo terminado y el cliente el problema (hasta 6 cada uno) | HU-16 |
| Ambas | `/cuenta` | Mi cuenta: nombre, celular y comuna; cambiar contraseña; documentos; cerrar sesión | — |
| Ambas | `/recuperar` | Recuperar la contraseña con un código de 6 dígitos enviado al correo | — |
| Ambas | `/terminos`, `/privacidad` | Términos de uso y Política de privacidad (se aceptan al registrarse) | — |
| Ambas | `/aceptar-terminos` | Aparece si la cuenta no ha aceptado la versión vigente de los términos | — |
| Pro | `/verificaciones` | Código del certificado SEC, vigencia y renovación antes del vencimiento | HU-17 |
| Lite | (en `/nueva-solicitud` y `/solicitudes`) | Sin señal: la solicitud se guarda y se envía sola al volver la conexión | HU-12 |

## Mostrar la app (iPhone o Android, sin instalar nada)
Con el backend corriendo y el computador y los celulares en la misma Wi-Fi:
```bash
npm.cmd run web        # Lite → http://IP-DEL-PC:8081
npm.cmd run web:pro    # Pro  → http://IP-DEL-PC:8082
```
Abrir la dirección en Safari o Chrome del celular.

## Expo Go
- **Android:** escanear el QR con Expo Go.
- **iPhone (SDK 57):** Expo Go exige iniciar sesión con la misma cuenta de Expo en el computador
  (`npx.cmd expo login`) y en la app.

Los avisos con la app cerrada usan `expo-notifications` (módulo nativo). Expo Go y la versión web no los entregan:
ahí siguen el aviso dentro de la app y el correo. Para el celular del equipo hay que volver a compilar la APK
(`npm.cmd run apk:lite` y `npm.cmd run apk:pro`). La versión de la app pasó a 0.2.0.

## Instalar la versión web en el iPhone

`npm.cmd run web:exportar` compila Lite y Pro y las deja instalables (`scripts/web-instalable.js`: manifiesto,
íconos de `assets/web/` y etiquetas de Apple). En Safari: Compartir → «Agregar a pantalla de inicio». Queda con su
ícono ("DeliMaster" y "DM Pro") y se abre a pantalla completa, sin la barra de Safari. En el iPhone, mientras no
esté instalada, la app muestra un aviso con esas instrucciones (`src/components/InstalarEnIphone.js`).

## Pruebas automáticas

```bash
npm.cmd test           # Jest + jest-expo + Testing Library (no necesitan el backend)
```

Se prueban las dos apps con la navegación real (`src/app/_layout.js`) y la API simulada:

- **Rutas protegidas:** sin sesión todo lleva al ingreso, cada app acepta solo su rol (cliente en Lite, prestador en
  Pro), un token vencido se descarta y quien tiene términos pendientes solo puede aceptarlos.
- **Cuentas:** registro con términos obligatorios, errores por campo y recuperación de contraseña con código.
- **Cola sin conexión (HU-12):** guarda la solicitud con el mismo UUID, la envía al volver la señal o cada 30 s,
  se detiene si se corta a mitad de camino, separa lo rechazado para revisión y no duplica.
- **Pedir un servicio (HU-08):** vista previa de lo que entendió la app, servicios no ofrecidos y guardado sin señal.
- **Fotos de evidencia (HU-16):** cámara con permiso, tope de 6 fotos y ampliación.

El almacenamiento cifrado, la red, SQLite, la cámara y Socket.io se reemplazan por versiones en memoria
(`tests/preparar.js`).

## Configuración
Copia `.env.example` como `.env.local` y pon la IP de tu computador
(`ipconfig` → "Dirección IPv4"). Si el celular no conecta, permite **Node.js** en el
Firewall de Windows para redes privadas.

Lite y Pro pueden correr al mismo tiempo: `metro.config.js` les da una caché separada a cada una
(con una caché compartida, el puerto de Pro llegaba a servir la app Lite).

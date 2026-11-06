# DeliMaster

Plataforma de contratación segura de oficios y trabajos de campo verificables en Chillán y Coihueco.
Proyecto de Título TIHI84 — INACAP Chillán · Mario Quiroga, Vicente Suárez y Nicolás Riffo.

## Estructura del repositorio

```
DeliMaster/
├── backend/        API REST (Node.js, Express 5, PostgreSQL)
├── mobile/         DeliMaster Lite / Pro (React Native, Expo SDK 57)
├── admin/          Panel Web de Administración (React + Vite)
└── docs/           Plan de desarrollo, ejemplos de la API (api.http) y diagramas
```

## Descargar el proyecto (equipo)

El repositorio es privado: el dueño debe invitar a cada integrante en GitHub
(**Settings → Collaborators → Add people**) y cada uno acepta la invitación que le llega por correo. Luego:

```bash
git clone https://github.com/LILSHAX-bot/DeliMaster.git
cd DeliMaster
```

Para traer los cambios más recientes más adelante: `git pull`. Sin Git, también se puede bajar desde GitHub con
**Code → Download ZIP** (pero así no se actualiza solo).

Lo que **no** está en el repositorio, a propósito: los archivos `.env` (claves; cada uno crea el suyo desde
`.env.example`), las fotos subidas (`backend/uploads/`), las dependencias (`node_modules/`, se instalan con
`npm.cmd install`) y las versiones compiladas (`dist-lite/`, `dist-pro/`, `admin/dist/`).

## Requisitos

- Node.js 22 LTS o superior
- PostgreSQL 16 o superior
- Git
- En Windows PowerShell usar `npm.cmd` en vez de `npm` (o habilitar scripts para el usuario)

## Puesta en marcha del backend

```bash
cd backend
npm.cmd install
copy .env.example .env      # completar DB_PASSWORD (JWT_SECRET: cadena larga y aleatoria)
npm.cmd run db:crear        # crea las bases delimaster y delimaster_test
npm.cmd run migrate         # crea las tablas
npm.cmd run db:demo         # (opcional) datos de demostración
npm.cmd run crear-admin -- --email equipo@delimaster.cl --nombre "Equipo DeliMaster"   # cuenta del panel
npm.cmd run dev             # API en http://localhost:3000
npm.cmd test                # pruebas automáticas
```

## Cuentas y correo

El registro exige aceptar los Términos de uso y la Política de privacidad (`mobile/src/legal/textos.js`; la versión
debe coincidir con `VERSION_TERMINOS` del backend). Para recuperar la contraseña se envía un código por correo: sin
SMTP configurado (ver `backend/.env.example`), el correo aparece en la consola del backend.

## Datos de demostración

`npm.cmd run db:demo` (en `backend/`) carga cuentas ficticias de Chillán y Coihueco con un historial coherente:
trabajos cerrados con pago, comisión, transferencia, chat, gastos y reseñas. La reputación sale de esas reseñas.
Se puede correr varias veces: no duplica ni borra nada. Contraseña de todas las cuentas: `demo1234`.

| Cuenta | Rol | Para mostrar |
|---|---|---|
| `ana.perez@demo.cl`, `carolina.munoz@demo.cl` (y 6 clientes más) | Cliente | Catálogo, pedir un servicio, pagar con Webpay, cerrar y calificar |
| `juan.soto@demo.cl` | Prestador (electricidad, SEC) | 14 trabajos, 4,6 ★, panel contable y pagos por transferir |
| `maria.fuentes@demo.cl` | Prestadora (electricidad, SEC) | Certificado por vencer y una disputa abierta |
| `luis.contreras@demo.cl` | Prestador (poda de altura) | Trabajos de campo y finanzas del mes |
| `contacto@agricolanuble.demo.cl` | Contratista agrícola | Pagos liberados sin datos bancarios (aviso en el panel) |
| `roberto.cifuentes@demo.cl` | Prestador nuevo | Sin reseñas: visibilidad inicial en el catálogo |
| `carlos.rivas@demo.cl`, `patricio.lagos@demo.cl` | Gasfiter y cerrajero | Oficios de urgencia (atienden de noche y fines de semana) |
| `esteban.ruiz@demo.cl` | Instalador de gas (SEC) | Oficio regulado verificado |
| `sergio.medina@demo.cl`, `andres.toro@demo.cl` | Carpintero y techumbre | Otros oficios del catálogo |
| `rodrigo.valdes@demo.cl` | Prestador | Verificación SEC por revisar (no aparece en el catálogo) |
| `admin@demo.cl` | Administración | Panel completo; `jorge.sepulveda@demo.cl` aparece en moderación |

## Pagos de prueba (Webpay, ambiente de integración)

No se mueve dinero real. Datos de prueba publicados por Transbank:

| Dato | Valor |
|---|---|
| Tarjeta de crédito Visa | `4051 8856 0044 6623` · CVV `123` · cualquier fecha futura |
| Autenticación del banco de prueba | RUT `11.111.111-1` · clave `123` → elegir "Aceptar" (o "Rechazar" para probar un rechazo) |

Fuente: https://www.transbankdevelopers.cl/documentacion/como_empezar#tarjetas-de-prueba

## Puesta en marcha de la app

Ver [mobile/README.md](mobile/README.md).

## Panel Web de Administración

Ver [admin/README.md](admin/README.md). Con el backend encendido:

```bash
cd admin
npm.cmd install
npm.cmd run dev             # panel en http://localhost:5173
```

## Servidor para el equipo (desde cualquier lugar)

El backend también entrega la versión web compilada, así todo queda en una sola dirección:
`/` Lite, `/pro` Pro, `/admin` panel y `/api` la API (que usan las APK).

```bash
cd mobile; npm.cmd run web:exportar        # compila Lite (dist-lite) y Pro (dist-pro)
cd admin; npm.cmd run build:servidor       # compila el panel para /admin
```

Desde la red local: `http://IP-DEL-PC:3000`. Desde internet, con [Tailscale](https://tailscale.com) instalado
en este PC y `TRUST_PROXY=loopback` en `backend/.env`:

```bash
tailscale funnel --bg 3000                 # publica https://delimaster.tail9c0ea1.ts.net
tailscale funnel --https=443 off           # deja de publicarlo
```

Antes de publicarlo, cambia la contraseña de `admin@demo.cl` (`npm.cmd run crear-admin -- --email admin@demo.cl
--nombre "Administrador DeliMaster"` en `backend/`). Para encender el servidor en modo estable (sin reinicios
automáticos): `node --env-file=.env src/server.js` en `backend/`. El PC debe quedar encendido y sin suspenderse mientras el equipo lo use. Después de cambiar código de
las apps o del panel, hay que volver a compilar la versión web (los dos primeros comandos).

## Pruebas automáticas

| Proyecto | Comando | Qué cubre |
|---|---|---|
| `backend/` | `npm.cmd test` | API completa contra la base `delimaster_test`: reglas de negocio, pagos simulados (Webpay y tarjeta guardada), plazos, llegada con GPS, avisos push, seguridad (242 pruebas) |
| `admin/` | `npm.cmd test` | Panel con la API simulada: sesión, verificaciones, disputas (también la devolución parcial), transferencias, moderación (34 pruebas) |
| `mobile/` | `npm.cmd test` | Apps Lite y Pro con la API simulada: rutas protegidas, cuentas, cola sin conexión, pedir un servicio, fotos, chat, pagos, gastos, avisos (109 pruebas) |

Las pruebas del panel y de las apps no necesitan el backend ni la base de datos.

## Seguridad

Análisis OWASP y configuración obligatoria para producción: [docs/seguridad-owasp.md](docs/seguridad-owasp.md).

## Avance por sprint

Ver [docs/plan-desarrollo.md](docs/plan-desarrollo.md).

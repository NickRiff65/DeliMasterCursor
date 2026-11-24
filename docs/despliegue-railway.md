# Despliegue de DeliMaster en Railway

Guía para pasar el piloto desde el PC con Tailscale a Railway, de modo que la app no dependa de que el PC esté encendido.
Cada paso indica **quién lo hace**: el equipo (en el navegador, con su cuenta) o Claude (en este PC, con la CLI).

## Cómo queda

```
Apps Android (Lite y Pro) ─┐
Web Lite  /                ├──►  Servicio «DeliMaster» en Railway  ──►  PostgreSQL de Railway
Web Pro   /pro             │     (API + web + panel, Node 24)       ──►  Disco /data (fotos)
Panel     /admin          ─┘     https://<nombre>.up.railway.app
```

- **Un solo servicio** compila y entrega todo, igual que hoy el PC: la API, la web de Lite y Pro y el panel. Lo arma el `package.json` de la raíz (`npm run build` y `npm start`).
- **PostgreSQL** es un servicio aparte dentro del mismo proyecto.
- **Las fotos** (boletas, evidencias y portafolio) van en un disco persistente montado en `/data`. Sin él, se borrarían en cada despliegue.
- **Las migraciones** se aplican solas antes de cada despliegue (`npm run migrate`).
- **Cada `git push`** a la rama `version-completa` del repositorio privado vuelve a desplegar.

## Costo

| Concepto | Valor |
|---|---|
| Plan Hobby | US$5 al mes, que incluyen US$5 de uso |
| Uso estimado (servidor ~0,4 GB de RAM, base ~0,2 GB, disco < 1 GB) | US$5 a 8 al mes |
| Correo (Brevo, hasta 300 al día) | Gratis |

Railway cobra por segundo de uso: si el mes consume US$3, se pagan US$5; si consume US$8, se pagan US$8.

## Antes de empezar

1. **El correo cambia.** En el plan Hobby, Railway bloquea los puertos SMTP, así que el Gmail del `.env` no funciona allá. El servidor ya sabe enviar por la API de **Brevo**, que usa HTTPS y es gratis hasta 300 correos al día. Sin correo no llegan los códigos para recuperar la contraseña ni los avisos por correo; los avisos dentro de la app y las notificaciones push siguen funcionando.
2. **El `JWT_SECRET` debe ser el mismo del PC.** Con él se cifran las cuentas bancarias y la tarjeta guardada; con otro, esos datos no se pueden leer. El script de variables lo copia solo.
3. **No hay región en Sudamérica.** Usen US West (California): desde Chillán son unos 150 ms por petición, que no se notan en la app.

---

## Parte 1. Cuentas (equipo, unos 20 minutos)

### 1.1 Railway

1. Entrar a https://railway.com y crear la cuenta con **GitHub**, usando la cuenta dueña del repositorio privado `LILSHAX-bot/DeliMaster`.
2. Contratar el plan **Hobby** con una tarjeta.
3. En **Usage** (uso) de la cuenta, definir un **límite de gasto**, por ejemplo US$10, o al menos una alerta por correo.
4. Para que los demás integrantes vean el proyecto, invitarlos desde la configuración del proyecto (**Members**).

### 1.2 Brevo (correo)

1. Crear una cuenta gratuita en https://www.brevo.com.
2. En **Senders, Domains & Dedicated IPs → Senders**, agregar el correo remitente (el del proyecto) y confirmarlo con el código que llega a ese correo.
3. En **SMTP & API → API Keys**, crear una clave llamada `railway` y guardarla para el paso 3.3. Es una clave secreta: no la manden por WhatsApp ni la peguen en el chat; va directo en Railway.

### 1.3 CLI de Railway en este PC

En PowerShell:

```powershell
npm.cmd install -g @railway/cli
```

```powershell
railway login
```

El segundo comando abre el navegador para autorizar el PC. Desde ahí, Claude puede ejecutar los pasos de la parte 4.

---

## Parte 2. Subir la preparación a GitHub (Claude)

Claude sube a `version-completa`, en el repositorio privado, el commit que deja el proyecto listo para Railway: `package.json` en la raíz, correo por Brevo, scripts de variables y de traspaso, y esta guía.

---

## Parte 3. Proyecto en Railway (equipo, en el navegador, unos 15 minutos)

### 3.1 Base de datos

1. **New Project → Deploy PostgreSQL.**
2. Dejar el nombre del servicio como **Postgres**: las variables lo usan con ese nombre.

### 3.2 Servicio de DeliMaster

1. En el mismo proyecto: **New → GitHub Repo → `LILSHAX-bot/DeliMaster`**.
2. En **Settings** del servicio:

| Opción | Valor |
|---|---|
| Nombre del servicio | `DeliMaster` |
| Source → Branch | `version-completa` |
| Root Directory | vacío (la raíz del repositorio) |
| Build Command | vacío (Railway usa `npm run build` del `package.json`) |
| Start Command | vacío (usa `npm start`) |
| **Pre-deploy Command** | `npm run migrate` |
| **Healthcheck Path** | `/api/salud` |
| Region | US West (California) |
| Serverless / App Sleeping | **Desactivado**: los plazos (respuesta, cierre a las 72 h) corren dentro del servidor |
| Restart Policy | On Failure |

3. El primer despliegue va a fallar porque todavía no hay variables. Es normal.

### 3.3 Variables

1. Claude genera en este PC el archivo `railway-variables.env` con `npm.cmd run variables-railway --prefix backend`. Toma los valores del `backend/.env` sin mostrarlos y Git lo excluye.
2. Abrir ese archivo, copiar todo y pegarlo en el servicio **DeliMaster → Variables → Raw Editor → Update Variables**.
3. Completar `BREVO_API_KEY` con la clave del paso 1.2 y revisar que `CORREO_REMITENTE` sea el correo confirmado en Brevo, por ejemplo `DeliMaster <correo@confirmado.cl>`.
4. **Borrar `railway-variables.env`** del PC.

Las variables con `${{...}}` las completa Railway: `DATABASE_URL` toma la base del servicio Postgres y `URL_PUBLICA_API` y `CORS_ORIGENES` toman el dominio público del servicio.

### 3.4 Disco para las fotos

1. Clic derecho sobre el servicio DeliMaster → **Attach Volume**.
2. Mount path: **`/data`**.

### 3.5 Dominio público

1. **Settings → Networking → Generate Domain.** Si pide un puerto, usar el que muestra Railway; la app lee la variable `PORT` que pone la plataforma.
2. Anotar la dirección, por ejemplo `https://delimaster-production.up.railway.app`.
3. Volver a desplegar (**Deploy**). Esta vez debe terminar en verde. Claude revisa el registro de compilación; la primera tarda varios minutos, porque compila la web de Lite, de Pro y el panel.

---

## Parte 4. Día del cambio (Claude, con el equipo avisado, unos 30 minutos)

Mientras dura, **nadie usa la app**, para que no se pierdan datos entre el PC y Railway.

| # | Paso | Quién |
|---|---|---|
| 1 | Avisar a los testers y apagar el servidor del PC (Ctrl+C en la ventana «Servidor DeliMaster») | Equipo |
| 2 | Respaldo final de la base del PC: `npm.cmd run respaldo --prefix backend` | Claude |
| 3 | Copiar la base a Railway y comparar los conteos (usuarios, solicitudes, pagos, mensajes, migraciones):<br>`railway run --service Postgres -- node --env-file=backend/.env backend/scripts/subir-base-railway.js backend/respaldos/<archivo>.dump` | Claude |
| 4 | Subir las fotos al disco: `railway volume files upload backend/uploads /uploads` | Claude |
| 5 | Reiniciar el servicio DeliMaster en Railway | Claude o equipo |
| 6 | Actualizar las apps Android por OTA con la nueva dirección (`EXPO_PUBLIC_API_URL=https://<dominio>/api`) y dejarla en `mobile/eas.json` | Claude |
| 7 | Pruebas de la parte 5 | Todos |
| 8 | Cerrar el link antiguo: `tailscale funnel --https=443 off` | Equipo |

El script del paso 3 reemplaza el contenido de la base de Railway y termina con «La base quedó igual que en el PC» solo si los conteos coinciden. Se probó contra una base temporal: 44 usuarios, 94 solicitudes, 90 pagos, 285 mensajes y 29 migraciones, todos iguales.

**Si algo falla antes del paso 6:** se vuelve a encender el servidor del PC y todo sigue como antes, porque las apps todavía apuntan a Tailscale.

---

## Parte 5. Pruebas después del cambio

- [ ] `https://<dominio>/api/salud` responde.
- [ ] Lite (`/`), Pro (`/pro`) y el panel (`/admin`) cargan y permiten iniciar sesión con una cuenta existente.
- [ ] Las solicitudes, chats y fotos antiguas se ven, incluidas boletas y portafolio.
- [ ] Una solicitud nueva con foto y con «Detectar el problema con la foto» (Gemini).
- [ ] Pago con Webpay de integración (tarjeta de prueba) y regreso a la app con el pago retenido.
- [ ] Llega una notificación push al maestro (APK, después de abrir la app dos veces para recibir el OTA).
- [ ] «Olvidé mi contraseña» envía el código por correo (Brevo).
- [ ] En el panel, una cuenta bancaria registrada se ve completa (confirma que el `JWT_SECRET` es el mismo).

## Problemas que nos pasaron (23-11-2026) y su solución

| Síntoma | Causa | Solución |
|---|---|---|
| Railway dice «We still can't find this repository» | La app de Railway estaba *autorizada* en GitHub, pero no *instalada* | Instalarla en https://github.com/apps/railway-app, solo con el repositorio DeliMaster |
| *Build failed* en segundos | Compilaba la rama `main`, que no tiene el `package.json` de la raíz | Settings → Source → rama `version-completa` |
| Todo responde 502 | El dominio se generó con un puerto distinto | El servidor escucha en el `PORT` de Railway (8080): editar el puerto del dominio |
| *Healthcheck failure* | `npm run migrate` quedó en **Start Command** | Start Command vacío; `npm run migrate` va en **Pre-deploy Command** |
| *Pre-deploy command failed* (error vacío) | Se pegaron las variables antes de crear Postgres y `DATABASE_URL` quedó vacía | Volver a definirla: `railway variables --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'` |

Desde el commit siguiente, el servidor no parte en producción sin `DATABASE_URL`, y los errores de conexión muestran el código y la dirección (por ejemplo, `ECONNREFUSED 127.0.0.1:5432`) en vez de quedar vacíos.

## Parte 6. Después

- **Nuevas versiones:** un `git push` a `version-completa` del repositorio privado despliega solo y aplica las migraciones. La web ya no se compila en el PC.
- **Registros:** en Railway, en el servicio → **Deployments → View logs**; o desde este PC con `railway logs`.
- **Respaldos:** activar los respaldos del servicio Postgres en Railway (**Backups**) si el plan los ofrece, y hacer de vez en cuando un respaldo local con `railway run --service Postgres` + `pg_dump`.
- **iPhone (web instalable):** quien la tenga instalada desde el link de Tailscale debe instalarla de nuevo desde el link de Railway.
- **Informe:** la arquitectura del piloto (sección 3.6) pasa de «PC + Tailscale» a «Railway». La Etapa B (Google Cloud Santiago) sigue igual.
- **Al terminar el semestre:** si ya no se usa, dar de baja el proyecto en Railway (**Settings → Danger**). Los datos del disco se borran 60 días después de cancelar el plan.

## Referencias

- Planes y precios: https://docs.railway.com/pricing/plans
- Discos (volumes) y su CLI: https://docs.railway.com/volumes · https://docs.railway.com/cli/volume
- Red saliente (SMTP solo en el plan Pro): https://docs.railway.com/networking/outbound-networking
- Regiones: https://docs.railway.com/deployments/regions
- Brevo, API de correo: https://www.brevo.com/features/email-api/

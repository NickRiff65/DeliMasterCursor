# DeliMaster · Panel Web de Administración

Herramienta interna del equipo (React + Vite). Usa la misma API que las apps.

| Sección | Para qué sirve | Historia |
|---|---|---|
| Resumen | Pendientes del equipo, dinero en la plataforma, servicios cerrados por mes e indicadores del informe | HU-14 |
| Verificaciones | Revisar certificados en la SEC/SAG; la SEC exige la fecha de vencimiento (3 meses) | HU-11, HU-17 |
| Disputas | Ver la evidencia (chat completo, pago, historial) y liberar el pago o reembolsar al cliente | HU-16 |
| Transferencias | Pagos liberados por prestador, con sus datos bancarios, y registro del comprobante | HU-13 |
| Moderación | Usuarios con mensajes bloqueados por el filtro y desactivación de cuentas | HU-04 |

## Puesta en marcha

Con el backend encendido (`npm.cmd run dev` en `backend/`):

```bash
npm.cmd install
npm.cmd run dev        # http://localhost:5173 (también desde otro equipo de la red)
```

La API se busca en el mismo equipo, puerto 3000. Para otra dirección, crea `admin/.env.local` con
`VITE_API_URL=https://api.ejemplo.cl/api`.

## Cuenta de administración

Los administradores no se registran por la app. Se crean desde `backend/`:

```bash
npm.cmd run crear-admin -- --email equipo@delimaster.cl --nombre "Equipo DeliMaster"
```

Con los datos de demostración existe `admin@demo.cl` (se crea con `demo1234`). **Antes de publicar el servidor en
internet, cámbiale la contraseña** con el mismo comando `crear-admin` y ese correo. La sesión se guarda
solo en la pestaña: se cierra al cerrarla.

## Pruebas automáticas

```bash
npm.cmd test           # una pasada (Vitest + Testing Library, navegador simulado con jsdom)
npm.cmd run test:watch # se repiten al guardar
```

No necesitan el backend: cada prueba simula las respuestas de la API y revisa lo que el panel
muestra y lo que envía. Cubren el ingreso (solo cuentas de administración, sesión por pestaña,
cierre al vencer el token), verificaciones SEC/SAG, la resolución de disputas con confirmación,
el registro de transferencias, la moderación de cuentas, el resumen con sus indicadores y el gráfico.

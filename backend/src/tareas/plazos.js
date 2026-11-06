// Los plazos del dinero no pueden depender de que alguien abra la app.
// Cada minuto se liberan las asignaciones sin respuesta, se cierran los trabajos
// que el cliente no confirmó, se devuelven las visitas a las que nadie llegó y se reintentan
// las devoluciones que Transbank no pudo hacer.
// El servicio se carga al encender el reloj para no exigir la base al importar este archivo.

const INTERVALO_MS = Number(process.env.PLAZOS_INTERVALO_MS ?? 60_000);

// `revisar` hace el trabajo; `programar` permite probar el reloj sin esperar un minuto real.
export function crearRelojPlazos(revisar, { intervaloMs = INTERVALO_MS, programar = setInterval } = {}) {
  const correr = () => {
    try {
      Promise.resolve(revisar()).catch((err) => {
        console.error(JSON.stringify({ evento: 'plazos', error: err.message }));
      });
    } catch (err) {
      console.error(JSON.stringify({ evento: 'plazos', error: err.message }));
    }
  };
  correr();
  const timer = programar(correr, intervaloMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function iniciarRelojPlazos() {
  console.log(`Revisión de plazos cada ${Math.round(INTERVALO_MS / 1000)} s`);
  return crearRelojPlazos(async () => {
    const { liberarVencidas } = await import('../modules/solicitudes/solicitudes.servicio.js');
    const { reintentarDevoluciones } = await import('../modules/pagos/pagos.servicio.js');
    return Promise.all([liberarVencidas(), reintentarDevoluciones()]);
  });
}

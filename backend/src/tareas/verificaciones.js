// Las verificaciones SEC vencen cada tres meses y nadie puede depender de acordarse.
// Este reloj revisa los vencimientos con la misma lógica del reloj de plazos (tareas/plazos.js):
// avisa al prestador antes de que venza y al vencer, una sola vez por hito.
// El intervalo por defecto es de 12 horas: los vencimientos se cuentan en días, no en minutos.

const INTERVALO_MS = Number(process.env.VERIFICACIONES_INTERVALO_MS ?? 12 * 60 * 60 * 1000);

// `revisar` hace el trabajo; `programar` permite probar el reloj sin esperar horas reales.
export function crearRelojVerificaciones(revisar, { intervaloMs = INTERVALO_MS, programar = setInterval } = {}) {
  const correr = () => {
    try {
      Promise.resolve(revisar()).catch((err) => {
        console.error(JSON.stringify({ evento: 'verificaciones', error: err.message }));
      });
    } catch (err) {
      console.error(JSON.stringify({ evento: 'verificaciones', error: err.message }));
    }
  };
  correr();
  const timer = programar(correr, intervaloMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function iniciarRelojVerificaciones() {
  console.log(`Revisión de vencimientos de verificaciones cada ${Math.round(INTERVALO_MS / 3_600_000)} h`);
  return crearRelojVerificaciones(async () => {
    const { revisarVencimientos, revalidarAutomaticas } = await import('../modules/verificaciones/verificaciones.servicio.js');
    return Promise.all([revisarVencimientos(), revalidarAutomaticas()]);
  });
}

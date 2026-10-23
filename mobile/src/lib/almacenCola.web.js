// HU-12: almacenamiento de la cola sin conexión en el navegador (solo para desarrollo y demostraciones).
// En web, expo-sqlite aún es experimental y exige cabeceras especiales; se usa localStorage.
const CLAVE = 'delimaster.cola_solicitudes';

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
  } catch {
    return [];
  }
}

function escribir(items) {
  localStorage.setItem(CLAVE, JSON.stringify(items));
}

export async function guardar(item) {
  escribir([...leer().filter((i) => i.id !== item.id), item]);
}

export async function listar(usuarioId) {
  return leer()
    .filter((i) => i.usuario_id === usuarioId)
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
}

export async function quitar(id) {
  escribir(leer().filter((i) => i.id !== id));
}

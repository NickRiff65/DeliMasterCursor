import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// En la web no hay cámara directa: se abre el selector de archivos, que en el celular ofrece
// tomar la foto o elegirla de la galería
export const CAMARA_DIRECTA = Platform.OS !== 'web';

// Elegir una foto con la cámara o desde la galería (ambas apps).
// Devuelve { base64, uri } o null si se cancela; lanza un error si no hay permiso de cámara.
export async function elegirFoto(desdeCamara) {
  const opciones = { mediaTypes: ['images'], quality: 0.6, base64: true };
  const camara = desdeCamara && CAMARA_DIRECTA;
  if (camara) {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) throw new Error('Necesitamos permiso para usar la cámara.');
  }
  const r = camara ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
  const foto = r.canceled ? null : r.assets?.[0];
  if (!foto?.base64) return null;
  return Platform.OS === 'web' ? reducirEnWeb(foto) : { base64: foto.base64, uri: foto.uri };
}

// En la web la foto llega tal cual (la del iPhone puede pesar varios MB): se reduce a 1600 px por lado
// y se comprime antes de subirla. Si el navegador no puede, se usa la original.
async function reducirEnWeb(foto) {
  try {
    const img = new window.Image();
    img.src = foto.uri;
    await img.decode();
    const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const uri = lienzo.toDataURL('image/jpeg', 0.7);
    return { base64: uri.split(',')[1], uri };
  } catch {
    return { base64: foto.base64, uri: foto.uri };
  }
}

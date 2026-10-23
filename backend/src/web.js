import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

// Versión web de las apps y panel de administración ya compilados, servidos desde la misma
// dirección que la API (así el equipo usa un solo enlace y no hay problemas de CORS):
//   /       DeliMaster Lite   (mobile: npm.cmd run web:exportar)
//   /pro    DeliMaster Pro
//   /admin  Panel             (admin: npm.cmd run build:servidor)
// Si una carpeta no existe, esa parte simplemente no se publica.
const RAIZ = path.resolve(import.meta.dirname, '..', '..');

const sitios = () => [
  ['/admin', process.env.CARPETA_WEB_ADMIN ?? path.join(RAIZ, 'admin', 'dist')],
  ['/pro', process.env.CARPETA_WEB_PRO ?? path.join(RAIZ, 'mobile', 'dist-pro')],
  ['/', process.env.CARPETA_WEB_LITE ?? path.join(RAIZ, 'mobile', 'dist-lite')],
];

// index.html nunca se guarda en caché (apunta a los archivos de la versión vigente);
// los demás llevan un hash en el nombre y pueden guardarse.
const sinCache = (res) => res.set('Cache-Control', 'no-cache');

export function servirWeb(app) {
  const publicados = [];
  for (const [prefijo, carpeta] of sitios()) {
    const indice = path.join(carpeta, 'index.html');
    if (!fs.existsSync(indice)) continue;

    app.use(prefijo, express.static(carpeta, {
      maxAge: '7d',
      redirect: false,          // /pro y /pro/ muestran lo mismo (sin redirigir)
      setHeaders: (res, archivo) => { if (archivo.endsWith('.html')) sinCache(res); },
    }));
    // Rutas de la app (por ejemplo /solicitud/123 al recargar): se entrega index.html y el
    // enrutador de la app muestra la pantalla. La API y Socket.io siguen su propio camino.
    app.use(prefijo, (req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html')) return next();
      if (/^\/(api|socket\.io)(\/|$)/.test(req.originalUrl)) return next();
      sinCache(res);
      res.sendFile(indice);
    });
    publicados.push(prefijo);
  }
  return publicados;
}

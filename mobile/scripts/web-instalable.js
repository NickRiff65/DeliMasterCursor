// Convierte la versión web compilada (dist-lite y dist-pro) en una app instalable:
// en el iPhone, "Agregar a pantalla de inicio" la deja con su ícono y nombre, y se abre a
// pantalla completa, sin la barra de Safari. Se ejecuta al final de "npm.cmd run web:exportar".
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const APPS = [
  { carpeta: 'dist-lite', iconos: 'lite', base: '/', nombre: 'DeliMaster Lite', corto: 'DeliMaster', color: '#0F766E' },
  { carpeta: 'dist-pro', iconos: 'pro', base: '/pro/', nombre: 'DeliMaster Pro', corto: 'DM Pro', color: '#1F2937' },
];

for (const app of APPS) {
  const dist = path.join(RAIZ, app.carpeta);
  const indice = path.join(dist, 'index.html');
  if (!fs.existsSync(indice)) {
    console.warn(`(se omite ${app.carpeta}: no está compilada)`);
    continue;
  }

  // Íconos (sin transparencia: iOS pone fondo negro si la hay)
  const origen = path.join(RAIZ, 'assets', 'web', app.iconos);
  for (const archivo of ['apple-touch-icon.png', 'icono-192.png', 'icono-512.png']) {
    fs.copyFileSync(path.join(origen, archivo), path.join(dist, archivo));
  }
  fs.copyFileSync(path.join(origen, 'favicon.png'), path.join(dist, 'favicon.png'));

  // Manifiesto de la app web (Android/Chrome lo usan para instalar; iOS toma nombre e íconos)
  const manifiesto = {
    name: app.nombre,
    short_name: app.corto,
    lang: 'es-CL',
    start_url: app.base,
    scope: app.base,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F9FAFB',
    theme_color: app.color,
    icons: [
      { src: `${app.base}icono-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${app.base}icono-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${app.base}icono-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  fs.writeFileSync(path.join(dist, 'manifest.json'), `${JSON.stringify(manifiesto, null, 2)}\n`);

  const etiquetas = [
    `<link rel="manifest" href="${app.base}manifest.json" />`,
    `<link rel="apple-touch-icon" href="${app.base}apple-touch-icon.png" />`,
    `<link rel="icon" type="image/png" href="${app.base}favicon.png" />`,
    `<meta name="theme-color" content="${app.color}" />`,
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    `<meta name="apple-mobile-web-app-title" content="${app.corto}" />`,
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<meta name="format-detection" content="telephone=no" />',
  ].join('\n    ');

  let html = fs.readFileSync(indice, 'utf8')
    .replace('<html lang="en">', '<html lang="es">')
    .replace(/<link rel="icon" href="[^"]*favicon\.ico"\s*\/?>/, '')   // reemplazado por el ícono de DeliMaster
    .replace(/\s*<!-- delimaster:instalable -->[\s\S]*?<!-- \/delimaster:instalable -->/, '');
  html = html.replace('</head>', `    <!-- delimaster:instalable -->\n    ${etiquetas}\n    <!-- /delimaster:instalable -->\n  </head>`);
  fs.writeFileSync(indice, html);
  console.log(`✔ ${app.carpeta}: instalable como "${app.corto}" (${app.base})`);
}

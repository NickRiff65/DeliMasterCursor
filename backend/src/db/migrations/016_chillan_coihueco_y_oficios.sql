-- =====================================================================
-- DeliMaster 2.0 · Migración 016 · Cobertura Chillán y Coihueco, y más oficios
-- =====================================================================

-- ---------------------------------------------------------------- cobertura
-- DeliMaster se concentra en Chillán (zona urbana) y Coihueco (zona rural). Las cuentas con otra
-- comuna pasan a Chillán (Chillán Viejo, que es parte de la misma ciudad) o quedan sin comuna.
-- Las solicitudes antiguas conservan su comuna como historial.
UPDATE usuarios SET comuna = CASE WHEN comuna = 'Chillán Viejo' THEN 'Chillán' END
 WHERE comuna IS NOT NULL AND comuna NOT IN ('Chillán', 'Coihueco');

-- Cada maestro atiende solo las comunas cubiertas; si no le quedaba ninguna, queda en Chillán
UPDATE prestadores
   SET comunas_atendidas = COALESCE(
         NULLIF(ARRAY(SELECT c FROM unnest(comunas_atendidas) c WHERE c IN ('Chillán', 'Coihueco')), '{}'),
         '{Chillán}')
 WHERE NOT comunas_atendidas <@ '{Chillán,Coihueco}'::text[];

-- ---------------------------------------------------------------- oficios
-- Se habilitan los oficios y trabajos de campo que estaban en espera…
UPDATE categorias SET activa = true
 WHERE slug IN ('gasfiteria', 'cerrajeria', 'mecanica', 'tala', 'riego', 'preparacion-suelo', 'agroquimicos', 'cercos');

-- …con palabras clave revisadas para las urgencias más comunes (minúsculas, sin tildes)
UPDATE categorias SET palabras_clave = v.claves FROM (VALUES
  ('gasfiteria', '{gasfiter,gasfiteria,caneria,canerias,fuga de agua,desague,lavaplatos,wc,inodoro,filtracion,tapado,destapar,llave de agua,lavamanos,ducha}'::text[]),
  ('cerrajeria', '{cerrajero,cerrajeria,cerradura,chapa,llave,llaves,candado,abrir puerta,puerta trabada,copia de llave}'::text[])
) AS v(slug, claves)
WHERE categorias.slug = v.slug;

-- …y se agregan oficios nuevos. Las instalaciones de gas exigen un instalador autorizado por la SEC,
-- igual que la electricidad: solo aparecen en el catálogo con la verificación aprobada.
INSERT INTO categorias (slug, nombre, tipo, requiere_verificacion, organismo, palabras_clave, activa) VALUES
  ('gas', 'Instalaciones de gas', 'oficio', true, 'SEC',
     '{gas,instalador de gas,olor a gas,fuga de gas,balon,cilindro,calefont,estufa a gas,cocina a gas,medidor de gas}', true),
  ('carpinteria', 'Carpintería', 'oficio', false, NULL,
     '{carpintero,carpinteria,madera,mueble,muebles,closet,repisa,puerta de madera,piso flotante,terraza}', true),
  ('pintura', 'Pintura', 'oficio', false, NULL,
     '{pintor,pintura,pintar,muralla,murallas,fachada,esmalte,latex,barniz}', true),
  ('albanileria', 'Albañilería y construcción menor', 'oficio', false, NULL,
     '{albanil,albanileria,ceramica,ceramico,radier,ladrillo,estuco,baldosa,ampliacion,construccion}', true),
  ('techumbre', 'Techumbre y canaletas', 'oficio', false, NULL,
     '{techo,techumbre,gotera,goteras,canaleta,canaletas,zinc,teja,tejas,hojalatero,hojalateria,bajada de agua}', true),
  ('electrodomesticos', 'Reparación de electrodomésticos', 'oficio', false, NULL,
     '{lavadora,refrigerador,refrigeradora,secadora,microondas,electrodomestico,electrodomesticos,linea blanca,congelador,lavavajillas}', true),
  ('vidrieria', 'Vidriería', 'oficio', false, NULL,
     '{vidrio,vidrios,vidriero,vidrieria,ventana rota,cristal,ventanal,termopanel}', true),
  ('jardineria', 'Jardinería y mantención de patios', 'campo', false, NULL,
     '{jardin,jardineria,jardinero,pasto,cesped,cortar pasto,desmalezar,maleza,malezas}', true)
ON CONFLICT (slug) DO NOTHING;

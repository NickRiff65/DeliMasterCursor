-- =====================================================================
-- DeliMaster 2.0 · Migración 004 · Ciclo de vida de las solicitudes (HU-05, HU-08)
-- =====================================================================

ALTER TABLE solicitudes
  ADD COLUMN asignada_en   TIMESTAMPTZ,  -- inicio del plazo de respuesta del prestador (HU-05)
  ADD COLUMN confirmada_en TIMESTAMPTZ;

-- Solicitudes esperando respuesta de un prestador (para liberar las que vencen)
CREATE INDEX solicitudes_asignadas ON solicitudes (asignada_en) WHERE estado = 'asignada';

-- Palabras clave revisadas para la interpretación en lenguaje natural (minúsculas, sin tildes).
-- Las de 4 letras o menos solo coinciden exactas ("auto" no debe coincidir con "automatico").
UPDATE categorias SET palabras_clave = v.claves FROM (VALUES
  ('electricidad',      '{electricista,electricidad,electrico,electrica,enchufe,luz,cortocircuito,tablero,automatico,cable,interruptor,lampara}'::text[]),
  ('poda-altura',       '{poda,podar,arbol,rama,ramas,altura}'::text[]),
  ('gasfiteria',        '{gasfiter,gasfiteria,caneria,fuga,desague,lavaplatos,wc,calefont,filtracion,tapado}'::text[]),
  ('cerrajeria',        '{cerrajero,cerrajeria,cerradura,chapa,llave}'::text[]),
  ('mecanica',          '{mecanico,mecanica,auto,motor,frenos,vehiculo,camioneta,embrague}'::text[]),
  ('tala',              '{tala,talar,cortar arbol,botar arbol,volteo}'::text[]),
  ('riego',             '{riego,regar,regadio,goteo,aspersor,canal}'::text[]),
  ('preparacion-suelo', '{arar,arado,rastraje,tractor}'::text[]),
  ('agroquimicos',      '{fumigar,fumigacion,plaguicida,agroquimico,pulverizar,plaga}'::text[]),
  ('cercos',            '{cerco,alambrado,ganado,cerco electrico}'::text[])
) AS v(slug, claves)
WHERE categorias.slug = v.slug;

-- Coherencia: una solicitud asignada en adelante siempre tiene prestador
ALTER TABLE solicitudes ADD CONSTRAINT solicitud_con_prestador CHECK (
  estado IN ('creada', 'cancelada') OR prestador_id IS NOT NULL
);

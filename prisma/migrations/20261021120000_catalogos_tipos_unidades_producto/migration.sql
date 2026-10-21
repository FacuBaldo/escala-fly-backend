-- Tipos de producto y unidades de medida pasan a ser catalogos administrables.
--
-- Antes: el tipo era el enum "TipoProducto" y la unidad de medida un texto libre.
-- Despues: dos tablas globales y el producto apunta a ellas por clave foranea.
--
-- La migracion que genera Prisma por defecto borra las columnas viejas y agrega
-- las nuevas como NOT NULL, lo que falla con productos ya cargados y pierde sus
-- datos. Esta version las completa a partir de los valores existentes y termina
-- con el mismo esquema que describe schema.prisma.

-- Todo en una transaccion: si un paso falla, la tabla queda como estaba en vez
-- de quedar a medio migrar.
BEGIN;

-- 1. Renombrar el enum viejo: en Postgres cada tabla crea un tipo con su mismo
--    nombre, asi que "TipoProducto" choca con la tabla nueva.
ALTER TYPE "TipoProducto" RENAME TO "TipoProducto_anterior";

-- 2. Tablas nuevas
CREATE TABLE "TipoProducto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoProducto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UnidadMedida" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnidadMedida_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TipoProducto_nombre_key" ON "TipoProducto"("nombre");
CREATE UNIQUE INDEX "UnidadMedida_nombre_key" ON "UnidadMedida"("nombre");
CREATE UNIQUE INDEX "UnidadMedida_abreviatura_key" ON "UnidadMedida"("abreviatura");

-- 3. Valores iniciales: los seis tipos del enum y las unidades mas usadas en aplicacion
INSERT INTO "TipoProducto" ("id", "nombre", "updatedAt") VALUES
    (gen_random_uuid()::text, 'Herbicida', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Fungicida', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Insecticida', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Fertilizante', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Coadyuvante', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Otro', CURRENT_TIMESTAMP);

INSERT INTO "UnidadMedida" ("id", "nombre", "abreviatura", "updatedAt") VALUES
    (gen_random_uuid()::text, 'Litros', 'L', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Centimetros cubicos', 'cc', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Kilogramos', 'kg', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Gramos', 'g', CURRENT_TIMESTAMP);

-- 4. Columnas nuevas, primero opcionales para poder completarlas
ALTER TABLE "Producto" ADD COLUMN "tipoId" TEXT;
ALTER TABLE "Producto" ADD COLUMN "unidadMedidaId" TEXT;

-- 4a. Tipo: cada valor del enum va a su fila equivalente
UPDATE "Producto" p
SET "tipoId" = t."id"
FROM "TipoProducto" t
WHERE t."nombre" = CASE p."tipo"::text
    WHEN 'HERBICIDA' THEN 'Herbicida'
    WHEN 'FUNGICIDA' THEN 'Fungicida'
    WHEN 'INSECTICIDA' THEN 'Insecticida'
    WHEN 'FERTILIZANTE' THEN 'Fertilizante'
    WHEN 'COADYUVANTE' THEN 'Coadyuvante'
    ELSE 'Otro'
END;

-- 4b. Unidad: las formas habituales de escribir cada unidad se unifican
UPDATE "Producto" p
SET "unidadMedidaId" = u."id"
FROM "UnidadMedida" u
WHERE u."abreviatura" = CASE lower(trim(p."unidadMedida"))
    WHEN 'l' THEN 'L'
    WHEN 'lt' THEN 'L'
    WHEN 'lts' THEN 'L'
    WHEN 'litro' THEN 'L'
    WHEN 'litros' THEN 'L'
    WHEN 'cc' THEN 'cc'
    WHEN 'cm3' THEN 'cc'
    WHEN 'ml' THEN 'cc'
    WHEN 'kg' THEN 'kg'
    WHEN 'kgs' THEN 'kg'
    WHEN 'kilo' THEN 'kg'
    WHEN 'kilos' THEN 'kg'
    WHEN 'kilogramo' THEN 'kg'
    WHEN 'kilogramos' THEN 'kg'
    WHEN 'g' THEN 'g'
    WHEN 'gr' THEN 'g'
    WHEN 'grs' THEN 'g'
    WHEN 'gramo' THEN 'g'
    WHEN 'gramos' THEN 'g'
END;

-- 4c. Cualquier otro texto se conserva como una unidad nueva para no perder el dato
INSERT INTO "UnidadMedida" ("id", "nombre", "abreviatura", "updatedAt")
SELECT gen_random_uuid()::text, texto, texto, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT trim("unidadMedida") AS texto
    FROM "Producto"
    WHERE "unidadMedidaId" IS NULL AND trim("unidadMedida") <> ''
) pendientes
ON CONFLICT DO NOTHING;

UPDATE "Producto" p
SET "unidadMedidaId" = u."id"
FROM "UnidadMedida" u
WHERE p."unidadMedidaId" IS NULL
  AND (lower(u."abreviatura") = lower(trim(p."unidadMedida"))
       OR lower(u."nombre") = lower(trim(p."unidadMedida")));

-- 4d. Si quedara un producto sin unidad (texto vacio), se le asigna Litros
UPDATE "Producto"
SET "unidadMedidaId" = (SELECT "id" FROM "UnidadMedida" WHERE "abreviatura" = 'L')
WHERE "unidadMedidaId" IS NULL;

-- 5. Ya completas, pasan a obligatorias y se borra lo viejo
ALTER TABLE "Producto" ALTER COLUMN "tipoId" SET NOT NULL;
ALTER TABLE "Producto" ALTER COLUMN "unidadMedidaId" SET NOT NULL;

ALTER TABLE "Producto" DROP COLUMN "tipo";
ALTER TABLE "Producto" DROP COLUMN "unidadMedida";

DROP TYPE "TipoProducto_anterior";

-- 6. Indices y claves foraneas. RESTRICT impide borrar un tipo o unidad en uso.
CREATE INDEX "Producto_tipoId_idx" ON "Producto"("tipoId");
CREATE INDEX "Producto_unidadMedidaId_idx" ON "Producto"("unidadMedidaId");

ALTER TABLE "Producto" ADD CONSTRAINT "Producto_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_unidadMedidaId_fkey" FOREIGN KEY ("unidadMedidaId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

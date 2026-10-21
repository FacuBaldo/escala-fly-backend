-- Giros reales y patrones de trabajo en la generación de rutas.
--
-- Solo agrega columnas con valor por defecto: no modifica ni borra datos.
-- - Aeronave.radioGiroMetros: radio con el que gira el avión (opcional, como el
--   resto de sus datos de aplicación).
-- - OrdenTrabajo.radioGiroMetros y patron: los parámetros con los que se calcula
--   la ruta. Las órdenes existentes quedan con 200 m y patrón automático.
-- - PlanVuelo.patron y distanciaGirosMetros: qué patrón eligió el planificador y
--   cuánto se vuela en giros. Los planes existentes se calcularon con el modelo
--   anterior (ida y vuelta con giros rectos): quedan como IDA_Y_VUELTA con 0 m de
--   giros, y la API los marca como desactualizados para que se regeneren.

BEGIN;

CREATE TYPE "PatronVuelo" AS ENUM ('AUTOMATICO', 'IDA_Y_VUELTA', 'REDONDO');

ALTER TABLE "Aeronave" ADD COLUMN "radioGiroMetros" DOUBLE PRECISION;

ALTER TABLE "OrdenTrabajo"
    ADD COLUMN "patron" "PatronVuelo" NOT NULL DEFAULT 'AUTOMATICO',
    ADD COLUMN "radioGiroMetros" DOUBLE PRECISION NOT NULL DEFAULT 200;

ALTER TABLE "PlanVuelo"
    ADD COLUMN "distanciaGirosMetros" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "patron" "PatronVuelo" NOT NULL DEFAULT 'IDA_Y_VUELTA';

COMMIT;

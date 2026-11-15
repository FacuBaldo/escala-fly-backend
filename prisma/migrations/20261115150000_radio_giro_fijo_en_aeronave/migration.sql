-- Sprint 4: el radio de giro queda fijo en la aeronave.
--
-- El interesado indicó que el radio no se puede conocer en cada orden y que no
-- cambia: es un dato del avión. Lo habitual es 300-350 m (antes se usaba 200 m).
-- - Aeronave.radioGiroMetros pasa a ser obligatorio con 300 m por defecto. Las
--   aeronaves que no lo tenían cargado quedan con 300 m.
-- - OrdenTrabajo.radioGiroMetros se mantiene como copia del radio con el que se
--   calculó la ruta (no se modifican las órdenes existentes); solo cambia su
--   valor por defecto.

BEGIN;

UPDATE "Aeronave" SET "radioGiroMetros" = 300 WHERE "radioGiroMetros" IS NULL;

ALTER TABLE "Aeronave"
    ALTER COLUMN "radioGiroMetros" SET DEFAULT 300,
    ALTER COLUMN "radioGiroMetros" SET NOT NULL;

ALTER TABLE "OrdenTrabajo"
    ALTER COLUMN "radioGiroMetros" SET DEFAULT 300;

COMMIT;

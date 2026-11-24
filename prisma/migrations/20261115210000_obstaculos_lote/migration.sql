-- Sprint 4: obstaculos del lote (molino, casa, galpon, silo, cable).
--
-- Solo agrega un enum y una tabla nueva: no modifica ni borra datos.
-- Se borran en cascada con el lote.

BEGIN;

-- CreateEnum
CREATE TYPE "TipoObstaculo" AS ENUM ('MOLINO', 'CASA', 'GALPON', 'SILO', 'CABLE', 'OTRO');

-- CreateTable
CREATE TABLE "Obstaculo" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "tipo" "TipoObstaculo" NOT NULL,
    "nombre" TEXT,
    "alturaMetros" DOUBLE PRECISION,
    "geometria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obstaculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Obstaculo_loteId_idx" ON "Obstaculo"("loteId");

-- AddForeignKey
ALTER TABLE "Obstaculo" ADD CONSTRAINT "Obstaculo_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;

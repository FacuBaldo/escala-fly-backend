-- Ensure PostGIS is active
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "Lote" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "superficie" DOUBLE PRECISION,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "geometria" geometry(Polygon, 4326) NOT NULL,
    "campoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lote_campoId_idx" ON "Lote"("campoId");

-- CreateSpatialIndex
CREATE INDEX "Lote_geometria_idx" ON "Lote" USING GIST ("geometria");

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "Campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

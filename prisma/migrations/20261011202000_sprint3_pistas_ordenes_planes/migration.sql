-- Ensure PostGIS is active
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('PENDIENTE', 'PLANIFICADA', 'EN_EJECUCION', 'FINALIZADA', 'CANCELADA');

-- CreateTable Pista
CREATE TABLE "Pista" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ubicacion" geometry(Point, 4326) NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pista_pkey" PRIMARY KEY ("id")
);

-- AlterTable Lote
ALTER TABLE "Lote" ADD COLUMN "pistaPrincipalId" TEXT;
ALTER TABLE "Lote" ADD COLUMN "pistaCargaId" TEXT;

-- AlterTable Aeronave
ALTER TABLE "Aeronave" ADD COLUMN "capacidadUtilLitros" DOUBLE PRECISION;
ALTER TABLE "Aeronave" ADD COLUMN "anchoAplicacionMetros" DOUBLE PRECISION;

-- CreateTable OrdenTrabajo
CREATE TABLE "OrdenTrabajo" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "empresaId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "aeronaveId" TEXT NOT NULL,
    "anchoAplicacionMetros" DOUBLE PRECISION NOT NULL,
    "litrosPorHectarea" DOUBLE PRECISION NOT NULL,
    "capacidadUtilLitros" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoOrden" NOT NULL DEFAULT 'PLANIFICADA',
    "observaciones" TEXT,
    "fechaPrevista" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenTrabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable OrdenProducto
CREATE TABLE "OrdenProducto" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "dosisPorHectarea" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlanVuelo
CREATE TABLE "PlanVuelo" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "orientacionGrados" DOUBLE PRECISION NOT NULL,
    "cantidadPasadas" INTEGER NOT NULL,
    "cantidadViajes" INTEGER NOT NULL,
    "superficieHa" DOUBLE PRECISION NOT NULL,
    "caldoTotalLitros" DOUBLE PRECISION NOT NULL,
    "distanciaTotalMetros" DOUBLE PRECISION NOT NULL,
    "distanciaAplicacionMetros" DOUBLE PRECISION NOT NULL,
    "distanciaTrasladoMetros" DOUBLE PRECISION NOT NULL,
    "parametros" JSONB NOT NULL,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanVuelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable Viaje
CREATE TABLE "Viaje" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "pistaSalidaId" TEXT,
    "pistaSalidaNombre" TEXT NOT NULL,
    "tipoSalida" TEXT NOT NULL,
    "pistaLlegadaId" TEXT,
    "pistaLlegadaNombre" TEXT NOT NULL,
    "tipoLlegada" TEXT NOT NULL,
    "caldoLitros" DOUBLE PRECISION NOT NULL,
    "superficieHa" DOUBLE PRECISION NOT NULL,
    "distanciaMetros" DOUBLE PRECISION NOT NULL,
    "distanciaAplicacionMetros" DOUBLE PRECISION NOT NULL,
    "distanciaTrasladoMetros" DOUBLE PRECISION NOT NULL,
    "recorrido" geometry(LineString, 4326) NOT NULL,
    "tramosAplicacion" geometry(MultiLineString, 4326) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex Pista
CREATE INDEX "Pista_empresaId_idx" ON "Pista"("empresaId");
CREATE INDEX "Pista_ubicacion_idx" ON "Pista" USING GIST ("ubicacion");

-- CreateIndex Lote
CREATE INDEX "Lote_pistaPrincipalId_idx" ON "Lote"("pistaPrincipalId");
CREATE INDEX "Lote_pistaCargaId_idx" ON "Lote"("pistaCargaId");

-- CreateIndex OrdenTrabajo
CREATE INDEX "OrdenTrabajo_empresaId_idx" ON "OrdenTrabajo"("empresaId");
CREATE INDEX "OrdenTrabajo_loteId_idx" ON "OrdenTrabajo"("loteId");
CREATE INDEX "OrdenTrabajo_aeronaveId_idx" ON "OrdenTrabajo"("aeronaveId");

-- CreateIndex OrdenProducto
CREATE UNIQUE INDEX "OrdenProducto_ordenId_productoId_key" ON "OrdenProducto"("ordenId", "productoId");
CREATE INDEX "OrdenProducto_ordenId_idx" ON "OrdenProducto"("ordenId");
CREATE INDEX "OrdenProducto_productoId_idx" ON "OrdenProducto"("productoId");

-- CreateIndex PlanVuelo
CREATE UNIQUE INDEX "PlanVuelo_ordenId_key" ON "PlanVuelo"("ordenId");

-- CreateIndex Viaje
CREATE INDEX "Viaje_planId_idx" ON "Viaje"("planId");
CREATE INDEX "Viaje_recorrido_idx" ON "Viaje" USING GIST ("recorrido");

-- AddForeignKey Pista
ALTER TABLE "Pista" ADD CONSTRAINT "Pista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey Lote
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_pistaPrincipalId_fkey" FOREIGN KEY ("pistaPrincipalId") REFERENCES "Pista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_pistaCargaId_fkey" FOREIGN KEY ("pistaCargaId") REFERENCES "Pista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey OrdenTrabajo
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_aeronaveId_fkey" FOREIGN KEY ("aeronaveId") REFERENCES "Aeronave"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey OrdenProducto
ALTER TABLE "OrdenProducto" ADD CONSTRAINT "OrdenProducto_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrdenProducto" ADD CONSTRAINT "OrdenProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey PlanVuelo
ALTER TABLE "PlanVuelo" ADD CONSTRAINT "PlanVuelo_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Viaje
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanVuelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

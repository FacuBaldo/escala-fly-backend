-- Sprint 4: reparto de productos por vuelo y orden para el cargador.
--
-- Solo agrega una columna opcional y una tabla nueva: no modifica ni borra datos.
-- - OrdenProducto.cantidadTotalCliente: cuánto producto trajo el cliente.
-- - CargaProducto: cuánto de cada producto lleva cada carga (viaje) del plan.
--   Se calcula al generar la ruta; el encargado lo puede corregir (manual = true).

BEGIN;

-- AlterTable
ALTER TABLE "OrdenProducto" ADD COLUMN     "cantidadTotalCliente" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CargaProducto" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "numeroViaje" INTEGER NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "cantidadAutomatica" DOUBLE PRECISION NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargaProducto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CargaProducto_ordenId_idx" ON "CargaProducto"("ordenId");

-- CreateIndex
CREATE INDEX "CargaProducto_productoId_idx" ON "CargaProducto"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "CargaProducto_ordenId_numeroViaje_productoId_key" ON "CargaProducto"("ordenId", "numeroViaje", "productoId");

-- AddForeignKey
ALTER TABLE "CargaProducto" ADD CONSTRAINT "CargaProducto_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaProducto" ADD CONSTRAINT "CargaProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;

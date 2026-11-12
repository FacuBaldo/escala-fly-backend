ALTER TABLE "OrdenTrabajo" ADD COLUMN "clienteId" TEXT;
CREATE INDEX "OrdenTrabajo_clienteId_idx" ON "OrdenTrabajo"("clienteId");
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrdenTrabajo" ADD COLUMN "pilotoId" TEXT;
CREATE INDEX "OrdenTrabajo_pilotoId_idx" ON "OrdenTrabajo"("pilotoId");
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_pilotoId_fkey"
  FOREIGN KEY ("pilotoId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

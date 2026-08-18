-- AlterTable
ALTER TABLE "Aeronave" ADD COLUMN "empresaId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Aeronave" ADD CONSTRAINT "Aeronave_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "Rol" RENAME VALUE 'AGROPECUARIO' TO 'CLIENTE';

CREATE INDEX IF NOT EXISTS "Campo_empresaId_idx" ON "Campo"("empresaId");
CREATE INDEX IF NOT EXISTS "Aeronave_empresaId_idx" ON "Aeronave"("empresaId");
CREATE INDEX IF NOT EXISTS "Usuario_empresaId_idx" ON "Usuario"("empresaId");
CREATE INDEX IF NOT EXISTS "Producto_empresaId_idx" ON "Producto"("empresaId");

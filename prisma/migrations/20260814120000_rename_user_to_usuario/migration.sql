ALTER TYPE "Role" RENAME TO "Rol";

ALTER TABLE "User" RENAME TO "Usuario";
ALTER TABLE "Usuario" RENAME COLUMN "firstName" TO "nombre";
ALTER TABLE "Usuario" RENAME COLUMN "lastName" TO "apellido";
ALTER TABLE "Usuario" RENAME COLUMN "password" TO "contrasena";
ALTER TABLE "Usuario" RENAME COLUMN "role" TO "rol";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_pkey') THEN
    ALTER TABLE "Usuario" RENAME CONSTRAINT "User_pkey" TO "Usuario_pkey";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_empresaId_fkey') THEN
    ALTER TABLE "Usuario" RENAME CONSTRAINT "User_empresaId_fkey" TO "Usuario_empresaId_fkey";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'User_email_key') THEN
    ALTER INDEX "User_email_key" RENAME TO "Usuario_email_key";
  END IF;
END $$;

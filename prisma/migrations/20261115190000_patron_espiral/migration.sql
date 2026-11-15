-- Sprint 4: patron de trabajo ESPIRAL.
--
-- Sin BEGIN/COMMIT a proposito: en PostgreSQL, un valor agregado a un enum con
-- ALTER TYPE ... ADD VALUE no se puede usar dentro de la misma transaccion.

ALTER TYPE "PatronVuelo" ADD VALUE IF NOT EXISTS 'ESPIRAL';

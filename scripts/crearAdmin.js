/**
 * Crea (o actualiza la contrasena de) un usuario ADMIN.
 * Permite inicializar una base nueva, ya que todas las rutas de usuarios requieren un token.
 *
 * Uso:
 *   npm run crear-admin -- <email> <contrasena> [nombre] [apellido]
 */
require("dotenv").config();

const bcrypt = require("bcryptjs");
const prisma = require("../configs/prisma");
const { LONGITUD_MINIMA_CONTRASENA, esEmailValido, normalizeEmail } = require("../utils/validacion");

const main = async () => {
  const [emailArg, contrasena, nombre = "Admin", apellido = "Escala Fly"] = process.argv.slice(2);

  if (!esEmailValido(emailArg) || !contrasena) {
    console.error("Uso: npm run crear-admin -- <email> <contrasena> [nombre] [apellido]");
    process.exitCode = 1;
    return;
  }

  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
    console.error(`La contrasena debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`);
    process.exitCode = 1;
    return;
  }

  const email = normalizeEmail(emailArg);
  const contrasenaHasheada = await bcrypt.hash(contrasena, 10);

  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: { contrasena: contrasenaHasheada, rol: "ADMIN", empresaId: null },
    create: { nombre, apellido, email, contrasena: contrasenaHasheada, rol: "ADMIN" },
    select: { id: true, email: true, rol: true }
  });

  console.log(`Usuario ADMIN listo: ${usuario.email} (${usuario.id})`);
};

main()
  .catch((error) => {
    console.error("No se pudo crear el administrador:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

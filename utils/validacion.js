const { Prisma } = require("@prisma/client");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MINIMA_CONTRASENA = 8;

const esTextoNoVacio = (valor) => typeof valor === "string" && valor.trim().length > 0;

const esTextoOpcional = (valor) => valor === undefined || valor === null || typeof valor === "string";

const esEmailValido = (valor) => typeof valor === "string" && EMAIL_REGEX.test(valor.trim());

const esValorDeEnum = (valor, valoresPermitidos) => valoresPermitidos.includes(valor);

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
};

const esErrorPrisma = (error, codigo) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === codigo;
};

const isRecordNotFound = (error) => esErrorPrisma(error, "P2025");
const isUniqueConstraint = (error) => esErrorPrisma(error, "P2002");
const isForeignKeyError = (error) => esErrorPrisma(error, "P2003");

module.exports = {
  LONGITUD_MINIMA_CONTRASENA,
  esEmailValido,
  esTextoNoVacio,
  esTextoOpcional,
  esValorDeEnum,
  isForeignKeyError,
  isRecordNotFound,
  isUniqueConstraint,
  normalizeEmail
};

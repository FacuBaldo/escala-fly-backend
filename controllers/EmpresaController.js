const prisma = require("../configs/prisma");
const { isAdmin } = require("../utils/autorizacion");
const {
  esEmailValido,
  esTextoNoVacio,
  esTextoOpcional,
  isForeignKeyError,
  isRecordNotFound,
  normalizeEmail
} = require("../utils/validacion");

const empresaSelect = {
  id: true,
  nombre: true,
  email: true,
  telefono: true,
  createdAt: true,
  updatedAt: true
};

/**
 * Valida y normaliza los datos de una empresa. Devuelve { error } o { data }.
 */
const getDatosEmpresa = (body) => {
  const { nombre, email, telefono } = body;

  if (!esTextoNoVacio(nombre)) {
    return { error: "El nombre de la empresa es obligatorio" };
  }

  if (!esTextoOpcional(email) || !esTextoOpcional(telefono)) {
    return { error: "El correo electronico y el telefono deben ser texto" };
  }

  if (email && !esEmailValido(email)) {
    return { error: "El correo electronico de la empresa no es valido" };
  }

  return {
    data: {
      nombre: nombre.trim(),
      email: email ? normalizeEmail(email) : null,
      telefono: telefono ? telefono.trim() : null
    }
  };
};

const createEmpresa = async (req, res) => {
  try {
    const { data, error } = getDatosEmpresa(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const empresa = await prisma.empresa.create({
      data,
      select: empresaSelect
    });

    return res.status(201).json(empresa);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo crear la empresa" });
  }
};

const getEmpresas = async (req, res) => {
  try {
    const empresas = await prisma.empresa.findMany({
      where: isAdmin(req) ? undefined : { id: req.auth.empresaId },
      select: empresaSelect,
      orderBy: { createdAt: "desc" }
    });

    return res.json(empresas);
  } catch (error) {
    return res.status(500).json({ message: "No se pudieron cargar las empresas" });
  }
};

const getEmpresaById = async (req, res) => {
  try {
    if (!isAdmin(req) && req.params.id !== req.auth.empresaId) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id },
      select: empresaSelect
    });

    if (!empresa) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    return res.json(empresa);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar la empresa" });
  }
};

const updateEmpresa = async (req, res) => {
  try {
    const { data, error } = getDatosEmpresa(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    if (!isAdmin(req) && req.params.id !== req.auth.empresaId) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    const empresa = await prisma.empresa.update({
      where: { id: isAdmin(req) ? req.params.id : req.auth.empresaId },
      data,
      select: empresaSelect
    });

    return res.json(empresa);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "La empresa no existe" });
    }
    return res.status(500).json({ message: "No se pudo actualizar la empresa" });
  }
};

/**
 * DELETE /api/empresas/:id (solo ADMIN)
 * Elimina la empresa junto con todos sus datos asociados: usuarios, campos y sus lotes,
 * productos y aeronaves. Todo se ejecuta en una transaccion: si algo falla no se borra nada.
 */
const deleteEmpresa = async (req, res) => {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.params.id },
      select: empresaSelect
    });

    if (!empresa) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    const eliminados = await prisma.$transaction(async (tx) => {
      const where = { empresaId: empresa.id };

      // Los lotes dependen de los campos, por eso se eliminan primero
      const lotes = await tx.$executeRawUnsafe(
        `DELETE FROM "Lote" WHERE "campoId" IN (SELECT "id" FROM "Campo" WHERE "empresaId" = $1);`,
        empresa.id
      );
      const campos = await tx.campo.deleteMany({ where });
      const productos = await tx.producto.deleteMany({ where });
      const aeronaves = await tx.aeronave.deleteMany({ where });
      const usuarios = await tx.usuario.deleteMany({ where });

      await tx.empresa.delete({ where: { id: empresa.id } });

      return {
        usuarios: usuarios.count,
        campos: campos.count,
        lotes,
        productos: productos.count,
        aeronaves: aeronaves.count
      };
    }, { timeout: 20000 });

    return res.json({ ...empresa, eliminados });
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "La empresa no existe" });
    }
    if (isForeignKeyError(error)) {
      return res.status(409).json({ message: "No se pudo eliminar la empresa porque tiene datos asociados que no se pueden eliminar" });
    }

    console.error("Error al eliminar empresa:", error);
    return res.status(500).json({ message: "No se pudo eliminar la empresa" });
  }
};

module.exports = {
  createEmpresa,
  deleteEmpresa,
  getEmpresaById,
  getEmpresas,
  updateEmpresa
};

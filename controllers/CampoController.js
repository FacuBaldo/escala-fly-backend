const { Prisma } = require("@prisma/client");
const prisma = require("../configs/prisma");

const campoSelect = {
  id: true,
  nombre: true,
  ubicacion: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true
};

const hasRequiredCampoFields = ({ nombre, empresaId }) => {
  return Boolean(nombre) && Boolean(empresaId);
};

const isRecordNotFound = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

const isForeignKeyError = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const createCampo = async (req, res) => {
  try {
    const { nombre, ubicacion, empresaId } = req.body;

    if (!hasRequiredCampoFields({ nombre, empresaId })) {
      return res.status(400).json({ message: "El nombre y la empresa del campo son obligatorios" });
    }

    const campo = await prisma.campo.create({
      data: {
        nombre,
        ubicacion,
        empresaId
      },
      select: campoSelect
    });

    return res.status(201).json(campo);
  } catch (error) {
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }
    return res.status(500).json({ message: "No se pudo crear el campo" });
  }
};

const getCampos = async (req, res) => {
  try {
    const { empresaId } = req.query;

    const campos = await prisma.campo.findMany({
      where: empresaId ? { empresaId } : undefined,
      select: campoSelect,
      orderBy: { createdAt: "desc" }
    });

    return res.json(campos);
  } catch (error) {
    return res.status(500).json({ message: "No se pudieron cargar los campos" });
  }
};

const getCampoById = async (req, res) => {
  try {
    const campo = await prisma.campo.findUnique({
      where: { id: req.params.id },
      select: campoSelect
    });

    if (!campo) {
      return res.status(404).json({ message: "El campo no existe" });
    }

    return res.json(campo);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar el campo" });
  }
};

const updateCampo = async (req, res) => {
  try {
    const { nombre, ubicacion, empresaId } = req.body;

    if (!hasRequiredCampoFields({ nombre, empresaId })) {
      return res.status(400).json({ message: "El nombre y la empresa del campo son obligatorios" });
    }

    const campo = await prisma.campo.update({
      where: { id: req.params.id },
      data: {
        nombre,
        ubicacion,
        empresaId
      },
      select: campoSelect
    });

    return res.json(campo);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El campo no existe" });
    }
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }
    return res.status(500).json({ message: "No se pudo actualizar el campo" });
  }
};

const deleteCampo = async (req, res) => {
  try {
    const campo = await prisma.campo.delete({
      where: { id: req.params.id },
      select: campoSelect
    });

    return res.json(campo);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El campo no existe" });
    }

    return res.status(500).json({ message: "No se pudo eliminar el campo" });
  }
};

module.exports = {
  createCampo,
  deleteCampo,
  getCampoById,
  getCampos,
  updateCampo
};

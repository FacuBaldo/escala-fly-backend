const { Prisma } = require("@prisma/client");
const prisma = require("../configs/prisma");
const { isAdmin } = require("../utils/autorizacion");

const empresaSelect = {
  id: true,
  nombre: true,
  email: true,
  telefono: true,
  createdAt: true,
  updatedAt: true
};

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
};

const hasRequiredEmpresaFields = ({ nombre }) => {
  return Boolean(nombre);
};

const isRecordNotFound = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

const createEmpresa = async (req, res) => {
  try {
    const { nombre, telefono } = req.body;
    const email = req.body.email ? normalizeEmail(req.body.email) : null;

    if (!hasRequiredEmpresaFields({ nombre })) {
      return res.status(400).json({ message: "El nombre de la empresa es obligatorio" });
    }

    const empresa = await prisma.empresa.create({
      data: {
        nombre,
        email,
        telefono
      },
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
    const { nombre, telefono } = req.body;
    const email = req.body.email ? normalizeEmail(req.body.email) : null;

    if (!hasRequiredEmpresaFields({ nombre })) {
      return res.status(400).json({ message: "El nombre de la empresa es obligatorio" });
    }

    if (!isAdmin(req) && req.params.id !== req.auth.empresaId) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    const empresa = await prisma.empresa.update({
      where: { id: isAdmin(req) ? req.params.id : req.auth.empresaId },
      data: {
        nombre,
        email,
        telefono
      },
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

const deleteEmpresa = async (req, res) => {
  try {
    const empresa = await prisma.empresa.delete({
      where: { id: req.params.id },
      select: empresaSelect
    });

    return res.json(empresa);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

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

const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const prisma = require("../configs/prisma");

const SALT_ROUNDS = 10;

const usuarioSelect = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  rol: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true
};

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
};

const hasRequiredUsuarioFields = ({ nombre, apellido, email, contrasena }) => {
  return Boolean(nombre && apellido && email && contrasena);
};

const isRecordNotFound = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

const isUniqueConstraint = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
};

const createUsuario = async (req, res) => {
  try {
    const { nombre, apellido, contrasena, rol, empresaId } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!hasRequiredUsuarioFields({ nombre, apellido, email, contrasena })) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    const contrasenaHasheada = await bcrypt.hash(contrasena, SALT_ROUNDS);

    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        apellido,
        email,
        contrasena: contrasenaHasheada,
        rol,
        empresaId: empresaId || null
      },
      select: usuarioSelect
    });

    return res.status(201).json(usuario);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return res.status(409).json({ message: "El correo electronico ya esta registrado" });
    }

    return res.status(500).json({ message: "No se pudo crear el usuario" });
  }
};

const getUsuarios = async (_req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: usuarioSelect,
      orderBy: { createdAt: "desc" }
    });

    return res.json(usuarios);
  } catch (error) {
    return res.status(500).json({ message: "No se pudieron cargar los usuarios" });
  }
};

const getUsuarioById = async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.params.id },
      select: usuarioSelect
    });

    if (!usuario) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    return res.json(usuario);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar el usuario" });
  }
};

const updateUsuario = async (req, res) => {
  try {
    const { nombre, apellido, contrasena, rol, empresaId } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!hasRequiredUsuarioFields({ nombre, apellido, email, contrasena })) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    const contrasenaHasheada = await bcrypt.hash(contrasena, SALT_ROUNDS);

    const usuario = await prisma.usuario.update({
      where: { id: req.params.id },
      data: {
        nombre,
        apellido,
        email,
        contrasena: contrasenaHasheada,
        rol,
        empresaId: empresaId || null
      },
      select: usuarioSelect
    });

    return res.json(usuario);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    if (isUniqueConstraint(error)) {
      return res.status(409).json({ message: "El correo electronico ya esta registrado" });
    }

    return res.status(500).json({ message: "No se pudo actualizar el usuario" });
  }
};

const deleteUsuario = async (req, res) => {
  try {
    const usuario = await prisma.usuario.delete({
      where: { id: req.params.id },
      select: usuarioSelect
    });

    return res.json(usuario);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    return res.status(500).json({ message: "No se pudo eliminar el usuario" });
  }
};

module.exports = {
  createUsuario,
  deleteUsuario,
  getUsuarioById,
  getUsuarios,
  updateUsuario
};

const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const prisma = require("../configs/prisma");
const { ROLES, isAdmin } = require("../utils/autorizacion");

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

const hasRequiredUsuarioUpdateFields = ({ nombre, apellido, email }) => {
  return Boolean(nombre && apellido && email);
};

const isRecordNotFound = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

const isUniqueConstraint = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
};

const isForeignKeyError = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const getRolesAsignables = (req) => {
  return isAdmin(req)
    ? Object.values(ROLES)
    : [ROLES.ENCARGADO, ROLES.PILOTO, ROLES.CLIENTE];
};

const getUsuarioDataAutorizada = async (req, contrasenaHasheada, usuarioActual = {}) => {
  const rol = req.body.rol || usuarioActual.rol || ROLES.CLIENTE;
  const empresaId = isAdmin(req)
    ? req.body.empresaId || usuarioActual.empresaId || null
    : req.auth.empresaId;

  if (!getRolesAsignables(req).includes(rol)) {
    return { error: { status: 403, message: "No tenes permisos para asignar ese rol" } };
  }

  if (rol !== ROLES.ADMIN && !empresaId) {
    return { error: { status: 400, message: "La empresa es obligatoria para este rol" } };
  }

  return {
    data: {
      nombre: req.body.nombre,
      apellido: req.body.apellido,
      email: normalizeEmail(req.body.email),
      rol,
      empresaId: rol === ROLES.ADMIN ? null : empresaId,
      ...(contrasenaHasheada ? { contrasena: contrasenaHasheada } : {})
    }
  };
};

const createUsuario = async (req, res) => {
  try {
    const { nombre, apellido, contrasena } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!hasRequiredUsuarioFields({ nombre, apellido, email, contrasena })) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    const contrasenaHasheada = await bcrypt.hash(contrasena, SALT_ROUNDS);
    const { data, error } = await getUsuarioDataAutorizada(req, contrasenaHasheada);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const usuario = await prisma.usuario.create({
      data,
      select: usuarioSelect
    });

    return res.status(201).json(usuario);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return res.status(409).json({ message: "El correo electronico ya esta registrado" });
    }
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }

    return res.status(500).json({ message: "No se pudo crear el usuario" });
  }
};

const getUsuarios = async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: isAdmin(req) ? undefined : { empresaId: req.auth.empresaId },
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
    const usuario = await prisma.usuario.findFirst({
      where: {
        id: req.params.id,
        ...(isAdmin(req) ? {} : { empresaId: req.auth.empresaId })
      },
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
    const { nombre, apellido, contrasena } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!hasRequiredUsuarioUpdateFields({ nombre, apellido, email })) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    const usuarioActual = await prisma.usuario.findFirst({
      where: {
        id: req.params.id,
        ...(isAdmin(req) ? {} : { empresaId: req.auth.empresaId })
      },
      select: { id: true, rol: true, empresaId: true }
    });

    if (!usuarioActual) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    const contrasenaHasheada = contrasena ? await bcrypt.hash(contrasena, SALT_ROUNDS) : null;
    const { data, error } = await getUsuarioDataAutorizada(req, contrasenaHasheada, usuarioActual);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const usuario = await prisma.usuario.update({
      where: { id: usuarioActual.id },
      data,
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
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }

    return res.status(500).json({ message: "No se pudo actualizar el usuario" });
  }
};

const deleteUsuario = async (req, res) => {
  try {
    const usuarioActual = await prisma.usuario.findFirst({
      where: {
        id: req.params.id,
        ...(isAdmin(req) ? {} : { empresaId: req.auth.empresaId })
      },
      select: { id: true }
    });

    if (!usuarioActual) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    const usuario = await prisma.usuario.delete({
      where: { id: usuarioActual.id },
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

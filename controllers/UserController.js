const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const prisma = require("../configs/prisma");

const SALT_ROUNDS = 10;

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  createdAt: true,
  updatedAt: true
};

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
};

const hasRequiredUserFields = ({ firstName, lastName, email, password }) => {
  return Boolean(firstName && lastName && email && password);
};

const isRecordNotFound = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

const isUniqueConstraint = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
};

const createUser = async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!hasRequiredUserFields({ firstName, lastName, email, password })) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword
      },
      select: userSelect
    });

    return res.status(201).json(user);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return res.status(409).json({ message: "El correo electronico ya esta registrado" });
    }

    return res.status(500).json({ message: "No se pudo crear el usuario" });
  }
};

const getUsers = async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: "desc" }
    });

    return res.json(users);
  } catch (error) {
    return res.status(500).json({ message: "No se pudieron cargar los usuarios" });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: userSelect
    });

    if (!user) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar el usuario" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!hasRequiredUserFields({ firstName, lastName, email, password })) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword
      },
      select: userSelect
    });

    return res.json(user);
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

const deleteUser = async (req, res) => {
  try {
    const user = await prisma.user.delete({
      where: { id: req.params.id },
      select: userSelect
    });

    return res.json(user);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    return res.status(500).json({ message: "No se pudo eliminar el usuario" });
  }
};

module.exports = {
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  updateUser
};

const bcrypt = require("bcryptjs");
const prisma = require("../configs/prisma");
const { ROLES, isAdmin } = require("../utils/autorizacion");
const {
  LONGITUD_MINIMA_CONTRASENA,
  esEmailValido,
  esTextoNoVacio,
  esValorDeEnum,
  isForeignKeyError,
  isRecordNotFound,
  isUniqueConstraint,
  normalizeEmail
} = require("../utils/validacion");

const SALT_ROUNDS = 10;

// Roles que un ENCARGADO puede crear, editar o eliminar dentro de su empresa
const ROLES_GESTIONABLES_POR_ENCARGADO = [ROLES.PILOTO, ROLES.CLIENTE];

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

/**
 * Valida los datos recibidos. Devuelve un mensaje de error o null si son validos.
 */
const validarDatosUsuario = (body, { requiereContrasena }) => {
  const { nombre, apellido, email, contrasena, rol, empresaId } = body;

  if (!esTextoNoVacio(nombre) || !esTextoNoVacio(apellido) || !esTextoNoVacio(email)) {
    return "Todos los campos son obligatorios";
  }

  if (!esEmailValido(email)) {
    return "El correo electronico no es valido";
  }

  if (requiereContrasena && !esTextoNoVacio(contrasena)) {
    return "Todos los campos son obligatorios";
  }

  if (contrasena !== undefined && contrasena !== null && contrasena !== "") {
    if (typeof contrasena !== "string" || contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
      return `La contrasena debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`;
    }
  }

  if (rol !== undefined && rol !== "" && !esValorDeEnum(rol, Object.values(ROLES))) {
    return "El rol no es valido";
  }

  if (empresaId !== undefined && empresaId !== null && typeof empresaId !== "string") {
    return "La empresa no es valida";
  }

  return null;
};

/**
 * Un ENCARGADO solo puede gestionar pilotos y clientes de su empresa, ademas de su propio perfil.
 */
const puedeGestionarUsuario = (req, usuarioObjetivo) => {
  if (isAdmin(req)) {
    return true;
  }

  return usuarioObjetivo.id === req.auth.usuarioId || ROLES_GESTIONABLES_POR_ENCARGADO.includes(usuarioObjetivo.rol);
};

const getUsuarioDataAutorizada = (req, contrasenaHasheada, usuarioActual = null) => {
  const rol = req.body.rol || usuarioActual?.rol || ROLES.CLIENTE;
  const cambiaRol = !usuarioActual || rol !== usuarioActual.rol;
  const esPropioUsuario = usuarioActual?.id === req.auth.usuarioId;
  const empresaId = isAdmin(req)
    ? req.body.empresaId || usuarioActual?.empresaId || null
    : req.auth.empresaId;

  if (esPropioUsuario && cambiaRol) {
    return { error: { status: 403, message: "No podes cambiar tu propio rol" } };
  }

  if (cambiaRol && !isAdmin(req) && !ROLES_GESTIONABLES_POR_ENCARGADO.includes(rol)) {
    return { error: { status: 403, message: "No tenes permisos para asignar ese rol" } };
  }

  if (rol !== ROLES.ADMIN && !empresaId) {
    return { error: { status: 400, message: "La empresa es obligatoria para este rol" } };
  }

  return {
    data: {
      nombre: req.body.nombre.trim(),
      apellido: req.body.apellido.trim(),
      email: normalizeEmail(req.body.email),
      rol,
      empresaId: rol === ROLES.ADMIN ? null : empresaId,
      ...(contrasenaHasheada ? { contrasena: contrasenaHasheada } : {})
    }
  };
};

const getWhereUsuarioPorId = (req) => ({
  id: req.params.id,
  ...(isAdmin(req) ? {} : { empresaId: req.auth.empresaId })
});

const createUsuario = async (req, res) => {
  try {
    const errorValidacion = validarDatosUsuario(req.body, { requiereContrasena: true });

    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const { data, error } = getUsuarioDataAutorizada(req, null);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const contrasenaHasheada = await bcrypt.hash(req.body.contrasena, SALT_ROUNDS);

    const usuario = await prisma.usuario.create({
      data: { ...data, contrasena: contrasenaHasheada },
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
      where: getWhereUsuarioPorId(req),
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
    const errorValidacion = validarDatosUsuario(req.body, { requiereContrasena: false });

    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const usuarioActual = await prisma.usuario.findFirst({
      where: getWhereUsuarioPorId(req),
      select: { id: true, rol: true, empresaId: true }
    });

    if (!usuarioActual) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    if (!puedeGestionarUsuario(req, usuarioActual)) {
      return res.status(403).json({ message: "No tenes permisos para modificar este usuario" });
    }

    const { data, error } = getUsuarioDataAutorizada(req, null, usuarioActual);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const { contrasena } = req.body;
    const contrasenaHasheada = contrasena ? await bcrypt.hash(contrasena, SALT_ROUNDS) : null;

    const usuario = await prisma.usuario.update({
      where: { id: usuarioActual.id },
      data: { ...data, ...(contrasenaHasheada ? { contrasena: contrasenaHasheada } : {}) },
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
    if (req.params.id === req.auth.usuarioId) {
      return res.status(403).json({ message: "No podes eliminar tu propio usuario" });
    }

    const usuarioActual = await prisma.usuario.findFirst({
      where: getWhereUsuarioPorId(req),
      select: { id: true, rol: true }
    });

    if (!usuarioActual) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    if (!puedeGestionarUsuario(req, usuarioActual)) {
      return res.status(403).json({ message: "No tenes permisos para eliminar este usuario" });
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

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../configs/prisma");

const usuarioConContrasenaSelect = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  contrasena: true,
  rol: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true
};

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
};

const iniciarSesion = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { contrasena } = req.body;

    if (!email || !contrasena) {
      return res.status(400).json({ message: "El correo electronico y la contrasena son obligatorios" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "La autenticacion no esta configurada correctamente" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      select: usuarioConContrasenaSelect
    });

    if (!usuario) {
      return res.status(401).json({ message: "Correo o contrasena incorrectos" });
    }

    const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);

    if (!contrasenaValida) {
      return res.status(401).json({ message: "Correo o contrasena incorrectos" });
    }

    const token = jwt.sign(
      { sub: usuario.id, email: usuario.email, rol: usuario.rol, empresaId: usuario.empresaId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const { contrasena: _contrasena, ...usuarioSinContrasena } = usuario;

    return res.json({
      token,
      usuario: usuarioSinContrasena
    });
  } catch (error) {
    return res.status(500).json({ message: "No se pudo iniciar sesion" });
  }
};

const getSesionActual = async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.auth.usuarioId },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      email: true,
      rol: true,
      empresaId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!usuario) {
    return res.status(401).json({ message: "Token invalido" });
  }

  return res.json(usuario);
};

module.exports = {
  getSesionActual,
  iniciarSesion
};

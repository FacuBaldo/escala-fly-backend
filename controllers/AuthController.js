const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../configs/prisma");

const userWithPasswordSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  password: true,
  createdAt: true,
  updatedAt: true
};

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
};

const login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "El correo electronico y la contrasena son obligatorios" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "La autenticacion no esta configurada correctamente" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: userWithPasswordSelect
    });

    if (!user) {
      return res.status(401).json({ message: "Correo o contrasena incorrectos" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Correo o contrasena incorrectos" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const { password: _password, ...userWithoutPassword } = user;

    return res.json({
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    return res.status(500).json({ message: "No se pudo iniciar sesion" });
  }
};

module.exports = {
  login
};

const jwt = require("jsonwebtoken");
const prisma = require("../configs/prisma");

const verificarToken = async (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token requerido" });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "La autenticacion no esta configurada correctamente" });
  }

  const token = authorizationHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const usuarioId = payload.sub || payload.id;

    if (!usuarioId) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        email: true,
        rol: true,
        empresaId: true
      }
    });

    if (!usuario) {
      return res.status(401).json({ message: "Token invalido" });
    }

    if (usuario.rol !== "ADMIN" && !usuario.empresaId) {
      return res.status(403).json({ message: "El usuario no tiene una empresa asignada" });
    }

    req.usuario = usuario;
    req.auth = {
      usuarioId: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      empresaId: usuario.empresaId
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalido" });
  }
};

module.exports = verificarToken;

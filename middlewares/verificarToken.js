const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token requerido" });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "La autenticacion no esta configurada correctamente" });
  }

  const token = authorizationHeader.split(" ")[1];

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalido" });
  }
};

module.exports = verificarToken;

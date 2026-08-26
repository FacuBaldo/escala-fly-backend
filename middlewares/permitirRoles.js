const permitirRoles = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ message: "Token requerido" });
    }

    if (!rolesPermitidos.includes(req.auth.rol)) {
      return res.status(403).json({ message: "No tenes permisos para realizar esta accion" });
    }

    return next();
  };
};

module.exports = permitirRoles;

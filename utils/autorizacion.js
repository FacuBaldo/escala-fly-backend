const ROLES = {
  ADMIN: "ADMIN",
  ENCARGADO: "ENCARGADO",
  PILOTO: "PILOTO",
  CLIENTE: "CLIENTE"
};

const isAdmin = (req) => req.auth?.rol === ROLES.ADMIN;

const getEmpresaIdParaLectura = (req) => {
  return isAdmin(req) ? req.query.empresaId : req.auth.empresaId;
};

const getEmpresaIdParaEscritura = (req) => {
  return isAdmin(req) ? req.body.empresaId : req.auth.empresaId;
};

const getWhereEmpresa = (req, extraWhere = {}) => {
  const empresaId = getEmpresaIdParaLectura(req);
  return {
    ...extraWhere,
    ...(empresaId ? { empresaId } : {})
  };
};

const getWhereRecursoPorId = (req) => {
  return {
    id: req.params.id,
    ...(isAdmin(req) ? {} : { empresaId: req.auth.empresaId })
  };
};

module.exports = {
  ROLES,
  getEmpresaIdParaEscritura,
  getEmpresaIdParaLectura,
  getWhereEmpresa,
  getWhereRecursoPorId,
  isAdmin
};

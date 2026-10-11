const prisma = require("../configs/prisma");
const { getEmpresaIdParaEscritura, getWhereEmpresa, getWhereRecursoPorId } = require("../utils/autorizacion");
const {
  esTextoNoVacio,
  esTextoOpcional,
  isForeignKeyError,
  isRecordNotFound,
  isUniqueConstraint
} = require("../utils/validacion");

const ESTADOS_VALIDOS = ["ACTIVA", "EN_MANTENIMIENTO", "INACTIVA"];

const aeronaveSelect = {
  id: true,
  matricula: true,
  modelo: true,
  fabricante: true,
  estado: true,
  capacidadUtilLitros: true,
  anchoAplicacionMetros: true,
  observaciones: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true
};

const normalizeMatricula = (matricula) => {
  return typeof matricula === "string" ? matricula.trim().toUpperCase() : matricula;
};

const hasRequiredAeronaveFields = ({ matricula, modelo, empresaId }) => {
  return esTextoNoVacio(matricula) && esTextoNoVacio(modelo) && esTextoNoVacio(empresaId);
};

const isEstadoValido = (estado) => {
  return estado === undefined || estado === "" || ESTADOS_VALIDOS.includes(estado);
};

const hasTiposOpcionalesValidos = ({ fabricante, observaciones, capacidadUtilLitros, anchoAplicacionMetros }) => {
  const fabOk = esTextoOpcional(fabricante);
  const obsOk = esTextoOpcional(observaciones);
  const capOk =
    capacidadUtilLitros === undefined ||
    capacidadUtilLitros === null ||
    capacidadUtilLitros === "" ||
    (Number(capacidadUtilLitros) > 0 && Number.isFinite(Number(capacidadUtilLitros)));
  const anchoOk =
    anchoAplicacionMetros === undefined ||
    anchoAplicacionMetros === null ||
    anchoAplicacionMetros === "" ||
    (Number(anchoAplicacionMetros) > 0 && Number.isFinite(Number(anchoAplicacionMetros)));

  return fabOk && obsOk && capOk && anchoOk;
};

const buildAeronaveData = (body, empresaId) => {
  const { modelo, fabricante, estado, observaciones, capacidadUtilLitros, anchoAplicacionMetros } = body;
  const matricula = normalizeMatricula(body.matricula);

  return {
    matricula,
    modelo: modelo.trim(),
    fabricante: fabricante ? fabricante.trim() : null,
    estado: estado || undefined,
    capacidadUtilLitros:
      capacidadUtilLitros !== undefined && capacidadUtilLitros !== null && capacidadUtilLitros !== ""
        ? Number(capacidadUtilLitros)
        : null,
    anchoAplicacionMetros:
      anchoAplicacionMetros !== undefined && anchoAplicacionMetros !== null && anchoAplicacionMetros !== ""
        ? Number(anchoAplicacionMetros)
        : null,
    observaciones: observaciones ? observaciones.trim() : null,
    empresaId
  };
};

const createAeronave = async (req, res) => {
  try {
    const matricula = normalizeMatricula(req.body.matricula);
    const { modelo } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!hasRequiredAeronaveFields({ matricula, modelo, empresaId })) {
      return res.status(400).json({ message: "La matricula, el modelo y la empresa de la aeronave son obligatorios" });
    }

    if (!isEstadoValido(req.body.estado)) {
      return res.status(400).json({ message: "El estado de la aeronave no es valido" });
    }

    if (!hasTiposOpcionalesValidos(req.body)) {
      return res.status(400).json({ message: "El fabricante y las observaciones deben ser texto" });
    }

    const aeronave = await prisma.aeronave.create({
      data: buildAeronaveData(req.body, empresaId),
      select: aeronaveSelect
    });

    return res.status(201).json(aeronave);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return res.status(409).json({ message: "Ya existe una aeronave con esa matricula" });
    }
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }
    return res.status(500).json({ message: "No se pudo crear la aeronave" });
  }
};

const getAeronaves = async (req, res) => {
  try {
    const { estado } = req.query;

    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: "El estado de la aeronave no es valido" });
    }

    const aeronaves = await prisma.aeronave.findMany({
      where: getWhereEmpresa(req, estado ? { estado } : {}),
      select: aeronaveSelect,
      orderBy: { createdAt: "desc" }
    });

    return res.json(aeronaves);
  } catch (error) {
    return res.status(500).json({ message: "No se pudieron cargar las aeronaves" });
  }
};

const getAeronaveById = async (req, res) => {
  try {
    const aeronave = await prisma.aeronave.findFirst({
      where: getWhereRecursoPorId(req),
      select: aeronaveSelect
    });

    if (!aeronave) {
      return res.status(404).json({ message: "La aeronave no existe" });
    }

    return res.json(aeronave);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar la aeronave" });
  }
};

const updateAeronave = async (req, res) => {
  try {
    const matricula = normalizeMatricula(req.body.matricula);
    const { modelo } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!hasRequiredAeronaveFields({ matricula, modelo, empresaId })) {
      return res.status(400).json({ message: "La matricula, el modelo y la empresa de la aeronave son obligatorios" });
    }

    if (!isEstadoValido(req.body.estado)) {
      return res.status(400).json({ message: "El estado de la aeronave no es valido" });
    }

    if (!hasTiposOpcionalesValidos(req.body)) {
      return res.status(400).json({ message: "El fabricante y las observaciones deben ser texto" });
    }

    const aeronaveActual = await prisma.aeronave.findFirst({
      where: getWhereRecursoPorId(req),
      select: { id: true }
    });

    if (!aeronaveActual) {
      return res.status(404).json({ message: "La aeronave no existe" });
    }

    const aeronave = await prisma.aeronave.update({
      where: { id: aeronaveActual.id },
      data: buildAeronaveData(req.body, empresaId),
      select: aeronaveSelect
    });

    return res.json(aeronave);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "La aeronave no existe" });
    }
    if (isUniqueConstraint(error)) {
      return res.status(409).json({ message: "Ya existe una aeronave con esa matricula" });
    }
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }
    return res.status(500).json({ message: "No se pudo actualizar la aeronave" });
  }
};

const deleteAeronave = async (req, res) => {
  try {
    const aeronaveActual = await prisma.aeronave.findFirst({
      where: getWhereRecursoPorId(req),
      select: { id: true }
    });

    if (!aeronaveActual) {
      return res.status(404).json({ message: "La aeronave no existe" });
    }

    const aeronave = await prisma.aeronave.delete({
      where: { id: aeronaveActual.id },
      select: aeronaveSelect
    });

    return res.json(aeronave);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "La aeronave no existe" });
    }
    if (isForeignKeyError(error)) {
      return res.status(409).json({ message: "No se puede eliminar la aeronave porque tiene órdenes de trabajo asociadas" });
    }

    return res.status(500).json({ message: "No se pudo eliminar la aeronave" });
  }
};

module.exports = {
  createAeronave,
  deleteAeronave,
  getAeronaveById,
  getAeronaves,
  updateAeronave
};

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
  radioGiroMetros: true,
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

const estaVacio = (valor) => valor === undefined || valor === null || valor === "";

const numeroOpcional = (valor) => (estaVacio(valor) ? null : Number(valor));

// Radio de giro razonable para un avión agrícola: menos de 30 m o más de 1 km es un error de carga
const RADIO_GIRO_MINIMO = 30;
const RADIO_GIRO_MAXIMO = 1000;

/**
 * Valida los campos opcionales. Devuelve el mensaje del primer error, o null.
 * Antes un número inválido respondía "El fabricante y las observaciones deben ser
 * texto"; ahora cada campo dice qué tiene mal.
 */
const validarOpcionales = ({ fabricante, observaciones, capacidadUtilLitros, anchoAplicacionMetros, radioGiroMetros }) => {
  if (!esTextoOpcional(fabricante) || !esTextoOpcional(observaciones)) {
    return "El fabricante y las observaciones deben ser texto";
  }

  const positivoOpcional = (valor) => estaVacio(valor) || (Number(valor) > 0 && Number.isFinite(Number(valor)));

  if (!positivoOpcional(capacidadUtilLitros)) {
    return "La capacidad util debe ser un numero mayor a 0";
  }

  if (!positivoOpcional(anchoAplicacionMetros)) {
    return "El ancho de aplicacion debe ser un numero mayor a 0";
  }

  if (!estaVacio(radioGiroMetros)) {
    const radio = Number(radioGiroMetros);
    if (!Number.isFinite(radio) || radio < RADIO_GIRO_MINIMO || radio > RADIO_GIRO_MAXIMO) {
      return `El radio de giro debe estar entre ${RADIO_GIRO_MINIMO} y ${RADIO_GIRO_MAXIMO} metros`;
    }
  }

  return null;
};

const buildAeronaveData = (body, empresaId) => {
  const { modelo, fabricante, estado, observaciones, capacidadUtilLitros, anchoAplicacionMetros, radioGiroMetros } = body;
  const matricula = normalizeMatricula(body.matricula);

  return {
    matricula,
    modelo: modelo.trim(),
    fabricante: fabricante ? fabricante.trim() : null,
    estado: estado || undefined,
    capacidadUtilLitros: numeroOpcional(capacidadUtilLitros),
    anchoAplicacionMetros: numeroOpcional(anchoAplicacionMetros),
    radioGiroMetros: numeroOpcional(radioGiroMetros),
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

    const errorOpcionales = validarOpcionales(req.body);
    if (errorOpcionales) {
      return res.status(400).json({ message: errorOpcionales });
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

    const errorOpcionales = validarOpcionales(req.body);
    if (errorOpcionales) {
      return res.status(400).json({ message: errorOpcionales });
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

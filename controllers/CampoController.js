const prisma = require("../configs/prisma");
const { getEmpresaIdParaEscritura, getWhereEmpresa, getWhereRecursoPorId } = require("../utils/autorizacion");
const { esTextoNoVacio, esTextoOpcional, isForeignKeyError, isRecordNotFound } = require("../utils/validacion");

const campoSelect = {
  id: true,
  nombre: true,
  ubicacion: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true
};

const hasRequiredCampoFields = ({ nombre, ubicacion, empresaId }) => {
  return esTextoNoVacio(nombre) && esTextoNoVacio(empresaId) && esTextoOpcional(ubicacion);
};

const createCampo = async (req, res) => {
  try {
    const { nombre, ubicacion } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!hasRequiredCampoFields({ nombre, ubicacion, empresaId })) {
      return res.status(400).json({ message: "El nombre y la empresa del campo son obligatorios" });
    }

    const campo = await prisma.campo.create({
      data: {
        nombre: nombre.trim(),
        ubicacion: ubicacion ? ubicacion.trim() : null,
        empresaId
      },
      select: campoSelect
    });

    return res.status(201).json(campo);
  } catch (error) {
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }
    return res.status(500).json({ message: "No se pudo crear el campo" });
  }
};

const getCampos = async (req, res) => {
  try {
    const campos = await prisma.campo.findMany({
      where: getWhereEmpresa(req),
      select: campoSelect,
      orderBy: { createdAt: "desc" }
    });

    return res.json(campos);
  } catch (error) {
    return res.status(500).json({ message: "No se pudieron cargar los campos" });
  }
};

const getCampoById = async (req, res) => {
  try {
    const campo = await prisma.campo.findFirst({
      where: getWhereRecursoPorId(req),
      select: campoSelect
    });

    if (!campo) {
      return res.status(404).json({ message: "El campo no existe" });
    }

    return res.json(campo);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar el campo" });
  }
};

const updateCampo = async (req, res) => {
  try {
    const { nombre, ubicacion } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!hasRequiredCampoFields({ nombre, ubicacion, empresaId })) {
      return res.status(400).json({ message: "El nombre y la empresa del campo son obligatorios" });
    }

    const campoActual = await prisma.campo.findFirst({
      where: getWhereRecursoPorId(req),
      select: { id: true }
    });

    if (!campoActual) {
      return res.status(404).json({ message: "El campo no existe" });
    }

    const campo = await prisma.campo.update({
      where: { id: campoActual.id },
      data: {
        nombre: nombre.trim(),
        ubicacion: ubicacion ? ubicacion.trim() : null,
        empresaId
      },
      select: campoSelect
    });

    return res.json(campo);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El campo no existe" });
    }
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }
    return res.status(500).json({ message: "No se pudo actualizar el campo" });
  }
};

const deleteCampo = async (req, res) => {
  try {
    const campoActual = await prisma.campo.findFirst({
      where: getWhereRecursoPorId(req),
      select: { id: true }
    });

    if (!campoActual) {
      return res.status(404).json({ message: "El campo no existe" });
    }

    // Los lotes pertenecen al campo: se eliminan junto con el en una misma transaccion
    const [lotesEliminados, campo] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`DELETE FROM "Lote" WHERE "campoId" = $1;`, campoActual.id),
      prisma.campo.delete({
        where: { id: campoActual.id },
        select: campoSelect
      })
    ]);

    return res.json({ ...campo, lotesEliminados });
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El campo no existe" });
    }

    return res.status(500).json({ message: "No se pudo eliminar el campo" });
  }
};

module.exports = {
  createCampo,
  deleteCampo,
  getCampoById,
  getCampos,
  updateCampo
};

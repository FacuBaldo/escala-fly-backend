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
    {
      const { page = '1', limit = '20', search = '', empresaId } = req.query;
      if (typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)) || typeof limit !== 'string' || !/^[1-9]\d*$/.test(limit) || Number(limit) > 100 || !Number.isSafeInteger((Number(page) - 1) * Number(limit)) || typeof search !== 'string' || search.length > 200 || (empresaId !== undefined && typeof empresaId !== 'string')) return res.status(400).json({ message: 'Filtros o paginacion invalidos' });
      const texto = search.trim().replace(/\s+/g, ' ');
      const empresaFiltro = req.auth.rol === 'ADMIN' ? empresaId || null : req.auth.empresaId;
      const ids = await prisma.$queryRaw`SELECT "id" FROM "Campo" WHERE strpos(unaccent(lower(regexp_replace(trim("nombre"), '\\s+', ' ', 'g'))), unaccent(lower(${texto}))) > 0 AND (${empresaFiltro}::text IS NULL OR "empresaId" = ${empresaFiltro}) ORDER BY "createdAt" DESC, "id" DESC LIMIT ${Number(limit) + 1} OFFSET ${(Number(page) - 1) * Number(limit)}`;
      const where = getWhereEmpresa(req, { id: { in: ids.map((row) => row.id) } });
      const campos = await prisma.campo.findMany({ where, select: { ...campoSelect, empresa: { select: { id: true, nombre: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      return res.json({ data: campos.slice(0, Number(limit)), pagination: { page: Number(page), hasNextPage: ids.length > Number(limit) } });
    }
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

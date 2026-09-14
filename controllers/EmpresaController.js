const prisma = require("../configs/prisma");
const { isAdmin } = require("../utils/autorizacion");
const {
  esEmailValido,
  esTextoNoVacio,
  esTextoOpcional,
  isForeignKeyError,
  isRecordNotFound,
  normalizeEmail
} = require("../utils/validacion");

const empresaSelect = {
  id: true,
  nombre: true,
  email: true,
  telefono: true,
  createdAt: true,
  updatedAt: true
};

/**
 * Valida y normaliza los datos de una empresa. Devuelve { error } o { data }.
 */
const getDatosEmpresa = (body) => {
  const { nombre, email, telefono } = body;

  if (!esTextoNoVacio(nombre)) {
    return { error: "El nombre de la empresa es obligatorio" };
  }

  if (!esTextoOpcional(email) || !esTextoOpcional(telefono)) {
    return { error: "El correo electronico y el telefono deben ser texto" };
  }

  if (email && !esEmailValido(email)) {
    return { error: "El correo electronico de la empresa no es valido" };
  }

  return {
    data: {
      nombre: nombre.trim(),
      email: email ? normalizeEmail(email) : null,
      telefono: telefono ? telefono.trim() : null
    }
  };
};

const createEmpresa = async (req, res) => {
  try {
    const { data, error } = getDatosEmpresa(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const empresa = await prisma.empresa.create({
      data,
      select: empresaSelect
    });

    return res.status(201).json(empresa);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo crear la empresa" });
  }
};

const getEmpresas = async (req, res) => {
  try {
    const empresas = await prisma.empresa.findMany({
      where: isAdmin(req) ? undefined : { id: req.auth.empresaId },
      select: empresaSelect,
      orderBy: { createdAt: "desc" }
    });

    return res.json(empresas);
  } catch (error) {
    return res.status(500).json({ message: "No se pudieron cargar las empresas" });
  }
};

const getEmpresaById = async (req, res) => {
  try {
    if (!isAdmin(req) && req.params.id !== req.auth.empresaId) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id },
      select: empresaSelect
    });

    if (!empresa) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    return res.json(empresa);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar la empresa" });
  }
};

const updateEmpresa = async (req, res) => {
  try {
    const { data, error } = getDatosEmpresa(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    if (!isAdmin(req) && req.params.id !== req.auth.empresaId) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    const empresa = await prisma.empresa.update({
      where: { id: isAdmin(req) ? req.params.id : req.auth.empresaId },
      data,
      select: empresaSelect
    });

    return res.json(empresa);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "La empresa no existe" });
    }
    return res.status(500).json({ message: "No se pudo actualizar la empresa" });
  }
};

const deleteEmpresa = async (req, res) => {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.params.id },
      select: {
        ...empresaSelect,
        _count: { select: { usuarios: true, campos: true, productos: true, aeronaves: true } }
      }
    });

    if (!empresa) {
      return res.status(404).json({ message: "La empresa no existe" });
    }

    // Borrar una empresa con datos asociados dejaria usuarios sin empresa (sin acceso)
    // y fallaria por las claves foraneas de campos, productos y aeronaves.
    const { _count: cantidades, ...empresaData } = empresa;
    const asociados = [
      [cantidades.usuarios, "usuarios"],
      [cantidades.campos, "campos"],
      [cantidades.productos, "productos"],
      [cantidades.aeronaves, "aeronaves"]
    ]
      .filter(([cantidad]) => cantidad > 0)
      .map(([cantidad, nombre]) => `${cantidad} ${nombre}`);

    if (asociados.length > 0) {
      return res.status(409).json({
        message: `No se puede eliminar la empresa porque tiene ${asociados.join(", ")} asociados`
      });
    }

    await prisma.empresa.delete({ where: { id: empresaData.id } });

    return res.json(empresaData);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "La empresa no existe" });
    }
    if (isForeignKeyError(error)) {
      return res.status(409).json({ message: "No se puede eliminar la empresa porque tiene datos asociados" });
    }

    return res.status(500).json({ message: "No se pudo eliminar la empresa" });
  }
};

module.exports = {
  createEmpresa,
  deleteEmpresa,
  getEmpresaById,
  getEmpresas,
  updateEmpresa
};

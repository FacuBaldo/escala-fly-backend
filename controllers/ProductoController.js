const prisma = require("../configs/prisma");
const { getEmpresaIdParaEscritura, getWhereEmpresa, getWhereRecursoPorId } = require("../utils/autorizacion");
const {
  esTextoNoVacio,
  esTextoOpcional,
  esValorDeEnum,
  isForeignKeyError,
  isRecordNotFound
} = require("../utils/validacion");

const TIPOS_VALIDOS = ["HERBICIDA", "FUNGICIDA", "INSECTICIDA", "FERTILIZANTE", "COADYUVANTE", "OTRO"];

const productoSelect = {
  id: true,
  nombre: true,
  marca: true,
  tipo: true,
  unidadMedida: true,
  descripcion: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true
};

const hasRequiredProductoFields = ({ nombre, tipo, unidadMedida, empresaId }) => {
  return esTextoNoVacio(nombre) && Boolean(tipo) && esTextoNoVacio(unidadMedida) && esTextoNoVacio(empresaId);
};

/**
 * Valida tipos de datos y el enum del tipo de producto. Devuelve un mensaje de error o null.
 */
const validarProducto = ({ tipo, marca, descripcion }) => {
  if (!esValorDeEnum(tipo, TIPOS_VALIDOS)) {
    return "El tipo de producto no es valido";
  }

  if (!esTextoOpcional(marca) || !esTextoOpcional(descripcion)) {
    return "La marca y la descripcion deben ser texto";
  }

  return null;
};

const createProducto = async (req, res) => {
  try {
    const { nombre, marca, tipo, unidadMedida, descripcion } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!hasRequiredProductoFields({ nombre, tipo, unidadMedida, empresaId })) {
      return res.status(400).json({
        message: "El nombre, tipo, unidad de medida y empresa del producto son obligatorios"
      });
    }

    const errorValidacion = validarProducto(req.body);
    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const producto = await prisma.producto.create({
      data: {
        nombre: nombre.trim(),
        marca: marca ? marca.trim() : null,
        tipo,
        unidadMedida: unidadMedida.trim(),
        descripcion: descripcion ? descripcion.trim() : null,
        empresaId
      },
      select: productoSelect
    });

    return res.status(201).json(producto);
  } catch (error) {
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }
    return res.status(500).json({ message: "No se pudo crear el producto" });
  }
};

const getProductos = async (req, res) => {
  try {
    const { tipo } = req.query;

    if (tipo !== undefined && !esValorDeEnum(tipo, TIPOS_VALIDOS)) {
      return res.status(400).json({ message: "El tipo de producto no es valido" });
    }

    const where = getWhereEmpresa(req);
    if (tipo) {
      where.tipo = tipo;
    }

    const productos = await prisma.producto.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      select: productoSelect,
      orderBy: { createdAt: "desc" }
    });

    return res.json(productos);
  } catch (error) {
    return res.status(500).json({ message: "No se pudieron cargar los productos" });
  }
};

const getProductoById = async (req, res) => {
  try {
    const producto = await prisma.producto.findFirst({
      where: getWhereRecursoPorId(req),
      select: productoSelect
    });

    if (!producto) {
      return res.status(404).json({ message: "El producto no existe" });
    }

    return res.json(producto);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar el producto" });
  }
};

const updateProducto = async (req, res) => {
  try {
    const { nombre, marca, tipo, unidadMedida, descripcion } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!hasRequiredProductoFields({ nombre, tipo, unidadMedida, empresaId })) {
      return res.status(400).json({
        message: "El nombre, tipo, unidad de medida y empresa del producto son obligatorios"
      });
    }

    const errorValidacion = validarProducto(req.body);
    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const productoActual = await prisma.producto.findFirst({
      where: getWhereRecursoPorId(req),
      select: { id: true }
    });

    if (!productoActual) {
      return res.status(404).json({ message: "El producto no existe" });
    }

    const producto = await prisma.producto.update({
      where: { id: productoActual.id },
      data: {
        nombre: nombre.trim(),
        marca: marca ? marca.trim() : null,
        tipo,
        unidadMedida: unidadMedida.trim(),
        descripcion: descripcion ? descripcion.trim() : null,
        empresaId
      },
      select: productoSelect
    });

    return res.json(producto);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El producto no existe" });
    }
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }
    return res.status(500).json({ message: "No se pudo actualizar el producto" });
  }
};

const deleteProducto = async (req, res) => {
  try {
    const productoActual = await prisma.producto.findFirst({
      where: getWhereRecursoPorId(req),
      select: { id: true }
    });

    if (!productoActual) {
      return res.status(404).json({ message: "El producto no existe" });
    }

    const producto = await prisma.producto.delete({
      where: { id: productoActual.id },
      select: productoSelect
    });

    return res.json(producto);
  } catch (error) {
    if (isRecordNotFound(error)) {
      return res.status(404).json({ message: "El producto no existe" });
    }

    return res.status(500).json({ message: "No se pudo eliminar el producto" });
  }
};

module.exports = {
  createProducto,
  deleteProducto,
  getProductoById,
  getProductos,
  updateProducto
};

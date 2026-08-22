const { Prisma } = require("@prisma/client");
const prisma = require("../configs/prisma");

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
  return Boolean(nombre) && Boolean(tipo) && Boolean(unidadMedida) && Boolean(empresaId);
};

const isRecordNotFound = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

const isForeignKeyError = (error) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const createProducto = async (req, res) => {
  try {
    const { nombre, marca, tipo, unidadMedida, descripcion, empresaId } = req.body;

    if (!hasRequiredProductoFields({ nombre, tipo, unidadMedida, empresaId })) {
      return res.status(400).json({
        message: "El nombre, tipo, unidad de medida y empresa del producto son obligatorios"
      });
    }

    const producto = await prisma.producto.create({
      data: {
        nombre,
        marca: marca || null,
        tipo,
        unidadMedida,
        descripcion: descripcion || null,
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
    const { empresaId, tipo } = req.query;

    const where = {};
    if (empresaId) {
      where.empresaId = empresaId;
    }
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
    const producto = await prisma.producto.findUnique({
      where: { id: req.params.id },
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
    const { nombre, marca, tipo, unidadMedida, descripcion, empresaId } = req.body;

    if (!hasRequiredProductoFields({ nombre, tipo, unidadMedida, empresaId })) {
      return res.status(400).json({
        message: "El nombre, tipo, unidad de medida y empresa del producto son obligatorios"
      });
    }

    const producto = await prisma.producto.update({
      where: { id: req.params.id },
      data: {
        nombre,
        marca: marca || null,
        tipo,
        unidadMedida,
        descripcion: descripcion || null,
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
    const producto = await prisma.producto.delete({
      where: { id: req.params.id },
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

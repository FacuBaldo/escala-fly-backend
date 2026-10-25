const prisma = require("../configs/prisma");
const { getEmpresaIdParaEscritura, getWhereEmpresa, getWhereRecursoPorId } = require("../utils/autorizacion");
const { esTextoNoVacio, esTextoOpcional, isForeignKeyError, isRecordNotFound } = require("../utils/validacion");
const { CATALOGO_TIPO, CATALOGO_UNIDAD } = require("../utils/catalogos");

const productoSelect = {
  id: true,
  nombre: true,
  marca: true,
  tipoId: true,
  tipo: { select: CATALOGO_TIPO },
  unidadMedidaId: true,
  unidadMedida: { select: CATALOGO_UNIDAD },
  descripcion: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true
};

const hasRequiredProductoFields = ({ nombre, tipoId, unidadMedidaId, empresaId }) => {
  return (
    esTextoNoVacio(nombre) && esTextoNoVacio(tipoId) && esTextoNoVacio(unidadMedidaId) && esTextoNoVacio(empresaId)
  );
};

/**
 * Valida tipos de datos y que el tipo y la unidad existan en los catalogos.
 * Devuelve un mensaje de error o null.
 */
const validarProducto = async ({ tipoId, unidadMedidaId, marca, descripcion }) => {
  if (!esTextoOpcional(marca) || !esTextoOpcional(descripcion)) {
    return "La marca y la descripcion deben ser texto";
  }

  const [tipo, unidad] = await Promise.all([
    prisma.tipoProducto.findUnique({ where: { id: tipoId }, select: { id: true } }),
    prisma.unidadMedida.findUnique({ where: { id: unidadMedidaId }, select: { id: true } })
  ]);

  if (!tipo) {
    return "El tipo de producto no existe";
  }

  if (!unidad) {
    return "La unidad de medida no existe";
  }

  return null;
};

const createProducto = async (req, res) => {
  try {
    const { nombre, marca, tipoId, unidadMedidaId, descripcion } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!hasRequiredProductoFields({ nombre, tipoId, unidadMedidaId, empresaId })) {
      return res.status(400).json({
        message: "El nombre, tipo, unidad de medida y empresa del producto son obligatorios"
      });
    }

    const errorValidacion = await validarProducto(req.body);
    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const producto = await prisma.producto.create({
      data: {
        nombre: nombre.trim(),
        marca: marca ? marca.trim() : null,
        tipoId,
        unidadMedidaId,
        descripcion: descripcion ? descripcion.trim() : null,
        empresaId
      },
      select: productoSelect
    });

    return res.status(201).json(producto);
  } catch (error) {
    if (isForeignKeyError(error)) {
      return res.status(400).json({ message: "La empresa, el tipo o la unidad de medida asociados no existen" });
    }
    return res.status(500).json({ message: "No se pudo crear el producto" });
  }
};

const getProductos = async (req, res) => {
  try {
    const { tipoId } = req.query;

    if (tipoId !== undefined && typeof tipoId !== "string") {
      return res.status(400).json({ message: "El filtro tipoId debe ser un unico id" });
    }

    const where = getWhereEmpresa(req);
    if (tipoId) {
      where.tipoId = tipoId;
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
    const { nombre, marca, tipoId, unidadMedidaId, descripcion } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!hasRequiredProductoFields({ nombre, tipoId, unidadMedidaId, empresaId })) {
      return res.status(400).json({
        message: "El nombre, tipo, unidad de medida y empresa del producto son obligatorios"
      });
    }

    const errorValidacion = await validarProducto(req.body);
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
        tipoId,
        unidadMedidaId,
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
      return res.status(400).json({ message: "La empresa, el tipo o la unidad de medida asociados no existen" });
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
    if (isForeignKeyError(error)) {
      return res.status(409).json({ message: "No se puede eliminar el producto porque está incluido en una o más órdenes de trabajo" });
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

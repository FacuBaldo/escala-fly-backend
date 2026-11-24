const prisma = require("../configs/prisma");
const { isAdmin } = require("../utils/autorizacion");
const { validarGeometria } = require("../utils/geometriaObstaculos");

/**
 * Obstáculos del lote (Sprint 4): molinos, casas, galpones, silos y líneas de cable
 * marcados sobre el mapa como referencia para el piloto. La geometría se guarda como
 * GeoJSON: un punto para las estructuras y una línea para los cables.
 */

const TIPOS = ["MOLINO", "CASA", "GALPON", "SILO", "CABLE", "OTRO"];
const MAXIMO_POR_LOTE = 200;
const ALTURA_MAXIMA_METROS = 500;

const seleccion = { id: true, loteId: true, tipo: true, nombre: true, alturaMetros: true, geometria: true, createdAt: true, updatedAt: true };

/** Nombre y altura (opcionales). Devuelve { datos } o { error }. */
const validarDatos = ({ nombre, alturaMetros }) => {
  if (nombre !== undefined && nombre !== null && (typeof nombre !== "string" || nombre.trim().length > 80)) {
    return { error: "El nombre del obstáculo debe ser un texto de hasta 80 caracteres" };
  }
  let altura = null;
  if (alturaMetros !== undefined && alturaMetros !== null && alturaMetros !== "") {
    altura = Number(alturaMetros);
    if (!Number.isFinite(altura) || altura <= 0 || altura > ALTURA_MAXIMA_METROS) {
      return { error: `La altura debe ser un número entre 0 y ${ALTURA_MAXIMA_METROS} metros` };
    }
  }
  const datos = {};
  if (nombre !== undefined) datos.nombre = nombre ? nombre.trim() : null;
  if (alturaMetros !== undefined) datos.alturaMetros = altura;
  return { datos };
};

/** El lote existe y es de la empresa del usuario (o el usuario es ADMIN). */
const buscarLote = async (req, loteId) => {
  const lote = await prisma.lote.findUnique({ where: { id: loteId }, select: { id: true, campo: { select: { empresaId: true } } } });
  if (!lote || (!isAdmin(req) && lote.campo.empresaId !== req.auth.empresaId)) return null;
  return lote;
};

const buscarObstaculo = async (req, id) => {
  const obstaculo = await prisma.obstaculo.findUnique({
    where: { id },
    select: { id: true, tipo: true, lote: { select: { campo: { select: { empresaId: true } } } } }
  });
  if (!obstaculo || (!isAdmin(req) && obstaculo.lote.campo.empresaId !== req.auth.empresaId)) return null;
  return obstaculo;
};

/** GET /api/lotes/:loteId/obstaculos */
const getObstaculosDeLote = async (req, res) => {
  try {
    const lote = await buscarLote(req, req.params.loteId);
    if (!lote) return res.status(404).json({ message: "El lote no existe" });

    const obstaculos = await prisma.obstaculo.findMany({ where: { loteId: lote.id }, select: seleccion, orderBy: { createdAt: "asc" } });
    return res.json(obstaculos);
  } catch (error) {
    console.error("Error al listar obstáculos:", error);
    return res.status(500).json({ message: "No se pudieron cargar los obstáculos" });
  }
};

/** POST /api/lotes/:loteId/obstaculos  Body: { tipo, geometria, nombre?, alturaMetros? } */
const createObstaculo = async (req, res) => {
  try {
    const { tipo, geometria } = req.body || {};
    if (!TIPOS.includes(tipo)) return res.status(400).json({ message: `El tipo debe ser uno de: ${TIPOS.join(", ")}` });

    const errorGeometria = validarGeometria(tipo, geometria);
    if (errorGeometria) return res.status(400).json({ message: errorGeometria });

    const { datos, error } = validarDatos(req.body);
    if (error) return res.status(400).json({ message: error });

    const lote = await buscarLote(req, req.params.loteId);
    if (!lote) return res.status(404).json({ message: "El lote no existe" });

    const cantidad = await prisma.obstaculo.count({ where: { loteId: lote.id } });
    if (cantidad >= MAXIMO_POR_LOTE) return res.status(409).json({ message: `Un lote admite hasta ${MAXIMO_POR_LOTE} obstáculos` });

    const obstaculo = await prisma.obstaculo.create({
      data: { loteId: lote.id, tipo, geometria: { type: geometria.type, coordinates: geometria.coordinates }, ...datos },
      select: seleccion
    });
    return res.status(201).json(obstaculo);
  } catch (error) {
    console.error("Error al crear obstáculo:", error);
    return res.status(500).json({ message: "No se pudo guardar el obstáculo" });
  }
};

/** PUT /api/obstaculos/:id  Body: { nombre?, alturaMetros?, geometria? } (el tipo no cambia) */
const updateObstaculo = async (req, res) => {
  try {
    const actual = await buscarObstaculo(req, req.params.id);
    if (!actual) return res.status(404).json({ message: "El obstáculo no existe" });

    const { datos, error } = validarDatos(req.body || {});
    if (error) return res.status(400).json({ message: error });

    if (req.body?.geometria !== undefined) {
      const errorGeometria = validarGeometria(actual.tipo, req.body.geometria);
      if (errorGeometria) return res.status(400).json({ message: errorGeometria });
      datos.geometria = { type: req.body.geometria.type, coordinates: req.body.geometria.coordinates };
    }

    const obstaculo = await prisma.obstaculo.update({ where: { id: actual.id }, data: datos, select: seleccion });
    return res.json(obstaculo);
  } catch (error) {
    console.error("Error al actualizar obstáculo:", error);
    return res.status(500).json({ message: "No se pudo actualizar el obstáculo" });
  }
};

/** DELETE /api/obstaculos/:id */
const deleteObstaculo = async (req, res) => {
  try {
    const actual = await buscarObstaculo(req, req.params.id);
    if (!actual) return res.status(404).json({ message: "El obstáculo no existe" });

    await prisma.obstaculo.delete({ where: { id: actual.id } });
    return res.json({ message: "Obstáculo eliminado" });
  } catch (error) {
    console.error("Error al eliminar obstáculo:", error);
    return res.status(500).json({ message: "No se pudo eliminar el obstáculo" });
  }
};

/**
 * GET /api/ordenes/:ordenId/obstaculos
 * Obstáculos del lote de una orden, para mostrarlos sobre la ruta (también al piloto
 * y al cliente de esa orden).
 */
const getObstaculosDeOrden = async (req, res) => {
  try {
    const orden = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.ordenId },
      select: { loteId: true, empresaId: true, pilotoId: true, clienteId: true }
    });
    const puedeVer = orden && (isAdmin(req) || (
      orden.empresaId === req.auth.empresaId &&
      (req.auth.rol !== "PILOTO" || orden.pilotoId === req.auth.usuarioId) &&
      (req.auth.rol !== "CLIENTE" || orden.clienteId === req.auth.usuarioId)
    ));
    if (!puedeVer) return res.status(404).json({ message: "La orden de trabajo no existe" });

    const obstaculos = await prisma.obstaculo.findMany({ where: { loteId: orden.loteId }, select: seleccion, orderBy: { createdAt: "asc" } });
    return res.json(obstaculos);
  } catch (error) {
    console.error("Error al listar obstáculos de la orden:", error);
    return res.status(500).json({ message: "No se pudieron cargar los obstáculos" });
  }
};

module.exports = {
  createObstaculo,
  deleteObstaculo,
  getObstaculosDeLote,
  getObstaculosDeOrden,
  updateObstaculo
};

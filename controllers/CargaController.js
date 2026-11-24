const prisma = require("../configs/prisma");
const { isAdmin } = require("../utils/autorizacion");
const { armarVistaCargas, recalcularCargas } = require("../services/reparto/cargas");

const ESTADOS_CERRADOS = ["FINALIZADA", "CANCELADA"];
const OPCIONES_TRANSACCION = { maxWait: 15000, timeout: 60000 };

// Se lanza dentro de la transacción para deshacerla cuando una celda pedida no existe
class CargaInexistenteError extends Error {}

// Misma regla de visibilidad que el resto de la orden
const puedeVerOrden = (req, orden) => isAdmin(req) || (
  orden.empresaId === req.auth.empresaId &&
  (req.auth.rol !== "PILOTO" || orden.pilotoId === req.auth.usuarioId) &&
  (req.auth.rol !== "CLIENTE" || orden.clienteId === req.auth.usuarioId)
);

const buscarOrden = (id) => prisma.ordenTrabajo.findUnique({
  where: { id },
  select: {
    id: true,
    numero: true,
    estado: true,
    empresaId: true,
    pilotoId: true,
    clienteId: true,
    fechaPrevista: true,
    observaciones: true,
    litrosPorHectarea: true,
    capacidadUtilLitros: true,
    empresa: { select: { nombre: true } },
    piloto: { select: { nombre: true, apellido: true } },
    cliente: { select: { nombre: true, apellido: true } },
    aeronave: { select: { matricula: true, modelo: true } },
    lote: { select: { nombre: true, superficie: true, campo: { select: { nombre: true } } } },
    planVuelo: { select: { version: true, cantidadViajes: true, caldoTotalLitros: true, superficieHa: true } }
  }
});

const responderVista = async (res, orden) => {
  const vista = await armarVistaCargas(prisma, orden.id);
  const { empresaId, pilotoId, clienteId, ...datosOrden } = orden;
  return res.json({ orden: datosOrden, ...vista });
};

/**
 * GET /api/ordenes/:id/cargas
 * Orden del cargador: qué lleva de cada producto cada carga (viaje) del plan.
 */
const getCargas = async (req, res) => {
  try {
    const orden = await buscarOrden(req.params.id);
    if (!orden || !puedeVerOrden(req, orden)) {
      return res.status(404).json({ message: "La orden de trabajo no existe" });
    }
    if (!orden.planVuelo) {
      return res.status(404).json({ message: "La orden todavía no tiene plan de vuelo" });
    }

    return responderVista(res, orden);
  } catch (error) {
    console.error("Error al obtener las cargas:", error);
    return res.status(500).json({ message: "No se pudo cargar la orden del cargador" });
  }
};

const ordenEditable = async (req, res) => {
  const orden = await buscarOrden(req.params.id);
  if (!orden || (!isAdmin(req) && orden.empresaId !== req.auth.empresaId)) {
    res.status(404).json({ message: "La orden de trabajo no existe" });
    return null;
  }
  if (ESTADOS_CERRADOS.includes(orden.estado)) {
    res.status(409).json({ message: `La orden está ${orden.estado.toLowerCase()} y ya no puede modificarse` });
    return null;
  }
  if (!orden.planVuelo) {
    res.status(404).json({ message: "La orden todavía no tiene plan de vuelo" });
    return null;
  }
  return orden;
};

/**
 * PUT /api/ordenes/:id/cargas
 * Body: { cargas: [{ numeroViaje, productoId, cantidad }] }
 * Corrige lo que lleva cada carga. Una celda queda marcada como manual si su cantidad
 * difiere de la calculada por el sistema.
 */
const actualizarCargas = async (req, res) => {
  try {
    const { cargas } = req.body || {};
    if (!Array.isArray(cargas) || cargas.length === 0 || cargas.length > 5000) {
      return res.status(400).json({ message: "Enviá la lista de cargas a corregir" });
    }

    for (const carga of cargas) {
      const cantidad = Number(carga?.cantidad);
      if (!Number.isInteger(carga?.numeroViaje) || typeof carga?.productoId !== "string" || carga.cantidad === null || carga.cantidad === "" || !Number.isFinite(cantidad) || cantidad < 0 || cantidad > 1e6) {
        return res.status(400).json({ message: "Cada carga necesita número de viaje, producto y una cantidad mayor o igual a 0" });
      }
    }

    const orden = await ordenEditable(req, res);
    if (!orden) return undefined;

    await prisma.$transaction(async (tx) => {
      const leerCeldas = () => tx.cargaProducto.findMany({
        where: { ordenId: orden.id },
        select: { id: true, numeroViaje: true, productoId: true, cantidadAutomatica: true }
      });

      // Órdenes anteriores a esta función: se crean primero las cargas automáticas
      let celdas = await leerCeldas();
      if (celdas.length === 0) {
        await recalcularCargas(tx, orden.id);
        celdas = await leerCeldas();
      }

      // Se valida todo antes de escribir. Si una celda no existe se lanza un error para que
      // la transacción se deshaga y no quede guardada solo una parte de las correcciones.
      const porCelda = new Map(celdas.map((celda) => [`${celda.numeroViaje}|${celda.productoId}`, celda]));
      const faltante = cargas.find((carga) => !porCelda.has(`${carga.numeroViaje}|${carga.productoId}`));
      if (faltante) {
        throw new CargaInexistenteError(`No existe la carga del viaje ${faltante.numeroViaje} para ese producto`);
      }

      for (const carga of cargas) {
        const actual = porCelda.get(`${carga.numeroViaje}|${carga.productoId}`);
        const cantidad = Math.round(Number(carga.cantidad) * 100) / 100;
        await tx.cargaProducto.update({
          where: { id: actual.id },
          data: { cantidad, manual: Math.abs(cantidad - actual.cantidadAutomatica) >= 0.005 }
        });
      }
    }, OPCIONES_TRANSACCION);

    return responderVista(res, orden);
  } catch (error) {
    if (error instanceof CargaInexistenteError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error al actualizar las cargas:", error);
    return res.status(500).json({ message: "No se pudieron guardar las cargas" });
  }
};

/**
 * POST /api/ordenes/:id/cargas/restablecer
 * Descarta las correcciones manuales y vuelve al reparto automático.
 */
const restablecerCargas = async (req, res) => {
  try {
    const orden = await ordenEditable(req, res);
    if (!orden) return undefined;

    // Al borrar primero, recalcularCargas no encuentra correcciones manuales que conservar
    await prisma.$transaction(async (tx) => {
      await tx.cargaProducto.deleteMany({ where: { ordenId: orden.id } });
      await recalcularCargas(tx, orden.id);
    }, OPCIONES_TRANSACCION);

    return responderVista(res, orden);
  } catch (error) {
    console.error("Error al restablecer las cargas:", error);
    return res.status(500).json({ message: "No se pudo restablecer el reparto" });
  }
};

module.exports = { actualizarCargas, getCargas, restablecerCargas };

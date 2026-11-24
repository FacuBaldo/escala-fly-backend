const crypto = require("crypto");
const { repartirProductos } = require("./index");

// Dos cantidades se consideran iguales si difieren en menos de media centésima
const TOLERANCIA = 0.005;
const iguales = (a, b) => Math.abs(a - b) < TOLERANCIA;

/** Datos de la orden que necesita el reparto: viajes del plan y productos con dosis/total */
const leerDatosReparto = async (db, ordenId) => {
  const [plan, productos] = await Promise.all([
    db.planVuelo.findUnique({
      where: { ordenId },
      select: {
        superficieHa: true,
        viajes: {
          select: { numero: true, superficieHa: true, caldoLitros: true, pistaSalidaNombre: true, tipoSalida: true },
          orderBy: { numero: "asc" }
        }
      }
    }),
    db.ordenProducto.findMany({
      where: { ordenId },
      select: { productoId: true, dosisPorHectarea: true, cantidadTotalCliente: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return { viajes: plan?.viajes || [], productos };
};

/**
 * Recalcula la orden del cargador de una orden. Se llama dentro de la transacción que
 * guarda el plan (después de guardar viajes y productos).
 *
 * Las correcciones manuales del encargado se conservan solo si el valor automático de
 * esa celda no cambió (mismo viaje con la misma superficie, misma dosis): si el plan o
 * la dosis cambiaron, la corrección ya no corresponde y vuelve al valor calculado.
 */
const recalcularCargas = async (tx, ordenId) => {
  const { viajes, productos } = await leerDatosReparto(tx, ordenId);
  const { cargas } = repartirProductos(viajes, productos);

  const anteriores = await tx.cargaProducto.findMany({
    where: { ordenId, manual: true },
    select: { numeroViaje: true, productoId: true, cantidad: true, cantidadAutomatica: true }
  });
  const manualPorCelda = new Map(anteriores.map((c) => [`${c.numeroViaje}|${c.productoId}`, c]));

  await tx.cargaProducto.deleteMany({ where: { ordenId } });

  if (cargas.length === 0) return { conservadas: 0, descartadas: anteriores.length };

  let conservadas = 0;
  const ahora = new Date();
  const filas = cargas.map((carga) => {
    const previa = manualPorCelda.get(`${carga.numeroViaje}|${carga.productoId}`);
    const conservar = previa && iguales(previa.cantidadAutomatica, carga.cantidad);
    if (conservar) conservadas += 1;

    return {
      id: crypto.randomUUID(),
      ordenId,
      numeroViaje: carga.numeroViaje,
      productoId: carga.productoId,
      cantidadAutomatica: carga.cantidad,
      cantidad: conservar ? previa.cantidad : carga.cantidad,
      manual: Boolean(conservar),
      updatedAt: ahora
    };
  });

  await tx.cargaProducto.createMany({ data: filas });

  return { conservadas, descartadas: anteriores.length - conservadas };
};

/**
 * Arma la vista de la orden del cargador: por cada viaje, cuánto lleva de cada producto,
 * y por producto, cuánto se asignó contra lo requerido y lo que trajo el cliente.
 * Si la orden todavía no tiene cargas guardadas (órdenes anteriores a esta función),
 * las calcula en memoria sin guardarlas.
 */
const armarVistaCargas = async (db, ordenId) => {
  const [{ viajes, productos }, guardadas, detalleProductos] = await Promise.all([
    leerDatosReparto(db, ordenId),
    db.cargaProducto.findMany({
      where: { ordenId },
      select: { numeroViaje: true, productoId: true, cantidad: true, cantidadAutomatica: true, manual: true }
    }),
    db.ordenProducto.findMany({
      where: { ordenId },
      select: {
        productoId: true,
        producto: { select: { nombre: true, marca: true, unidadMedida: { select: { nombre: true, abreviatura: true } } } }
      }
    })
  ]);

  const { cargas: automaticas, resumen } = repartirProductos(viajes, productos);
  const cargas = guardadas.length > 0
    ? guardadas
    : automaticas.map((c) => ({ ...c, cantidadAutomatica: c.cantidad, manual: false }));

  const detallePorId = new Map(detalleProductos.map((d) => [d.productoId, d.producto]));
  const resumenPorId = new Map(resumen.map((r) => [r.productoId, r]));

  const productosVista = productos.map((p) => {
    const asignado = cargas
      .filter((c) => c.productoId === p.productoId)
      .reduce((total, c) => total + c.cantidad, 0);
    const datos = resumenPorId.get(p.productoId);
    const detalle = detallePorId.get(p.productoId);

    return {
      productoId: p.productoId,
      nombre: detalle?.nombre || "",
      marca: detalle?.marca || null,
      unidad: detalle?.unidadMedida?.abreviatura || "",
      dosisPorHectarea: p.dosisPorHectarea,
      cantidadTotalCliente: p.cantidadTotalCliente,
      criterio: datos?.criterio || "SIN_DATOS",
      requerido: datos?.requerido ?? null,
      asignado: Math.round(asignado * 100) / 100,
      // Lo asignado a las cargas contra lo que trajo el cliente: > 0 sobra, < 0 falta
      diferenciaCliente: datos?.totalCliente != null ? Math.round((datos.totalCliente - asignado) * 100) / 100 : null
    };
  });

  return {
    calculadaEnMemoria: guardadas.length === 0 && cargas.length > 0,
    viajes: viajes.map((v) => ({
      numero: v.numero,
      pistaCargaNombre: v.pistaSalidaNombre,
      caldoLitros: v.caldoLitros,
      superficieHa: v.superficieHa,
      productos: cargas
        .filter((c) => c.numeroViaje === v.numero)
        .map(({ productoId, cantidad, cantidadAutomatica, manual }) => ({ productoId, cantidad, cantidadAutomatica, manual }))
    })),
    productos: productosVista
  };
};

module.exports = { armarVistaCargas, recalcularCargas };

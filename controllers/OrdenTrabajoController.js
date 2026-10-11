const crypto = require("crypto");
const prisma = require("../configs/prisma");
const { getEmpresaIdParaLectura, getEmpresaIdParaEscritura, isAdmin } = require("../utils/autorizacion");
const { esTextoNoVacio, esTextoOpcional } = require("../utils/validacion");
const { generarPlanDeVuelo } = require("../services/planificador/index");

/**
 * Helper para validar acceso al lote y extraer su información geométrica y pistas.
 */
const obtenerLoteConGeometriaYPistas = async (loteId, empresaId, esAdmin) => {
  const query = `
    SELECT
      l."id", l."nombre", l."descripcion", l."superficie", l."activo",
      ST_AsGeoJSON(l."geometria") as "geometria",
      l."campoId", c."nombre" as "campoNombre", c."empresaId",
      l."pistaPrincipalId", l."pistaCargaId",
      l."updatedAt" as "loteUpdatedAt",
      pp."nombre" as "pistaPrincipalNombre",
      ST_Y(pp."ubicacion") as "pistaPrincipalLatitud",
      ST_X(pp."ubicacion") as "pistaPrincipalLongitud",
      pp."updatedAt" as "pistaPrincipalUpdatedAt",
      pc."nombre" as "pistaCargaNombre",
      ST_Y(pc."ubicacion") as "pistaCargaLatitud",
      ST_X(pc."ubicacion") as "pistaCargaLongitud",
      pc."updatedAt" as "pistaCargaUpdatedAt"
    FROM "Lote" l
    JOIN "Campo" c ON l."campoId" = c."id"
    LEFT JOIN "Pista" pp ON l."pistaPrincipalId" = pp."id"
    LEFT JOIN "Pista" pc ON l."pistaCargaId" = pc."id"
    WHERE l."id" = $1;
  `;

  const resultados = await prisma.$queryRawUnsafe(query, loteId);
  if (!resultados || resultados.length === 0) {
    return { error: "El lote especificado no existe", status: 404 };
  }

  const lote = resultados[0];
  if (!esAdmin && lote.empresaId !== empresaId) {
    return { error: "No tiene permisos para operar sobre este lote", status: 403 };
  }

  if (!lote.activo) {
    return { error: "El lote seleccionado se encuentra dado de baja", status: 400 };
  }

  if (!lote.pistaPrincipalId || !lote.pistaCargaId) {
    return {
      error: "El lote seleccionado debe tener asignadas una pista principal y una pista de carga para generar el plan de vuelo.",
      status: 422
    };
  }

  return {
    lote: {
      id: lote.id,
      nombre: lote.nombre,
      superficie: Number(lote.superficie),
      geometria: JSON.parse(lote.geometria),
      campoId: lote.campoId,
      campoNombre: lote.campoNombre,
      empresaId: lote.empresaId,
      loteUpdatedAt: lote.loteUpdatedAt,
      pistaPrincipal: {
        id: lote.pistaPrincipalId,
        nombre: lote.pistaPrincipalNombre,
        latitud: Number(lote.pistaPrincipalLatitud),
        longitud: Number(lote.pistaPrincipalLongitud),
        updatedAt: lote.pistaPrincipalUpdatedAt
      },
      pistaCarga: {
        id: lote.pistaCargaId,
        nombre: lote.pistaCargaNombre,
        latitud: Number(lote.pistaCargaLatitud),
        longitud: Number(lote.pistaCargaLongitud),
        updatedAt: lote.pistaCargaUpdatedAt
      }
    }
  };
};

/**
 * POST /api/ordenes
 * Crea la orden de trabajo y genera el plan de vuelo en una sola transacción.
 */
const createOrden = async (req, res) => {
  try {
    const {
      loteId,
      aeronaveId,
      anchoAplicacionMetros,
      litrosPorHectarea,
      capacidadUtilLitros,
      observaciones,
      fechaPrevista,
      productos
    } = req.body;

    if (!esTextoNoVacio(loteId)) {
      return res.status(400).json({ message: "El lote es obligatorio" });
    }

    if (!esTextoNoVacio(aeronaveId)) {
      return res.status(400).json({ message: "La aeronave es obligatoria" });
    }

    const ancho = Number(anchoAplicacionMetros);
    const lHa = Number(litrosPorHectarea);
    const cap = Number(capacidadUtilLitros);

    if (!(ancho > 0 && ancho <= 100)) {
      return res.status(400).json({ message: "El ancho de aplicación debe ser un número positivo (entre 1 y 100 metros)" });
    }

    if (!(lHa > 0 && lHa <= 500)) {
      return res.status(400).json({ message: "Los litros de caldo por hectárea deben ser un número positivo (máximo 500 L/ha)" });
    }

    if (!(cap > 0 && cap <= 20000)) {
      return res.status(400).json({ message: "La capacidad útil de la aeronave debe ser un número positivo (máximo 20.000 L)" });
    }

    if (!esTextoOpcional(observaciones)) {
      return res.status(400).json({ message: "Las observaciones deben ser texto" });
    }

    const empresaIdAuth = req.auth?.empresaId;
    const esAdmin = isAdmin(req);

    // 1. Validar lote y obtener geometría y pistas
    const datosLote = await obtenerLoteConGeometriaYPistas(loteId, empresaIdAuth, esAdmin);
    if (datosLote.error) {
      return res.status(datosLote.status).json({ message: datosLote.error });
    }
    const lote = datosLote.lote;
    const empresaIdEfectiva = lote.empresaId;

    // 2. Validar aeronave
    const aeronave = await prisma.aeronave.findUnique({
      where: { id: aeronaveId },
      select: { id: true, matricula: true, modelo: true, estado: true, empresaId: true }
    });
    if (!aeronave) {
      return res.status(400).json({ message: "La aeronave especificada no existe" });
    }
    if (aeronave.empresaId !== empresaIdEfectiva) {
      return res.status(403).json({ message: "La aeronave no pertenece a la misma empresa del lote" });
    }
    if (aeronave.estado !== "ACTIVA") {
      return res.status(400).json({ message: `La aeronave no está disponible para volar (estado: ${aeronave.estado})` });
    }

    // 3. Validar productos si fueron enviados
    const productosValidados = [];
    if (Array.isArray(productos) && productos.length > 0) {
      for (const item of productos) {
        if (!item.productoId) {
          return res.status(400).json({ message: "Cada producto en la mezcla debe incluir productoId" });
        }
        const prod = await prisma.producto.findUnique({
          where: { id: item.productoId },
          select: { id: true, nombre: true, empresaId: true, unidadMedida: true }
        });
        if (!prod || prod.empresaId !== empresaIdEfectiva) {
          return res.status(400).json({ message: `El producto ${item.productoId} no existe o no pertenece a la empresa` });
        }
        productosValidados.push({
          productoId: prod.id,
          nombre: prod.nombre,
          unidadMedida: prod.unidadMedida,
          dosisPorHectarea: item.dosisPorHectarea !== undefined && item.dosisPorHectarea !== null ? Number(item.dosisPorHectarea) : null
        });
      }
    }

    // 4. Calcular el plan de vuelo óptimo con el motor geométrico
    const resultadoPlan = generarPlanDeVuelo({
      poligonoGeoJson: lote.geometria,
      pistaPrincipal: lote.pistaPrincipal,
      pistaCarga: lote.pistaCarga,
      anchoAplicacionMetros: ancho,
      litrosPorHectarea: lHa,
      capacidadUtilLitros: cap
    });

    const ordenId = crypto.randomUUID();
    const planId = crypto.randomUUID();

    const snapshotParametros = {
      anchoAplicacionMetros: ancho,
      litrosPorHectarea: lHa,
      capacidadUtilLitros: cap,
      pistaPrincipalId: lote.pistaPrincipal.id,
      pistaCargaId: lote.pistaCarga.id,
      pistaPrincipalCoords: [lote.pistaPrincipal.longitud, lote.pistaPrincipal.latitud],
      pistaCargaCoords: [lote.pistaCarga.longitud, lote.pistaCarga.latitud]
    };

    // 5. Persistir en transacción atómica
    await prisma.$transaction(async (tx) => {
      // a. Orden
      await tx.ordenTrabajo.create({
        data: {
          id: ordenId,
          empresaId: empresaIdEfectiva,
          loteId: lote.id,
          aeronaveId: aeronave.id,
          anchoAplicacionMetros: ancho,
          litrosPorHectarea: lHa,
          capacidadUtilLitros: cap,
          estado: "PLANIFICADA",
          observaciones: observaciones ? observaciones.trim() : null,
          fechaPrevista: fechaPrevista ? new Date(fechaPrevista) : null
        }
      });

      // b. Productos
      for (const prod of productosValidados) {
        await tx.ordenProducto.create({
          data: {
            ordenId,
            productoId: prod.productoId,
            dosisPorHectarea: prod.dosisPorHectarea
          }
        });
      }

      // c. Plan de Vuelo
      await tx.planVuelo.create({
        data: {
          id: planId,
          ordenId,
          version: 1,
          orientacionGrados: resultadoPlan.orientacionGrados,
          cantidadPasadas: resultadoPlan.cantidadPasadas,
          cantidadViajes: resultadoPlan.cantidadViajes,
          superficieHa: resultadoPlan.superficieHa,
          caldoTotalLitros: resultadoPlan.caldoTotalLitros,
          distanciaTotalMetros: resultadoPlan.distanciaTotalMetros,
          distanciaAplicacionMetros: resultadoPlan.distanciaAplicacionMetros,
          distanciaTrasladoMetros: resultadoPlan.distanciaTrasladoMetros,
          parametros: snapshotParametros,
          generadoEn: new Date()
        }
      });

      // d. Viajes (con geometrías PostGIS)
      for (const v of resultadoPlan.viajes) {
        const viajeId = crypto.randomUUID();
        const recorridoGeoJsonStr = JSON.stringify(v.recorrido);
        const tramosGeoJsonStr = JSON.stringify(v.tramosAplicacion);

        const insertViajeSql = `
          INSERT INTO "Viaje" (
            "id", "planId", "numero",
            "pistaSalidaId", "pistaSalidaNombre", "tipoSalida",
            "pistaLlegadaId", "pistaLlegadaNombre", "tipoLlegada",
            "caldoLitros", "superficieHa",
            "distanciaMetros", "distanciaAplicacionMetros", "distanciaTrasladoMetros",
            "recorrido", "tramosAplicacion",
            "createdAt", "updatedAt"
          )
          VALUES (
            $1, $2, $3,
            $4, $5, $6,
            $7, $8, $9,
            $10, $11,
            $12, $13, $14,
            ST_SetSRID(ST_GeomFromGeoJSON($15), 4326),
            ST_SetSRID(ST_GeomFromGeoJSON($16), 4326),
            NOW(), NOW()
          );
        `;

        await tx.$queryRawUnsafe(
          insertViajeSql,
          viajeId,
          planId,
          v.numero,
          v.pistaSalidaId,
          v.pistaSalidaNombre,
          v.tipoSalida,
          v.pistaLlegadaId,
          v.pistaLlegadaNombre,
          v.tipoLlegada,
          v.caldoLitros,
          v.superficieHa,
          v.distanciaMetros,
          v.distanciaAplicacionMetros,
          v.distanciaTrasladoMetros,
          recorridoGeoJsonStr,
          tramosGeoJsonStr
        );
      }
    });

    // Consultar orden completa para respuesta
    const ordenCreada = await prisma.ordenTrabajo.findUnique({
      where: { id: ordenId },
      include: {
        lote: {
          select: {
            id: true,
            nombre: true,
            superficie: true,
            campoId: true,
            pistaPrincipalId: true,
            pistaCargaId: true
          }
        },
        aeronave: {
          select: { id: true, matricula: true, modelo: true }
        },
        productos: {
          include: { producto: { select: { id: true, nombre: true, unidadMedida: true } } }
        },
        planVuelo: {
          select: {
            id: true,
            version: true,
            orientacionGrados: true,
            cantidadPasadas: true,
            cantidadViajes: true,
            superficieHa: true,
            caldoTotalLitros: true,
            distanciaTotalMetros: true,
            distanciaAplicacionMetros: true,
            distanciaTrasladoMetros: true,
            generadoEn: true
          }
        }
      }
    });

    return res.status(201).json({
      ...ordenCreada,
      lote: {
        ...ordenCreada.lote,
        pistaPrincipal: lote.pistaPrincipal,
        pistaCarga: lote.pistaCarga
      },
      planVuelo: {
        ...ordenCreada.planVuelo,
        desactualizado: false
      }
    });
  } catch (error) {
    console.error("Error al crear orden de trabajo:", error);
    return res.status(500).json({ message: error.message || "No se pudo generar la orden y plan de vuelo" });
  }
};

/**
 * GET /api/ordenes
 * Lista órdenes de trabajo con filtros y resumen.
 */
const getOrdenes = async (req, res) => {
  try {
    const { loteId, campoId, estado, empresaId: empresaIdQuery } = req.query;

    const where = {};

    if (!isAdmin(req)) {
      where.empresaId = req.auth.empresaId;
    } else if (empresaIdQuery) {
      where.empresaId = empresaIdQuery;
    }

    if (loteId) where.loteId = loteId;
    if (estado) where.estado = estado;
    if (campoId) {
      where.lote = { campoId };
    }

    const ordenes = await prisma.ordenTrabajo.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        lote: {
          select: {
            id: true,
            nombre: true,
            superficie: true,
            campo: { select: { id: true, nombre: true } }
          }
        },
        aeronave: {
          select: { id: true, matricula: true, modelo: true }
        },
        productos: {
          include: {
            producto: { select: { id: true, nombre: true, tipo: true, unidadMedida: true } }
          }
        },
        planVuelo: {
          select: {
            id: true,
            version: true,
            orientacionGrados: true,
            cantidadPasadas: true,
            cantidadViajes: true,
            superficieHa: true,
            caldoTotalLitros: true,
            distanciaTotalMetros: true,
            distanciaAplicacionMetros: true,
            distanciaTrasladoMetros: true,
            generadoEn: true
          }
        }
      }
    });

    return res.json(ordenes);
  } catch (error) {
    console.error("Error al obtener órdenes:", error);
    return res.status(500).json({ message: "No se pudieron cargar las órdenes de trabajo" });
  }
};

/**
 * GET /api/ordenes/:id
 * Detalle de una orden de trabajo.
 */
const getOrdenById = async (req, res) => {
  try {
    const { id } = req.params;

    const orden = await prisma.ordenTrabajo.findUnique({
      where: { id },
      include: {
        lote: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            superficie: true,
            campo: { select: { id: true, nombre: true } }
          }
        },
        aeronave: {
          select: { id: true, matricula: true, modelo: true, capacidadUtilLitros: true, anchoAplicacionMetros: true }
        },
        productos: {
          include: {
            producto: { select: { id: true, nombre: true, tipo: true, unidadMedida: true } }
          }
        },
        planVuelo: {
          select: {
            id: true,
            version: true,
            orientacionGrados: true,
            cantidadPasadas: true,
            cantidadViajes: true,
            superficieHa: true,
            caldoTotalLitros: true,
            distanciaTotalMetros: true,
            distanciaAplicacionMetros: true,
            distanciaTrasladoMetros: true,
            generadoEn: true
          }
        }
      }
    });

    if (!orden) {
      return res.status(404).json({ message: "La orden de trabajo no existe" });
    }

    if (!isAdmin(req) && orden.empresaId !== req.auth.empresaId) {
      return res.status(404).json({ message: "La orden de trabajo no existe" });
    }

    return res.json(orden);
  } catch (error) {
    console.error("Error al obtener orden por ID:", error);
    return res.status(500).json({ message: "No se pudo cargar la orden de trabajo" });
  }
};

/**
 * GET /api/ordenes/:id/plan
 * Retorna el plan de vuelo completo con los viajes y sus geometrías GeoJSON para Leaflet.
 */
const getPlanByOrdenId = async (req, res) => {
  try {
    const { id: ordenId } = req.params;

    const orden = await prisma.ordenTrabajo.findUnique({
      where: { id: ordenId },
      select: { id: true, empresaId: true, loteId: true }
    });

    if (!orden || (!isAdmin(req) && orden.empresaId !== req.auth.empresaId)) {
      return res.status(404).json({ message: "La orden de trabajo no existe" });
    }

    const plan = await prisma.planVuelo.findUnique({
      where: { ordenId }
    });

    if (!plan) {
      return res.status(404).json({ message: "La orden no tiene un plan de vuelo generado" });
    }

    // Consultar viajes con sus geometrías en GeoJSON
    const viajesQuery = `
      SELECT
        v."id", v."numero",
        v."pistaSalidaId", v."pistaSalidaNombre", v."tipoSalida",
        v."pistaLlegadaId", v."pistaLlegadaNombre", v."tipoLlegada",
        v."caldoLitros", v."superficieHa",
        v."distanciaMetros", v."distanciaAplicacionMetros", v."distanciaTrasladoMetros",
        ST_AsGeoJSON(v."recorrido") as "recorrido",
        ST_AsGeoJSON(v."tramosAplicacion") as "tramosAplicacion"
      FROM "Viaje" v
      WHERE v."planId" = $1
      ORDER BY v."numero" ASC;
    `;

    const viajesRows = await prisma.$queryRawUnsafe(viajesQuery, plan.id);

    const viajesFormateados = viajesRows.map((v) => ({
      ...v,
      caldoLitros: Number(v.caldoLitros),
      superficieHa: Number(v.superficieHa),
      distanciaMetros: Number(v.distanciaMetros),
      distanciaAplicacionMetros: Number(v.distanciaAplicacionMetros),
      distanciaTrasladoMetros: Number(v.distanciaTrasladoMetros),
      recorrido: JSON.parse(v.recorrido),
      tramosAplicacion: JSON.parse(v.tramosAplicacion)
    }));

    // Obtener datos actuales del lote y pistas para verificar si el plan está desactualizado
    const datosLote = await obtenerLoteConGeometriaYPistas(orden.loteId, orden.empresaId, isAdmin(req));
    let desactualizado = false;

    if (!datosLote.error) {
      const { lote } = datosLote;
      const fechaPlan = new Date(plan.generadoEn).getTime();

      const loteModificado = new Date(lote.loteUpdatedAt).getTime() > fechaPlan;
      const pistaPModificada = new Date(lote.pistaPrincipal.updatedAt).getTime() > fechaPlan;
      const pistaCModificada = new Date(lote.pistaCarga.updatedAt).getTime() > fechaPlan;

      // Verificar si cambiaron las pistas asignadas respecto al snapshot guardado
      const params = plan.parametros || {};
      const cambioPistaP = params.pistaPrincipalId && params.pistaPrincipalId !== lote.pistaPrincipal.id;
      const cambioPistaC = params.pistaCargaId && params.pistaCargaId !== lote.pistaCarga.id;

      if (loteModificado || pistaPModificada || pistaCModificada || cambioPistaP || cambioPistaC) {
        desactualizado = true;
      }
    }

    return res.json({
      id: plan.id,
      ordenId: plan.ordenId,
      version: plan.version,
      orientacionGrados: plan.orientacionGrados,
      cantidadPasadas: plan.cantidadPasadas,
      cantidadViajes: plan.cantidadViajes,
      superficieHa: plan.superficieHa,
      caldoTotalLitros: plan.caldoTotalLitros,
      distanciaTotalMetros: plan.distanciaTotalMetros,
      distanciaAplicacionMetros: plan.distanciaAplicacionMetros,
      distanciaTrasladoMetros: plan.distanciaTrasladoMetros,
      generadoEn: plan.generadoEn,
      desactualizado,
      lote: datosLote.lote
        ? {
            id: datosLote.lote.id,
            nombre: datosLote.lote.nombre,
            superficie: datosLote.lote.superficie,
            geometria: datosLote.lote.geometria
          }
        : null,
      pistaPrincipal: datosLote.lote?.pistaPrincipal || null,
      pistaCarga: datosLote.lote?.pistaCarga || null,
      viajes: viajesFormateados
    });
  } catch (error) {
    console.error("Error al obtener plan de vuelo:", error);
    return res.status(500).json({ message: "No se pudo cargar el plan de vuelo" });
  }
};

/**
 * Función interna para recalcular y persistir un plan de vuelo actualizado.
 */
const regenerarPlanDeVueloInterno = async ({ orden, lote, ancho, lHa, cap }) => {
  const resultadoPlan = generarPlanDeVuelo({
    poligonoGeoJson: lote.geometria,
    pistaPrincipal: lote.pistaPrincipal,
    pistaCarga: lote.pistaCarga,
    anchoAplicacionMetros: ancho,
    litrosPorHectarea: lHa,
    capacidadUtilLitros: cap
  });

  const planExistente = await prisma.planVuelo.findUnique({
    where: { ordenId: orden.id }
  });

  const nuevaVersion = planExistente ? planExistente.version + 1 : 1;
  const planId = planExistente ? planExistente.id : crypto.randomUUID();

  const snapshotParametros = {
    anchoAplicacionMetros: ancho,
    litrosPorHectarea: lHa,
    capacidadUtilLitros: cap,
    pistaPrincipalId: lote.pistaPrincipal.id,
    pistaCargaId: lote.pistaCarga.id,
    pistaPrincipalCoords: [lote.pistaPrincipal.longitud, lote.pistaPrincipal.latitud],
    pistaCargaCoords: [lote.pistaCarga.longitud, lote.pistaCarga.latitud]
  };

  await prisma.$transaction(async (tx) => {
    // Si ya existía el plan, eliminar los viajes anteriores
    if (planExistente) {
      await tx.$executeRawUnsafe(`DELETE FROM "Viaje" WHERE "planId" = $1;`, planId);

      await tx.planVuelo.update({
        where: { id: planId },
        data: {
          version: nuevaVersion,
          orientacionGrados: resultadoPlan.orientacionGrados,
          cantidadPasadas: resultadoPlan.cantidadPasadas,
          cantidadViajes: resultadoPlan.cantidadViajes,
          superficieHa: resultadoPlan.superficieHa,
          caldoTotalLitros: resultadoPlan.caldoTotalLitros,
          distanciaTotalMetros: resultadoPlan.distanciaTotalMetros,
          distanciaAplicacionMetros: resultadoPlan.distanciaAplicacionMetros,
          distanciaTrasladoMetros: resultadoPlan.distanciaTrasladoMetros,
          parametros: snapshotParametros,
          generadoEn: new Date()
        }
      });
    } else {
      await tx.planVuelo.create({
        data: {
          id: planId,
          ordenId: orden.id,
          version: nuevaVersion,
          orientacionGrados: resultadoPlan.orientacionGrados,
          cantidadPasadas: resultadoPlan.cantidadPasadas,
          cantidadViajes: resultadoPlan.cantidadViajes,
          superficieHa: resultadoPlan.superficieHa,
          caldoTotalLitros: resultadoPlan.caldoTotalLitros,
          distanciaTotalMetros: resultadoPlan.distanciaTotalMetros,
          distanciaAplicacionMetros: resultadoPlan.distanciaAplicacionMetros,
          distanciaTrasladoMetros: resultadoPlan.distanciaTrasladoMetros,
          parametros: snapshotParametros,
          generadoEn: new Date()
        }
      });
    }

    // Insertar los nuevos viajes
    for (const v of resultadoPlan.viajes) {
      const viajeId = crypto.randomUUID();
      const insertViajeSql = `
        INSERT INTO "Viaje" (
          "id", "planId", "numero",
          "pistaSalidaId", "pistaSalidaNombre", "tipoSalida",
          "pistaLlegadaId", "pistaLlegadaNombre", "tipoLlegada",
          "caldoLitros", "superficieHa",
          "distanciaMetros", "distanciaAplicacionMetros", "distanciaTrasladoMetros",
          "recorrido", "tramosAplicacion",
          "createdAt", "updatedAt"
        )
        VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8, $9,
          $10, $11,
          $12, $13, $14,
          ST_SetSRID(ST_GeomFromGeoJSON($15), 4326),
          ST_SetSRID(ST_GeomFromGeoJSON($16), 4326),
          NOW(), NOW()
        );
      `;

      await tx.$queryRawUnsafe(
        insertViajeSql,
        viajeId,
        planId,
        v.numero,
        v.pistaSalidaId,
        v.pistaSalidaNombre,
        v.tipoSalida,
        v.pistaLlegadaId,
        v.pistaLlegadaNombre,
        v.tipoLlegada,
        v.caldoLitros,
        v.superficieHa,
        v.distanciaMetros,
        v.distanciaAplicacionMetros,
        v.distanciaTrasladoMetros,
        JSON.stringify(v.recorrido),
        JSON.stringify(v.tramosAplicacion)
      );
    }
  });

  return { planId, version: nuevaVersion, resultadoPlan };
};

/**
 * PUT /api/ordenes/:id
 * Actualiza los datos de la orden y REGENERA AUTOMÁTICAMENTE el plan de vuelo.
 */
const updateOrden = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      anchoAplicacionMetros,
      litrosPorHectarea,
      capacidadUtilLitros,
      aeronaveId,
      observaciones,
      fechaPrevista,
      productos
    } = req.body;

    const ordenActual = await prisma.ordenTrabajo.findUnique({
      where: { id },
      include: { lote: true }
    });

    if (!ordenActual || (!isAdmin(req) && ordenActual.empresaId !== req.auth.empresaId)) {
      return res.status(404).json({ message: "La orden de trabajo no existe" });
    }

    const nuevoAncho = anchoAplicacionMetros !== undefined ? Number(anchoAplicacionMetros) : ordenActual.anchoAplicacionMetros;
    const nuevoLHa = litrosPorHectarea !== undefined ? Number(litrosPorHectarea) : ordenActual.litrosPorHectarea;
    const nuevaCap = capacidadUtilLitros !== undefined ? Number(capacidadUtilLitros) : ordenActual.capacidadUtilLitros;
    let nuevaAeronaveId = ordenActual.aeronaveId;

    if (!(nuevoAncho > 0 && nuevoAncho <= 100)) {
      return res.status(400).json({ message: "El ancho de aplicación debe ser entre 1 y 100 metros" });
    }
    if (!(nuevoLHa > 0 && nuevoLHa <= 500)) {
      return res.status(400).json({ message: "Los litros por hectárea deben ser entre 1 y 500 L/ha" });
    }
    if (!(nuevaCap > 0 && nuevaCap <= 20000)) {
      return res.status(400).json({ message: "La capacidad útil debe ser entre 1 y 20.000 L" });
    }

    if (aeronaveId && aeronaveId !== ordenActual.aeronaveId) {
      const aeronave = await prisma.aeronave.findUnique({
        where: { id: aeronaveId },
        select: { id: true, estado: true, empresaId: true }
      });
      if (!aeronave || aeronave.empresaId !== ordenActual.empresaId) {
        return res.status(400).json({ message: "La aeronave especificada no existe o no pertenece a la empresa" });
      }
      if (aeronave.estado !== "ACTIVA") {
        return res.status(400).json({ message: "La aeronave seleccionada no está activa" });
      }
      nuevaAeronaveId = aeronave.id;
    }

    // Obtener lote y pistas
    const datosLote = await obtenerLoteConGeometriaYPistas(ordenActual.loteId, ordenActual.empresaId, isAdmin(req));
    if (datosLote.error) {
      return res.status(datosLote.status).json({ message: datosLote.error });
    }

    // Actualizar datos de la orden
    await prisma.$transaction(async (tx) => {
      await tx.ordenTrabajo.update({
        where: { id },
        data: {
          anchoAplicacionMetros: nuevoAncho,
          litrosPorHectarea: nuevoLHa,
          capacidadUtilLitros: nuevaCap,
          aeronaveId: nuevaAeronaveId,
          observaciones: observaciones !== undefined ? (observaciones ? observaciones.trim() : null) : undefined,
          fechaPrevista: fechaPrevista !== undefined ? (fechaPrevista ? new Date(fechaPrevista) : null) : undefined
        }
      });

      // Actualizar productos si se proveyó la lista
      if (Array.isArray(productos)) {
        await tx.ordenProducto.deleteMany({ where: { ordenId: id } });
        for (const item of productos) {
          if (item.productoId) {
            await tx.ordenProducto.create({
              data: {
                ordenId: id,
                productoId: item.productoId,
                dosisPorHectarea: item.dosisPorHectarea ? Number(item.dosisPorHectarea) : null
              }
            });
          }
        }
      }
    });

    // Regenerar el plan automáticamente
    await regenerarPlanDeVueloInterno({
      orden: ordenActual,
      lote: datosLote.lote,
      ancho: nuevoAncho,
      lHa: nuevoLHa,
      cap: nuevaCap
    });

    // Retornar detalle actualizado
    const ordenActualizada = await prisma.ordenTrabajo.findUnique({
      where: { id },
      include: {
        lote: { select: { id: true, nombre: true, superficie: true } },
        aeronave: { select: { id: true, matricula: true, modelo: true } },
        productos: { include: { producto: true } },
        planVuelo: true
      }
    });

    return res.json({
      ...ordenActualizada,
      planVuelo: {
        ...ordenActualizada.planVuelo,
        desactualizado: false
      }
    });
  } catch (error) {
    console.error("Error al actualizar orden y regenerar plan:", error);
    return res.status(500).json({ message: error.message || "No se pudo actualizar la orden de trabajo" });
  }
};

/**
 * POST /api/ordenes/:id/plan/regenerar
 * Fuerza la regeneración del plan de vuelo de la orden con la geometría y pistas actuales.
 */
const regenerarPlan = async (req, res) => {
  try {
    const { id } = req.params;

    const orden = await prisma.ordenTrabajo.findUnique({
      where: { id }
    });

    if (!orden || (!isAdmin(req) && orden.empresaId !== req.auth.empresaId)) {
      return res.status(404).json({ message: "La orden de trabajo no existe" });
    }

    const datosLote = await obtenerLoteConGeometriaYPistas(orden.loteId, orden.empresaId, isAdmin(req));
    if (datosLote.error) {
      return res.status(datosLote.status).json({ message: datosLote.error });
    }

    const { planId, version } = await regenerarPlanDeVueloInterno({
      orden,
      lote: datosLote.lote,
      ancho: orden.anchoAplicacionMetros,
      lHa: orden.litrosPorHectarea,
      cap: orden.capacidadUtilLitros
    });

    const planActualizado = await prisma.planVuelo.findUnique({
      where: { id: planId }
    });

    return res.json({
      message: "Plan de vuelo regenerado exitosamente",
      plan: {
        ...planActualizado,
        desactualizado: false
      }
    });
  } catch (error) {
    console.error("Error al regenerar plan:", error);
    return res.status(500).json({ message: error.message || "No se pudo regenerar el plan de vuelo" });
  }
};

/**
 * DELETE /api/ordenes/:id
 * Elimina una orden de trabajo (y por cascade sus planes y viajes).
 */
const deleteOrden = async (req, res) => {
  try {
    const { id } = req.params;

    const orden = await prisma.ordenTrabajo.findUnique({
      where: { id },
      select: { id: true, estado: true, empresaId: true }
    });

    if (!orden || (!isAdmin(req) && orden.empresaId !== req.auth.empresaId)) {
      return res.status(404).json({ message: "La orden de trabajo no existe" });
    }

    if (orden.estado === "EN_EJECUCION" || orden.estado === "FINALIZADA") {
      return res.status(400).json({
        message: `No se puede eliminar una orden en estado ${orden.estado}`
      });
    }

    await prisma.ordenTrabajo.delete({
      where: { id }
    });

    return res.json({ message: "Orden de trabajo eliminada exitosamente" });
  } catch (error) {
    console.error("Error al eliminar orden de trabajo:", error);
    return res.status(500).json({ message: "No se pudo eliminar la orden de trabajo" });
  }
};

module.exports = {
  createOrden,
  getOrdenes,
  getOrdenById,
  getPlanByOrdenId,
  updateOrden,
  regenerarPlan,
  deleteOrden
};

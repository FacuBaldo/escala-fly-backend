const crypto = require("crypto");
const prisma = require("../configs/prisma");
const { getEmpresaIdParaLectura, getEmpresaIdParaEscritura, isAdmin } = require("../utils/autorizacion");
const { esTextoNoVacio, esTextoOpcional } = require("../utils/validacion");
const { PATRONES_VALIDOS, RADIO_GIRO_POR_DEFECTO, generarPlanDeVuelo } = require("../services/planificador/index");
const { CATALOGO_TIPO, CATALOGO_UNIDAD } = require("../utils/catalogos");

// Estados por los que puede pasar una orden de trabajo
const ESTADOS_ORDEN = ["PENDIENTE", "PLANIFICADA", "EN_EJECUCION", "FINALIZADA", "CANCELADA"];
// Una vez finalizada o cancelada, la orden queda cerrada
const ESTADOS_CERRADOS = ["FINALIZADA", "CANCELADA"];

// La persistencia del plan puede incluir muchos viajes; se amplía el límite por defecto (5 s)
const OPCIONES_TRANSACCION = { maxWait: 15000, timeout: 120000 };

/**
 * Convierte una fecha recibida por API. Devuelve { fecha } o { error }.
 */
const parsearFechaPrevista = (valor) => {
  if (valor === undefined || valor === null || valor === "") return { fecha: null };

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return { error: "La fecha prevista no es una fecha válida" };
  }

  return { fecha };
};

/**
 * Valida la dosis por hectárea de un producto. Devuelve { dosis } o { error }.
 */
const parsearDosis = (valor, nombreProducto) => {
  if (valor === undefined || valor === null || valor === "") return { dosis: null };

  const dosis = Number(valor);
  if (!Number.isFinite(dosis) || dosis < 0) {
    return { error: `La dosis por hectárea de ${nombreProducto} debe ser un número mayor o igual a 0` };
  }

  return { dosis };
};

/**
 * Inserta todos los viajes del plan en una sola sentencia para evitar
 * decenas de viajes de ida y vuelta a la base dentro de la transacción.
 */
const insertarViajes = async (tx, planId, viajes) => {
  if (!viajes || viajes.length === 0) return;

  const columnasPorViaje = 16;
  const valores = [];
  const filas = viajes.map((v, indice) => {
    const base = indice * columnasPorViaje;
    const p = (desplazamiento) => `$${base + desplazamiento}`;

    valores.push(
      crypto.randomUUID(),
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

    return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}, ${p(12)}, ${p(13)}, ${p(14)},
      ST_SetSRID(ST_GeomFromGeoJSON(${p(15)}), 4326), ST_SetSRID(ST_GeomFromGeoJSON(${p(16)}), 4326), NOW(), NOW())`;
  });

  const sql = `
    INSERT INTO "Viaje" (
      "id", "planId", "numero",
      "pistaSalidaId", "pistaSalidaNombre", "tipoSalida",
      "pistaLlegadaId", "pistaLlegadaNombre", "tipoLlegada",
      "caldoLitros", "superficieHa",
      "distanciaMetros", "distanciaAplicacionMetros", "distanciaTrasladoMetros",
      "recorrido", "tramosAplicacion",
      "createdAt", "updatedAt"
    )
    VALUES ${filas.join(", ")};
  `;

  await tx.$queryRawUnsafe(sql, ...valores);
};

/**
 * Los errores de validación del planificador (capacidad insuficiente, geometría inválida)
 * son culpa de los datos enviados, no del servidor.
 */
const esErrorDePlanificacion = (error) => {
  const mensaje = error?.message || "";
  return /capacidad útil|ancho de aplicación|litros por hectárea|radio de giro|patrón de trabajo|polígono|pista (principal|de carga) es obligatoria|ruta válida/i.test(mensaje);
};

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
      radioGiroMetros,
      patron,
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

    const validacionFecha = parsearFechaPrevista(fechaPrevista);
    if (validacionFecha.error) {
      return res.status(400).json({ message: validacionFecha.error });
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
      select: { id: true, matricula: true, modelo: true, estado: true, empresaId: true, radioGiroMetros: true }
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
          select: { id: true, nombre: true, empresaId: true }
        });
        if (!prod || prod.empresaId !== empresaIdEfectiva) {
          return res.status(400).json({ message: `El producto ${item.productoId} no existe o no pertenece a la empresa` });
        }
        const validacionDosis = parsearDosis(item.dosisPorHectarea, prod.nombre);
        if (validacionDosis.error) {
          return res.status(400).json({ message: validacionDosis.error });
        }

        productosValidados.push({
          productoId: prod.id,
          nombre: prod.nombre,
          dosisPorHectarea: validacionDosis.dosis
        });
      }
    }

    // 4. Radio de giro (si no viene, el de la aeronave) y patrón de trabajo
    const parametrosRuta = parsearParametrosRuta(
      { radioGiroMetros, patron },
      { radio: aeronave.radioGiroMetros ?? RADIO_GIRO_POR_DEFECTO, patron: "AUTOMATICO" }
    );
    if (parametrosRuta.error) {
      return res.status(400).json({ message: parametrosRuta.error });
    }

    // 5. Calcular el plan de vuelo óptimo con el motor geométrico
    let calculo;
    try {
      calculo = calcularPlan({ lote, ancho, lHa, cap, ...parametrosRuta });
    } catch (errorPlan) {
      if (esErrorDePlanificacion(errorPlan)) {
        return res.status(400).json({ message: errorPlan.message });
      }
      throw errorPlan;
    }

    const ordenId = crypto.randomUUID();

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
          radioGiroMetros: parametrosRuta.radio,
          patron: parametrosRuta.patron,
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

      // c. Plan de vuelo y viajes
      await guardarPlan(tx, ordenId, calculo);
    }, OPCIONES_TRANSACCION);

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
          include: { producto: { select: { id: true, nombre: true, unidadMedida: { select: CATALOGO_UNIDAD } } } }
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
            distanciaGirosMetros: true,
            patron: true,
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
            producto: { select: { id: true, nombre: true, tipo: { select: CATALOGO_TIPO }, unidadMedida: { select: CATALOGO_UNIDAD } } }
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
            distanciaGirosMetros: true,
            patron: true,
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
            producto: { select: { id: true, nombre: true, tipo: { select: CATALOGO_TIPO }, unidadMedida: { select: CATALOGO_UNIDAD } } }
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
            distanciaGirosMetros: true,
            patron: true,
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
    const params = plan.parametros || {};
    let desactualizado = false;
    // Por qué conviene regenerar: cambió el lote o sus pistas, o el plan se calculó
    // antes de que existieran los giros reales (no tiene radio de giro en su foto)
    let motivoDesactualizado = null;

    if (!datosLote.error) {
      const { lote } = datosLote;
      const fechaPlan = new Date(plan.generadoEn).getTime();

      const loteModificado = new Date(lote.loteUpdatedAt).getTime() > fechaPlan;
      const pistaPModificada = new Date(lote.pistaPrincipal.updatedAt).getTime() > fechaPlan;
      const pistaCModificada = new Date(lote.pistaCarga.updatedAt).getTime() > fechaPlan;

      // Verificar si cambiaron las pistas asignadas respecto al snapshot guardado
      const cambioPistaP = params.pistaPrincipalId && params.pistaPrincipalId !== lote.pistaPrincipal.id;
      const cambioPistaC = params.pistaCargaId && params.pistaCargaId !== lote.pistaCarga.id;

      if (loteModificado || pistaPModificada || pistaCModificada || cambioPistaP || cambioPistaC) {
        desactualizado = true;
        motivoDesactualizado = "LOTE_O_PISTAS";
      }
    }

    if (!desactualizado && params.radioGiroMetros === undefined) {
      desactualizado = true;
      motivoDesactualizado = "MODELO_ANTERIOR";
    }

    return res.json({
      id: plan.id,
      ordenId: plan.ordenId,
      version: plan.version,
      orientacionGrados: plan.orientacionGrados,
      patron: plan.patron,
      patronSolicitado: params.patronSolicitado ?? null,
      radioGiroMetros: params.radioGiroMetros ?? null,
      comparacionPatrones: params.comparacionPatrones ?? null,
      cantidadPasadas: plan.cantidadPasadas,
      cantidadViajes: plan.cantidadViajes,
      superficieHa: plan.superficieHa,
      caldoTotalLitros: plan.caldoTotalLitros,
      distanciaTotalMetros: plan.distanciaTotalMetros,
      distanciaAplicacionMetros: plan.distanciaAplicacionMetros,
      distanciaTrasladoMetros: plan.distanciaTrasladoMetros,
      distanciaGirosMetros: plan.distanciaGirosMetros,
      generadoEn: plan.generadoEn,
      desactualizado,
      motivoDesactualizado,
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

// Radio de giro razonable para un avión agrícola (mismo rango que en la aeronave)
const RADIO_GIRO_MINIMO = 30;
const RADIO_GIRO_MAXIMO = 1000;

/**
 * Radio de giro y patrón con los que se calcula la ruta. Lo que no viene en el
 * pedido se toma de `porDefecto` (los valores actuales de la orden, o los de la
 * aeronave al crearla). Devuelve { radio, patron } o { error }.
 */
const parsearParametrosRuta = ({ radioGiroMetros, patron }, porDefecto) => {
  const vacio = (valor) => valor === undefined || valor === null || valor === "";
  const radio = vacio(radioGiroMetros) ? porDefecto.radio : Number(radioGiroMetros);

  if (!Number.isFinite(radio) || radio < RADIO_GIRO_MINIMO || radio > RADIO_GIRO_MAXIMO) {
    return { error: `El radio de giro debe estar entre ${RADIO_GIRO_MINIMO} y ${RADIO_GIRO_MAXIMO} metros` };
  }

  const patronElegido = vacio(patron) ? porDefecto.patron : patron;
  if (!PATRONES_VALIDOS.includes(patronElegido)) {
    return { error: `El patrón de trabajo debe ser uno de: ${PATRONES_VALIDOS.join(", ")}` };
  }

  return { radio, patron: patronElegido };
};

/**
 * Calcula la ruta sin tocar la base. Se llama ANTES de guardar cualquier cambio:
 * si los parámetros no permiten planificar, la orden no se modifica.
 */
const calcularPlan = ({ lote, ancho, lHa, cap, radio, patron }) => {
  const resultadoPlan = generarPlanDeVuelo({
    poligonoGeoJson: lote.geometria,
    pistaPrincipal: lote.pistaPrincipal,
    pistaCarga: lote.pistaCarga,
    anchoAplicacionMetros: ancho,
    litrosPorHectarea: lHa,
    capacidadUtilLitros: cap,
    radioGiroMetros: radio,
    patron
  });

  // Foto de con qué se calculó: sirve para saber si el plan quedó desactualizado
  const parametros = {
    anchoAplicacionMetros: ancho,
    litrosPorHectarea: lHa,
    capacidadUtilLitros: cap,
    radioGiroMetros: radio,
    patronSolicitado: patron,
    comparacionPatrones: resultadoPlan.comparacionPatrones,
    pistaPrincipalId: lote.pistaPrincipal.id,
    pistaCargaId: lote.pistaCarga.id,
    pistaPrincipalCoords: [lote.pistaPrincipal.longitud, lote.pistaPrincipal.latitud],
    pistaCargaCoords: [lote.pistaCarga.longitud, lote.pistaCarga.latitud]
  };

  return { resultadoPlan, parametros };
};

/** Crea o reemplaza el plan de la orden y sus viajes, dentro de la transacción recibida. */
const guardarPlan = async (tx, ordenId, { resultadoPlan, parametros }) => {
  const planExistente = await tx.planVuelo.findUnique({ where: { ordenId } });
  const version = planExistente ? planExistente.version + 1 : 1;
  const planId = planExistente ? planExistente.id : crypto.randomUUID();

  const datos = {
    version,
    orientacionGrados: resultadoPlan.orientacionGrados,
    patron: resultadoPlan.patron,
    cantidadPasadas: resultadoPlan.cantidadPasadas,
    cantidadViajes: resultadoPlan.cantidadViajes,
    superficieHa: resultadoPlan.superficieHa,
    caldoTotalLitros: resultadoPlan.caldoTotalLitros,
    distanciaTotalMetros: resultadoPlan.distanciaTotalMetros,
    distanciaAplicacionMetros: resultadoPlan.distanciaAplicacionMetros,
    distanciaTrasladoMetros: resultadoPlan.distanciaTrasladoMetros,
    distanciaGirosMetros: resultadoPlan.distanciaGirosMetros,
    parametros,
    generadoEn: new Date()
  };

  if (planExistente) {
    await tx.$executeRawUnsafe(`DELETE FROM "Viaje" WHERE "planId" = $1;`, planId);
    await tx.planVuelo.update({ where: { id: planId }, data: datos });
  } else {
    await tx.planVuelo.create({ data: { id: planId, ordenId, ...datos } });
  }

  // Los viajes (con geometrías PostGIS) van en una sola sentencia
  await insertarViajes(tx, planId, resultadoPlan.viajes);

  return { planId, version };
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
      radioGiroMetros,
      patron,
      observaciones,
      fechaPrevista,
      estado,
      productos
    } = req.body;

    const ordenActual = await prisma.ordenTrabajo.findUnique({
      where: { id },
      include: { lote: true }
    });

    if (!ordenActual || (!isAdmin(req) && ordenActual.empresaId !== req.auth.empresaId)) {
      return res.status(404).json({ message: "La orden de trabajo no existe" });
    }

    if (ESTADOS_CERRADOS.includes(ordenActual.estado)) {
      return res.status(409).json({
        message: `La orden está ${ordenActual.estado.toLowerCase()} y ya no puede modificarse`
      });
    }

    if (estado !== undefined && !ESTADOS_ORDEN.includes(estado)) {
      return res.status(400).json({
        message: `El estado de la orden debe ser uno de: ${ESTADOS_ORDEN.join(", ")}`
      });
    }

    const validacionFecha = parsearFechaPrevista(fechaPrevista);
    if (validacionFecha.error) {
      return res.status(400).json({ message: validacionFecha.error });
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

    const parametrosRuta = parsearParametrosRuta(
      { radioGiroMetros, patron },
      { radio: ordenActual.radioGiroMetros, patron: ordenActual.patron }
    );
    if (parametrosRuta.error) {
      return res.status(400).json({ message: parametrosRuta.error });
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

    // Validar la lista de productos si fue enviada
    const productosValidados = [];
    if (Array.isArray(productos)) {
      for (const item of productos) {
        if (!item.productoId) {
          return res.status(400).json({ message: "Cada producto en la mezcla debe incluir productoId" });
        }

        const prod = await prisma.producto.findUnique({
          where: { id: item.productoId },
          select: { id: true, nombre: true, empresaId: true }
        });

        if (!prod || prod.empresaId !== ordenActual.empresaId) {
          return res.status(400).json({ message: `El producto ${item.productoId} no existe o no pertenece a la empresa` });
        }

        const validacionDosis = parsearDosis(item.dosisPorHectarea, prod.nombre);
        if (validacionDosis.error) {
          return res.status(400).json({ message: validacionDosis.error });
        }

        productosValidados.push({ productoId: prod.id, dosisPorHectarea: validacionDosis.dosis });
      }
    }

    // Obtener lote y pistas
    const datosLote = await obtenerLoteConGeometriaYPistas(ordenActual.loteId, ordenActual.empresaId, isAdmin(req));
    if (datosLote.error) {
      return res.status(datosLote.status).json({ message: datosLote.error });
    }

    // Calcular la ruta nueva antes de tocar nada: si los parámetros no permiten
    // planificar, la orden queda como estaba (antes se guardaban igual y el plan
    // quedaba viejo).
    let calculo;
    try {
      calculo = calcularPlan({
        lote: datosLote.lote,
        ancho: nuevoAncho,
        lHa: nuevoLHa,
        cap: nuevaCap,
        ...parametrosRuta
      });
    } catch (errorPlan) {
      if (esErrorDePlanificacion(errorPlan)) {
        return res.status(400).json({ message: errorPlan.message });
      }
      throw errorPlan;
    }

    // Orden, productos y plan nuevo en una sola transacción
    await prisma.$transaction(async (tx) => {
      await tx.ordenTrabajo.update({
        where: { id },
        data: {
          anchoAplicacionMetros: nuevoAncho,
          litrosPorHectarea: nuevoLHa,
          capacidadUtilLitros: nuevaCap,
          radioGiroMetros: parametrosRuta.radio,
          patron: parametrosRuta.patron,
          aeronaveId: nuevaAeronaveId,
          estado: estado !== undefined ? estado : undefined,
          observaciones: observaciones !== undefined ? (observaciones ? observaciones.trim() : null) : undefined,
          fechaPrevista: fechaPrevista !== undefined ? validacionFecha.fecha : undefined
        }
      });

      // Actualizar productos si se proveyó la lista
      if (Array.isArray(productos)) {
        await tx.ordenProducto.deleteMany({ where: { ordenId: id } });
        for (const item of productosValidados) {
          await tx.ordenProducto.create({
            data: {
              ordenId: id,
              productoId: item.productoId,
              dosisPorHectarea: item.dosisPorHectarea
            }
          });
        }
      }

      await guardarPlan(tx, id, calculo);
    }, OPCIONES_TRANSACCION);

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

    let calculo;
    try {
      calculo = calcularPlan({
        lote: datosLote.lote,
        ancho: orden.anchoAplicacionMetros,
        lHa: orden.litrosPorHectarea,
        cap: orden.capacidadUtilLitros,
        radio: orden.radioGiroMetros,
        patron: orden.patron
      });
    } catch (errorPlan) {
      if (esErrorDePlanificacion(errorPlan)) {
        return res.status(400).json({ message: errorPlan.message });
      }
      throw errorPlan;
    }

    const { planId } = await prisma.$transaction((tx) => guardarPlan(tx, orden.id, calculo), OPCIONES_TRANSACCION);

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

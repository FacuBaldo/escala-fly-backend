const crypto = require("crypto");
const prisma = require("../configs/prisma");
const { getEmpresaIdParaEscritura, isAdmin } = require("../utils/autorizacion");
const { esTextoNoVacio, esTextoOpcional } = require("../utils/validacion");

const validarCoordenadas = (latitud, longitud) => {
  const lat = Number(latitud);
  const lng = Number(longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "La latitud y longitud deben ser números válidos" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: `Coordenadas fuera de rango: [lat: ${lat}, lng: ${lng}]` };
  }
  return { lat, lng };
};

const parseBooleano = (valor) => {
  if (valor === true || valor === "true") return true;
  if (valor === false || valor === "false") return false;
  return undefined;
};

const formatearPista = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    activo: row.activo,
    latitud: row.latitud !== null && row.latitud !== undefined ? Number(row.latitud) : null,
    longitud: row.longitud !== null && row.longitud !== undefined ? Number(row.longitud) : null,
    empresaId: row.empresaId,
    empresaNombre: row.empresaNombre || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

/**
 * POST /api/pistas
 * Registra una nueva pista georreferenciada.
 */
const createPista = async (req, res) => {
  try {
    const { nombre, descripcion, latitud, longitud } = req.body;
    const empresaId = getEmpresaIdParaEscritura(req);

    if (!esTextoNoVacio(nombre)) {
      return res.status(400).json({ message: "El nombre de la pista es obligatorio" });
    }

    if (!esTextoOpcional(descripcion)) {
      return res.status(400).json({ message: "La descripción de la pista debe ser un texto" });
    }

    if (latitud === undefined || longitud === undefined) {
      return res.status(400).json({ message: "La latitud y la longitud son obligatorias" });
    }

    const valCoords = validarCoordenadas(latitud, longitud);
    if (valCoords.error) {
      return res.status(400).json({ message: valCoords.error });
    }

    if (!empresaId) {
      return res.status(400).json({ message: "La empresa asociada es obligatoria" });
    }

    // Verificar que la empresa exista
    const empresaExiste = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, nombre: true }
    });
    if (!empresaExiste) {
      return res.status(400).json({ message: "La empresa asociada no existe" });
    }

    const id = crypto.randomUUID();

    const query = `
      INSERT INTO "Pista" (
        "id", "nombre", "descripcion", "activo", "ubicacion", "empresaId", "createdAt", "updatedAt"
      )
      VALUES (
        $1, $2, $3, true, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, NOW(), NOW()
      )
      RETURNING
        "id", "nombre", "descripcion", "activo",
        ST_Y("ubicacion") as "latitud",
        ST_X("ubicacion") as "longitud",
        "empresaId", "createdAt", "updatedAt";
    `;

    const resultados = await prisma.$queryRawUnsafe(
      query,
      id,
      nombre.trim(),
      descripcion ? descripcion.trim() : null,
      valCoords.lng,
      valCoords.lat,
      empresaId
    );

    const pistaCreada = formatearPista(resultados[0]);
    pistaCreada.empresaNombre = empresaExiste.nombre;

    return res.status(201).json(pistaCreada);
  } catch (error) {
    console.error("Error al crear pista:", error);
    return res.status(500).json({ message: "No se pudo crear la pista" });
  }
};

/**
 * GET /api/pistas
 * Lista las pistas según tenant y filtros.
 */
const getPistas = async (req, res) => {
  try {
    const { empresaId: empresaIdQuery } = req.query;
    const activo = req.query.activo === undefined ? undefined : parseBooleano(req.query.activo);

    if (req.query.activo !== undefined && activo === undefined) {
      return res.status(400).json({ message: "El filtro activo debe ser true o false" });
    }

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (!isAdmin(req)) {
      conditions.push(`p."empresaId" = $${paramIndex++}`);
      params.push(req.auth.empresaId);
    } else if (empresaIdQuery) {
      conditions.push(`p."empresaId" = $${paramIndex++}`);
      params.push(empresaIdQuery);
    }

    if (activo !== undefined) {
      conditions.push(`p."activo" = $${paramIndex++}`);
      params.push(activo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        p."id", p."nombre", p."descripcion", p."activo",
        ST_Y(p."ubicacion") as "latitud",
        ST_X(p."ubicacion") as "longitud",
        p."empresaId", e."nombre" as "empresaNombre",
        p."createdAt", p."updatedAt"
      FROM "Pista" p
      JOIN "Empresa" e ON p."empresaId" = e."id"
      ${whereClause}
      ORDER BY p."createdAt" DESC;
    `;

    const pistas = await prisma.$queryRawUnsafe(query, ...params);
    return res.json(pistas.map(formatearPista));
  } catch (error) {
    console.error("Error al obtener pistas:", error);
    return res.status(500).json({ message: "No se pudieron cargar las pistas" });
  }
};

/**
 * GET /api/pistas/:id
 * Detalle de una pista.
 */
const getPistaById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        p."id", p."nombre", p."descripcion", p."activo",
        ST_Y(p."ubicacion") as "latitud",
        ST_X(p."ubicacion") as "longitud",
        p."empresaId", e."nombre" as "empresaNombre",
        p."createdAt", p."updatedAt"
      FROM "Pista" p
      JOIN "Empresa" e ON p."empresaId" = e."id"
      WHERE p."id" = $1;
    `;

    const resultados = await prisma.$queryRawUnsafe(query, id);
    if (!resultados || resultados.length === 0) {
      return res.status(404).json({ message: "La pista no existe" });
    }

    const pista = resultados[0];
    if (!isAdmin(req) && pista.empresaId !== req.auth.empresaId) {
      return res.status(404).json({ message: "La pista no existe" });
    }

    return res.json(formatearPista(pista));
  } catch (error) {
    console.error("Error al obtener pista por ID:", error);
    return res.status(500).json({ message: "No se pudo cargar la pista" });
  }
};

/**
 * PUT /api/pistas/:id
 * Actualiza nombre, descripción, ubicación o estado de la pista.
 */
const updatePista = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, latitud, longitud } = req.body;
    const activo = req.body.activo === undefined ? undefined : parseBooleano(req.body.activo);

    if (nombre !== undefined && !esTextoNoVacio(nombre)) {
      return res.status(400).json({ message: "El nombre de la pista no puede estar vacío" });
    }

    if (!esTextoOpcional(descripcion)) {
      return res.status(400).json({ message: "La descripción de la pista debe ser un texto" });
    }

    if (req.body.activo !== undefined && activo === undefined) {
      return res.status(400).json({ message: "El estado de la pista debe ser true o false" });
    }

    // Verificar existencia y tenant
    const exist = await prisma.pista.findUnique({
      where: { id },
      select: { id: true, empresaId: true }
    });
    if (!exist || (!isAdmin(req) && exist.empresaId !== req.auth.empresaId)) {
      return res.status(404).json({ message: "La pista no existe" });
    }

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (nombre !== undefined) {
      setClauses.push(`"nombre" = $${paramIndex++}`);
      params.push(nombre.trim());
    }

    if (descripcion !== undefined) {
      setClauses.push(`"descripcion" = $${paramIndex++}`);
      params.push(descripcion ? descripcion.trim() : null);
    }

    if (latitud !== undefined || longitud !== undefined) {
      if (latitud === undefined || longitud === undefined) {
        return res.status(400).json({ message: "Para actualizar la ubicación debe enviar latitud y longitud" });
      }
      const valCoords = validarCoordenadas(latitud, longitud);
      if (valCoords.error) {
        return res.status(400).json({ message: valCoords.error });
      }
      const lngParam = `$${paramIndex++}`;
      const latParam = `$${paramIndex++}`;
      params.push(valCoords.lng, valCoords.lat);
      setClauses.push(`"ubicacion" = ST_SetSRID(ST_MakePoint(${lngParam}, ${latParam}), 4326)`);
    }

    if (activo !== undefined) {
      setClauses.push(`"activo" = $${paramIndex++}`);
      params.push(activo);
    }

    setClauses.push(`"updatedAt" = NOW()`);
    params.push(id);
    const idPlaceholder = `$${paramIndex}`;

    const updateQuery = `
      UPDATE "Pista"
      SET ${setClauses.join(", ")}
      WHERE "id" = ${idPlaceholder}
      RETURNING
        "id", "nombre", "descripcion", "activo",
        ST_Y("ubicacion") as "latitud",
        ST_X("ubicacion") as "longitud",
        "empresaId", "createdAt", "updatedAt";
    `;

    const resultados = await prisma.$queryRawUnsafe(updateQuery, ...params);
    return res.json(formatearPista(resultados[0]));
  } catch (error) {
    console.error("Error al actualizar pista:", error);
    return res.status(500).json({ message: "No se pudo actualizar la pista" });
  }
};

/**
 * PATCH /api/pistas/:id/baja
 * Soft-delete o reactivación.
 */
const bajaPista = async (req, res) => {
  try {
    const { id } = req.params;
    const activoRecibido = req.body ? req.body.activo : undefined;
    const nuevoEstado = activoRecibido === undefined ? false : parseBooleano(activoRecibido);

    if (nuevoEstado === undefined) {
      return res.status(400).json({ message: "El estado de la pista debe ser true o false" });
    }

    const exist = await prisma.pista.findUnique({
      where: { id },
      select: { id: true, empresaId: true }
    });
    if (!exist || (!isAdmin(req) && exist.empresaId !== req.auth.empresaId)) {
      return res.status(404).json({ message: "La pista no existe" });
    }

    const query = `
      UPDATE "Pista"
      SET "activo" = $1, "updatedAt" = NOW()
      WHERE "id" = $2
      RETURNING
        "id", "nombre", "descripcion", "activo",
        ST_Y("ubicacion") as "latitud",
        ST_X("ubicacion") as "longitud",
        "empresaId", "createdAt", "updatedAt";
    `;

    const resultados = await prisma.$queryRawUnsafe(query, nuevoEstado, id);
    return res.json({
      message: nuevoEstado ? "Pista reactivada exitosamente" : "Pista dada de baja exitosamente",
      pista: formatearPista(resultados[0])
    });
  } catch (error) {
    console.error("Error al dar de baja pista:", error);
    return res.status(500).json({ message: "No se pudo modificar el estado de la pista" });
  }
};

/**
 * DELETE /api/pistas/:id
 * Eliminación física. Rechaza si la pista está asignada a uno o más lotes (HTTP 409).
 */
const deletePista = async (req, res) => {
  try {
    const { id } = req.params;

    const exist = await prisma.pista.findUnique({
      where: { id },
      select: { id: true, empresaId: true }
    });
    if (!exist || (!isAdmin(req) && exist.empresaId !== req.auth.empresaId)) {
      return res.status(404).json({ message: "La pista no existe" });
    }

    // Verificar si algún lote la tiene asignada
    const lotesUsandoPista = await prisma.lote.count({
      where: {
        OR: [{ pistaPrincipalId: id }, { pistaCargaId: id }]
      }
    });

    if (lotesUsandoPista > 0) {
      return res.status(409).json({
        message: "No se puede eliminar la pista porque está asignada a uno o más lotes. Se sugiere darla de baja."
      });
    }

    await prisma.$queryRawUnsafe(`DELETE FROM "Pista" WHERE "id" = $1;`, id);

    return res.json({ message: "Pista eliminada permanentemente" });
  } catch (error) {
    console.error("Error al eliminar pista:", error);
    return res.status(500).json({ message: "No se pudo eliminar la pista" });
  }
};

module.exports = {
  createPista,
  getPistas,
  getPistaById,
  updatePista,
  bajaPista,
  deletePista
};

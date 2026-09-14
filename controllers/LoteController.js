const crypto = require("crypto");
const prisma = require("../configs/prisma");
const { isAdmin } = require("../utils/autorizacion");

/**
 * Valida y normaliza una geometría GeoJSON de tipo Polygon.
 * Acepta tanto un objeto Geometry como un Feature de GeoJSON.
 * Auto-cierra el anillo exterior si el primer y último punto no coinciden.
 */
const parseAndValidateGeometria = (geoInput) => {
  if (!geoInput) {
    return { error: "La geometría del lote es obligatoria" };
  }

  let geo = geoInput;
  if (typeof geo === "string") {
    try {
      geo = JSON.parse(geo);
    } catch (err) {
      return { error: "La geometría tiene un formato JSON inválido" };
    }
  }

  // Si viene envuelto en un Feature GeoJSON, extraer la geometría
  if (geo.type === "Feature" && geo.geometry) {
    geo = geo.geometry;
  }

  if (!geo || geo.type !== "Polygon") {
    return { error: "La geometría debe ser de tipo 'Polygon'" };
  }

  if (!Array.isArray(geo.coordinates) || geo.coordinates.length === 0) {
    return { error: "El polígono debe contener al menos un anillo de coordenadas" };
  }

  const ring = geo.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 3) {
    return { error: "El polígono debe tener al menos 3 vértices" };
  }

  // Validar cada punto [lng, lat]
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== "number" || typeof pt[1] !== "number") {
      return { error: "Coordenadas inválidas en el polígono. Deben ser pares numéricos [longitud, latitud]" };
    }
    const [lng, lat] = pt;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return { error: `Coordenadas fuera de rango: [${lng}, ${lat}]. Longitud: [-180, 180], Latitud: [-90, 90]` };
    }
  }

  // Auto-cerrar el polígono si el primer y último punto difieren
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  if (ring.length < 4) {
    return { error: "Un polígono cerrado requiere al menos 4 puntos (primer y último idénticos)" };
  }

  return { geometria: geo };
};

/**
 * Verifica si el usuario tiene acceso al campo especificado según multi-tenancy.
 */
const verificarAccesoACampo = async (campoId, req) => {
  const campo = await prisma.campo.findUnique({
    where: { id: campoId },
    select: { id: true, nombre: true, empresaId: true }
  });

  if (!campo) {
    return { error: "El campo especificado no existe", status: 404 };
  }

  if (!isAdmin(req) && campo.empresaId !== req.auth.empresaId) {
    return { error: "No tiene permiso para acceder a este campo", status: 403 };
  }

  return { campo };
};

/**
 * Verifica con PostGIS que el polígono sea topológicamente válido (sin autointersecciones
 * ni superficie nula). Un polígono en forma de "moño" se guardaría con 0 ha si no se valida.
 */
const validarTopologiaGeometria = async (geometriaStr) => {
  const resultados = await prisma.$queryRawUnsafe(
    `SELECT ST_IsValid(g) AS "valida", ST_IsValidReason(g) AS "motivo", ST_Area(g::geography) AS "area"
     FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g) AS geometria;`,
    geometriaStr
  );
  const { valida, motivo, area } = resultados[0];

  if (!valida) {
    const esAutointerseccion = typeof motivo === "string" && motivo.toLowerCase().includes("self-intersection");
    return {
      error: esAutointerseccion
        ? "El polígono del lote no puede cruzarse a sí mismo. Verifique el orden de los vértices."
        : "La geometría del lote es inválida. Verifique que el polígono esté bien formado."
    };
  }

  if (!(Number(area) > 0)) {
    return { error: "El polígono del lote debe tener una superficie mayor a cero" };
  }

  return {};
};

/**
 * Formatea la fila del lote devuelta por Postgres, convirtiendo el texto GeoJSON en objeto.
 */
const formatearLote = (row) => {
  if (!row) return null;
  return {
    ...row,
    superficie: row.superficie !== null && row.superficie !== undefined ? Number(row.superficie) : null,
    geometria: typeof row.geometria === "string" ? JSON.parse(row.geometria) : row.geometria
  };
};

/**
 * POST /api/lotes
 * Crea un nuevo lote con geometría de polígono y calcula la superficie en hectáreas.
 */
const createLote = async (req, res) => {
  try {
    const { nombre, descripcion, campoId, geometria: geometriaInput } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: "El nombre del lote es obligatorio" });
    }

    if (!campoId) {
      return res.status(400).json({ message: "El campo al que pertenece el lote es obligatorio" });
    }

    // Validar acceso al campo
    const accesoCampo = await verificarAccesoACampo(campoId, req);
    if (accesoCampo.error) {
      return res.status(accesoCampo.status).json({ message: accesoCampo.error });
    }

    // Validar y normalizar geometría
    const validacionGeo = parseAndValidateGeometria(geometriaInput);
    if (validacionGeo.error) {
      return res.status(400).json({ message: validacionGeo.error });
    }

    const geometriaStr = JSON.stringify(validacionGeo.geometria);

    const validacionTopologia = await validarTopologiaGeometria(geometriaStr);
    if (validacionTopologia.error) {
      return res.status(400).json({ message: validacionTopologia.error });
    }

    const id = crypto.randomUUID();

    const insertQuery = `
      INSERT INTO "Lote" (
        "id",
        "nombre",
        "descripcion",
        "superficie",
        "activo",
        "geometria",
        "campoId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1,
        $2,
        $3,
        ROUND((ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)::geography) / 10000.0)::numeric, 2),
        true,
        ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
        $5,
        NOW(),
        NOW()
      )
      RETURNING
        "id",
        "nombre",
        "descripcion",
        "superficie",
        "activo",
        ST_AsGeoJSON("geometria") as "geometria",
        "campoId",
        "createdAt",
        "updatedAt";
    `;

    const resultados = await prisma.$queryRawUnsafe(
      insertQuery,
      id,
      nombre.trim(),
      descripcion ? descripcion.trim() : null,
      geometriaStr,
      campoId
    );

    const loteCreado = formatearLote(resultados[0]);
    loteCreado.campoNombre = accesoCampo.campo.nombre;
    loteCreado.empresaId = accesoCampo.campo.empresaId;

    return res.status(201).json(loteCreado);
  } catch (error) {
    console.error("Error al crear lote:", error);
    if (error.message && (error.message.includes("ST_GeomFromGeoJSON") || error.message.includes("parse error"))) {
      return res.status(400).json({
        message: "La geometría del lote es inválida. Verifique que el polígono esté bien formado y no se auto-interseque."
      });
    }
    return res.status(500).json({ message: "No se pudo crear el lote" });
  }
};

/**
 * GET /api/lotes
 * Lista los lotes según empresa y filtros opcionales (campoId, activo).
 */
const getLotes = async (req, res) => {
  try {
    const { campoId, activo, empresaId: empresaIdQuery } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Aislamiento Multi-tenant
    if (!isAdmin(req)) {
      conditions.push(`c."empresaId" = $${paramIndex++}`);
      params.push(req.auth.empresaId);
    } else if (empresaIdQuery) {
      conditions.push(`c."empresaId" = $${paramIndex++}`);
      params.push(empresaIdQuery);
    }

    // Filtro por campoId
    if (campoId) {
      conditions.push(`l."campoId" = $${paramIndex++}`);
      params.push(campoId);
    }

    // Filtro por estado activo (opcional)
    if (activo !== undefined) {
      conditions.push(`l."activo" = $${paramIndex++}`);
      params.push(activo === "true");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        l."id",
        l."nombre",
        l."descripcion",
        l."superficie",
        l."activo",
        ST_AsGeoJSON(l."geometria") as "geometria",
        l."campoId",
        c."nombre" as "campoNombre",
        c."empresaId",
        l."createdAt",
        l."updatedAt"
      FROM "Lote" l
      JOIN "Campo" c ON l."campoId" = c."id"
      ${whereClause}
      ORDER BY l."createdAt" DESC;
    `;

    const lotes = await prisma.$queryRawUnsafe(query, ...params);
    const lotesFormateados = lotes.map(formatearLote);

    return res.json(lotesFormateados);
  } catch (error) {
    console.error("Error al obtener lotes:", error);
    return res.status(500).json({ message: "No se pudieron cargar los lotes" });
  }
};

/**
 * GET /api/lotes/:id
 * Obtiene un lote por ID incluyendo su geometría en GeoJSON.
 */
const getLoteById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        l."id",
        l."nombre",
        l."descripcion",
        l."superficie",
        l."activo",
        ST_AsGeoJSON(l."geometria") as "geometria",
        l."campoId",
        c."nombre" as "campoNombre",
        c."empresaId",
        l."createdAt",
        l."updatedAt"
      FROM "Lote" l
      JOIN "Campo" c ON l."campoId" = c."id"
      WHERE l."id" = $1;
    `;

    const resultados = await prisma.$queryRawUnsafe(query, id);
    if (!resultados || resultados.length === 0) {
      return res.status(404).json({ message: "El lote no existe" });
    }

    const lote = resultados[0];

    // Verificar multi-tenant
    if (!isAdmin(req) && lote.empresaId !== req.auth.empresaId) {
      return res.status(404).json({ message: "El lote no existe" });
    }

    return res.json(formatearLote(lote));
  } catch (error) {
    console.error("Error al obtener lote por ID:", error);
    return res.status(500).json({ message: "No se pudo cargar el lote" });
  }
};

/**
 * PUT /api/lotes/:id
 * Actualiza nombre, descripción, campo o geometría de un lote.
 * Si se modifica la geometría, recalcula automáticamente la superficie en hectáreas.
 */
const updateLote = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, campoId, geometria: geometriaInput, activo } = req.body;

    // Buscar lote actual con su campo
    const checkQuery = `
      SELECT l."id", l."nombre", l."descripcion", l."campoId", l."activo", c."empresaId"
      FROM "Lote" l
      JOIN "Campo" c ON l."campoId" = c."id"
      WHERE l."id" = $1;
    `;
    const existentes = await prisma.$queryRawUnsafe(checkQuery, id);
    if (!existentes || existentes.length === 0) {
      return res.status(404).json({ message: "El lote no existe" });
    }

    const loteActual = existentes[0];

    if (!isAdmin(req) && loteActual.empresaId !== req.auth.empresaId) {
      return res.status(404).json({ message: "El lote no existe" });
    }

    // Si se cambia el campoId, verificar que el nuevo campo exista y sea de la misma empresa
    let nuevoCampoId = loteActual.campoId;
    if (campoId && campoId !== loteActual.campoId) {
      const accesoNuevoCampo = await verificarAccesoACampo(campoId, req);
      if (accesoNuevoCampo.error) {
        return res.status(accesoNuevoCampo.status).json({ message: accesoNuevoCampo.error });
      }
      nuevoCampoId = campoId;
    }

    // Armar cláusulas dinámicas de actualización
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (nombre !== undefined) {
      if (!nombre.trim()) {
        return res.status(400).json({ message: "El nombre del lote no puede estar vacío" });
      }
      setClauses.push(`"nombre" = $${paramIndex++}`);
      params.push(nombre.trim());
    }

    if (descripcion !== undefined) {
      setClauses.push(`"descripcion" = $${paramIndex++}`);
      params.push(descripcion ? descripcion.trim() : null);
    }

    if (campoId !== undefined) {
      setClauses.push(`"campoId" = $${paramIndex++}`);
      params.push(nuevoCampoId);
    }

    if (activo !== undefined) {
      setClauses.push(`"activo" = $${paramIndex++}`);
      params.push(Boolean(activo));
    }

    if (geometriaInput !== undefined) {
      const validacionGeo = parseAndValidateGeometria(geometriaInput);
      if (validacionGeo.error) {
        return res.status(400).json({ message: validacionGeo.error });
      }
      const geoStr = JSON.stringify(validacionGeo.geometria);

      const validacionTopologia = await validarTopologiaGeometria(geoStr);
      if (validacionTopologia.error) {
        return res.status(400).json({ message: validacionTopologia.error });
      }

      const geoPlaceholder = `$${paramIndex++}`;
      params.push(geoStr);

      setClauses.push(`"geometria" = ST_SetSRID(ST_GeomFromGeoJSON(${geoPlaceholder}), 4326)`);
      setClauses.push(
        `"superficie" = ROUND((ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geoPlaceholder}), 4326)::geography) / 10000.0)::numeric, 2)`
      );
    }

    setClauses.push(`"updatedAt" = NOW()`);

    // Parametro para el WHERE id = $X
    params.push(id);
    const idPlaceholder = `$${paramIndex}`;

    const updateQuery = `
      UPDATE "Lote"
      SET ${setClauses.join(", ")}
      WHERE "id" = ${idPlaceholder}
      RETURNING
        "id",
        "nombre",
        "descripcion",
        "superficie",
        "activo",
        ST_AsGeoJSON("geometria") as "geometria",
        "campoId",
        "createdAt",
        "updatedAt";
    `;

    const resultados = await prisma.$queryRawUnsafe(updateQuery, ...params);
    const loteActualizado = formatearLote(resultados[0]);

    // Obtener datos del campo para la respuesta
    const infoCampo = await prisma.campo.findUnique({
      where: { id: loteActualizado.campoId },
      select: { nombre: true, empresaId: true }
    });
    if (infoCampo) {
      loteActualizado.campoNombre = infoCampo.nombre;
      loteActualizado.empresaId = infoCampo.empresaId;
    }

    return res.json(loteActualizado);
  } catch (error) {
    console.error("Error al actualizar lote:", error);
    if (error.message && (error.message.includes("ST_GeomFromGeoJSON") || error.message.includes("parse error"))) {
      return res.status(400).json({
        message: "La geometría del lote es inválida. Verifique que el polígono esté bien formado y no se auto-interseque."
      });
    }
    return res.status(500).json({ message: "No se pudo actualizar el lote" });
  }
};

/**
 * PATCH /api/lotes/:id/baja
 * Soft-delete: Da de baja lógica a un lote poniendo activo = false.
 * Permite reactivarlo si se envía { activo: true } en el body.
 */
const bajaLote = async (req, res) => {
  try {
    const { id } = req.params;
    const nuevoEstado = req.body && req.body.activo !== undefined ? Boolean(req.body.activo) : false;

    // Buscar lote y validar tenant
    const checkQuery = `
      SELECT l."id", c."empresaId"
      FROM "Lote" l
      JOIN "Campo" c ON l."campoId" = c."id"
      WHERE l."id" = $1;
    `;
    const existentes = await prisma.$queryRawUnsafe(checkQuery, id);
    if (!existentes || existentes.length === 0) {
      return res.status(404).json({ message: "El lote no existe" });
    }

    if (!isAdmin(req) && existentes[0].empresaId !== req.auth.empresaId) {
      return res.status(404).json({ message: "El lote no existe" });
    }

    const updateQuery = `
      UPDATE "Lote"
      SET "activo" = $1, "updatedAt" = NOW()
      WHERE "id" = $2
      RETURNING
        "id",
        "nombre",
        "descripcion",
        "superficie",
        "activo",
        ST_AsGeoJSON("geometria") as "geometria",
        "campoId",
        "createdAt",
        "updatedAt";
    `;

    const resultados = await prisma.$queryRawUnsafe(updateQuery, nuevoEstado, id);
    const loteActualizado = formatearLote(resultados[0]);

    return res.json({
      message: nuevoEstado ? "Lote reactivado exitosamente" : "Lote dado de baja exitosamente",
      lote: loteActualizado
    });
  } catch (error) {
    console.error("Error al dar de baja lote:", error);
    return res.status(500).json({ message: "No se pudo modificar el estado del lote" });
  }
};

/**
 * DELETE /api/lotes/:id
 * Hard-delete: Eliminación física reservada para administradores.
 */
const deleteLote = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isAdmin(req)) {
      return res.status(403).json({
        message: "Solo los administradores pueden eliminar lotes permanentemente. Utilice la baja lógica en su lugar."
      });
    }

    const checkQuery = `SELECT "id" FROM "Lote" WHERE "id" = $1;`;
    const existentes = await prisma.$queryRawUnsafe(checkQuery, id);
    if (!existentes || existentes.length === 0) {
      return res.status(404).json({ message: "El lote no existe" });
    }

    const deleteQuery = `
      DELETE FROM "Lote"
      WHERE "id" = $1
      RETURNING
        "id",
        "nombre",
        "campoId";
    `;
    const resultados = await prisma.$queryRawUnsafe(deleteQuery, id);

    return res.json({
      message: "Lote eliminado permanentemente",
      lote: resultados[0]
    });
  } catch (error) {
    console.error("Error al eliminar lote:", error);
    return res.status(500).json({ message: "No se pudo eliminar el lote" });
  }
};

module.exports = {
  createLote,
  getLotes,
  getLoteById,
  updateLote,
  bajaLote,
  deleteLote
};

const assert = require("node:assert/strict");

const BASE_URL = "http://localhost:3000/api";

const request = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const status = response.status;
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    // response without json body
  }

  return { status, data };
};

async function runIntegrationTests() {
  console.log("=== INICIANDO PRUEBAS DE INTEGRACIÓN SPRINT 3 ===");
  const testId = Date.now();

  let adminToken;
  let empresaId;
  let pistaPrincipalId;
  let pistaCargaId;
  let campoId;
  let loteId;
  let aeronaveId;
  let productoId;
  let ordenId;

  try {
    // 0. Login Admin
    console.log("-> 1. Autenticación");
    const loginRes = await request("/autenticacion/iniciar-sesion", {
      method: "POST",
      body: {
        email: "admin@escalafly.com",
        contrasena: "Admin1234!"
      }
    });

    if (loginRes.status !== 200) {
      throw new Error(`Login admin falló con status ${loginRes.status}: ${JSON.stringify(loginRes.data)}`);
    }
    adminToken = loginRes.data.token;
    assert.ok(adminToken, "Token de admin obtenido");

    // 1. Crear empresa de prueba
    console.log("-> 2. Creando empresa de prueba");
    const empRes = await request("/empresas", {
      method: "POST",
      token: adminToken,
      body: {
        nombre: `Empresa Test Sprint 3 ${testId}`,
        email: `test_sprint3_${testId}@test.com`
      }
    });
    assert.equal(empRes.status, 201);
    empresaId = empRes.data.id;

    // 2. Crear Pistas (Principal y Carga)
    console.log("-> 3. Creando Pistas georreferenciadas");
    const pPrincRes = await request("/pistas", {
      method: "POST",
      token: adminToken,
      body: {
        nombre: `Pista Principal ${testId}`,
        descripcion: "Pista central de asfalto 1200m",
        latitud: -31.4150,
        longitud: -62.0750,
        empresaId
      }
    });
    assert.equal(pPrincRes.status, 201);
    assert.equal(pPrincRes.data.nombre, `Pista Principal ${testId}`);
    assert.equal(pPrincRes.data.latitud, -31.4150);
    assert.equal(pPrincRes.data.longitud, -62.0750);
    pistaPrincipalId = pPrincRes.data.id;

    const pCargaRes = await request("/pistas", {
      method: "POST",
      token: adminToken,
      body: {
        nombre: `Pista Carga ${testId}`,
        descripcion: "Pista de carga y combustible",
        latitud: -31.4350,
        longitud: -62.0750,
        empresaId
      }
    });
    assert.equal(pCargaRes.status, 201);
    pistaCargaId = pCargaRes.data.id;

    // Listar pistas
    const listPistas = await request(`/pistas?empresaId=${empresaId}`, { token: adminToken });
    assert.equal(listPistas.status, 200);
    assert.equal(listPistas.data.length, 2);

    // Actualizar pista
    const updPista = await request(`/pistas/${pistaPrincipalId}`, {
      method: "PUT",
      token: adminToken,
      body: {
        nombre: `Pista Principal Actualizada ${testId}`,
        descripcion: "Pista con balizamiento nocturno"
      }
    });
    assert.equal(updPista.status, 200);
    assert.equal(updPista.data.nombre, `Pista Principal Actualizada ${testId}`);

    // Baja lógica y reactivación
    const bajaPista = await request(`/pistas/${pistaCargaId}/baja`, {
      method: "PATCH",
      token: adminToken,
      body: { activo: false }
    });
    assert.equal(bajaPista.status, 200);
    assert.equal(bajaPista.data.pista.activo, false);

    const reactivaPista = await request(`/pistas/${pistaCargaId}/baja`, {
      method: "PATCH",
      token: adminToken,
      body: { activo: true }
    });
    assert.equal(reactivaPista.status, 200);
    assert.equal(reactivaPista.data.pista.activo, true);

    // 3. Crear Campo y Aeronave
    console.log("-> 4. Creando Campo y Aeronave con capacidad y ancho predeterminados");
    const campoRes = await request("/campos", {
      method: "POST",
      token: adminToken,
      body: {
        nombre: `Campo Test ${testId}`,
        empresaId
      }
    });
    assert.equal(campoRes.status, 201);
    campoId = campoRes.data.id;

    const aeroRes = await request("/aeronaves", {
      method: "POST",
      token: adminToken,
      body: {
        matricula: `LV-T${testId.toString().slice(-4)}`,
        modelo: "Air Tractor AT-502B",
        capacidadUtilLitros: 1200,
        anchoAplicacionMetros: 22,
        empresaId
      }
    });
    assert.equal(aeroRes.status, 201);
    assert.equal(aeroRes.data.capacidadUtilLitros, 1200);
    assert.equal(aeroRes.data.anchoAplicacionMetros, 22);
    aeronaveId = aeroRes.data.id;

    // Crear Producto: el tipo y la unidad se eligen de los catalogos de Configuracion
    const tiposRes = await request("/tipos-producto", { token: adminToken });
    const unidadesRes = await request("/unidades-medida", { token: adminToken });
    const herbicida = tiposRes.data.find((tipo) => tipo.nombre === "Herbicida");
    const litros = unidadesRes.data.find((unidad) => unidad.abreviatura === "L");
    assert.ok(herbicida && litros, "Los catalogos deben traer Herbicida y Litros");

    const prodRes = await request("/productos", {
      method: "POST",
      token: adminToken,
      body: {
        nombre: `Herbicida Test ${testId}`,
        tipoId: herbicida.id,
        unidadMedidaId: litros.id,
        empresaId
      }
    });
    assert.equal(prodRes.status, 201);
    productoId = prodRes.data.id;

    // 4. Crear Lote con Pistas Asignadas
    console.log("-> 5. Creando Lote con Pistas Asignadas");
    const geometriaLote = {
      type: "Polygon",
      coordinates: [
        [
          [-62.0800, -31.4200],
          [-62.0700, -31.4200],
          [-62.0700, -31.4300],
          [-62.0800, -31.4300],
          [-62.0800, -31.4200]
        ]
      ]
    };

    const loteRes = await request("/lotes", {
      method: "POST",
      token: adminToken,
      body: {
        nombre: `Lote Test ${testId}`,
        campoId,
        geometria: geometriaLote,
        pistaPrincipalId,
        pistaCargaId
      }
    });
    assert.equal(loteRes.status, 201);
    assert.equal(loteRes.data.pistaPrincipalId, pistaPrincipalId);
    assert.equal(loteRes.data.pistaCargaId, pistaCargaId);
    assert.ok(loteRes.data.pistaPrincipal, "Pista principal poblada");
    assert.ok(loteRes.data.pistaCarga, "Pista de carga poblada");
    loteId = loteRes.data.id;

    // Verificar que intentar eliminar una pista asignada al lote devuelva 409
    console.log("-> 6. Validando protección 409 en eliminación de pista asignada");
    const delPistaConflicto = await request(`/pistas/${pistaPrincipalId}`, {
      method: "DELETE",
      token: adminToken
    });
    assert.equal(delPistaConflicto.status, 409, "Debe rechazar con 409 Conflict si está asignada");

    // 5. Crear Orden de Trabajo y Generar Plan Automático
    console.log("-> 7. Generando Orden de Trabajo y Plan de Vuelo automático");
    const ordenRes = await request("/ordenes", {
      method: "POST",
      token: adminToken,
      body: {
        loteId,
        aeronaveId,
        anchoAplicacionMetros: 20,
        litrosPorHectarea: 10,
        capacidadUtilLitros: 500, // Con ~105 ha y 10 L/ha = 1054 L -> requiere 3 viajes (500 + 500 + 54)
        observaciones: "Vuelo de prueba matutino",
        fechaPrevista: "2026-10-15",
        productos: [
          { productoId, dosisPorHectarea: 2.5 }
        ]
      }
    });

    assert.equal(ordenRes.status, 201);
    assert.equal(ordenRes.data.estado, "PLANIFICADA");
    assert.ok(ordenRes.data.planVuelo, "Plan de vuelo generado");
    assert.equal(ordenRes.data.planVuelo.version, 1);
    assert.equal(ordenRes.data.planVuelo.cantidadViajes, 3);
    assert.ok(ordenRes.data.planVuelo.orientacionGrados >= 0);
    assert.ok(ordenRes.data.planVuelo.caldoTotalLitros > 1000);
    ordenId = ordenRes.data.id;

    // 6. Consultar Plan de Vuelo y Viajes
    console.log("-> 8. Consultando detalle del plan de vuelo y geometrías de viajes");
    const planRes = await request(`/ordenes/${ordenId}/plan`, { token: adminToken });
    assert.equal(planRes.status, 200);
    assert.equal(planRes.data.desactualizado, false);
    assert.equal(planRes.data.viajes.length, 3);

    const viajes = planRes.data.viajes;
    // Viaje 1
    assert.equal(viajes[0].numero, 1);
    assert.equal(viajes[0].tipoSalida, "PRINCIPAL");
    assert.equal(viajes[0].tipoLlegada, "CARGA");
    assert.equal(viajes[0].recorrido.type, "LineString");
    assert.equal(viajes[0].tramosAplicacion.type, "MultiLineString");

    // Viaje 2 (intermedio)
    assert.equal(viajes[1].numero, 2);
    assert.equal(viajes[1].tipoSalida, "CARGA");
    assert.equal(viajes[1].tipoLlegada, "CARGA");

    // Viaje 3 (último)
    assert.equal(viajes[2].numero, 3);
    assert.equal(viajes[2].tipoSalida, "CARGA");
    assert.equal(viajes[2].tipoLlegada, "PRINCIPAL");

    // 7. Modificar Orden y Regenerar Plan Automáticamente
    console.log("-> 9. Modificando parámetros de orden y verificando regeneración automática (PUT)");
    const updOrdenRes = await request(`/ordenes/${ordenId}`, {
      method: "PUT",
      token: adminToken,
      body: {
        capacidadUtilLitros: 1200 // Ahora con 1200 L alcanza para 1 viaje único
      }
    });

    assert.equal(updOrdenRes.status, 200);
    assert.equal(updOrdenRes.data.planVuelo.version, 2, "La versión debe ser 2");
    assert.equal(updOrdenRes.data.planVuelo.cantidadViajes, 1, "Con 1200 L de capacidad se reduce a 1 viaje");

    const planV2 = await request(`/ordenes/${ordenId}/plan`, { token: adminToken });
    assert.equal(planV2.data.viajes.length, 1);
    assert.equal(planV2.data.viajes[0].tipoSalida, "PRINCIPAL");
    assert.equal(planV2.data.viajes[0].tipoLlegada, "PRINCIPAL");

    // 8. Regeneración manual explícita
    console.log("-> 10. Regeneración manual explícita (POST /plan/regenerar)");
    const regenRes = await request(`/ordenes/${ordenId}/plan/regenerar`, {
      method: "POST",
      token: adminToken
    });
    assert.equal(regenRes.status, 200);
    assert.equal(regenRes.data.plan.version, 3);

    // 9. Protección contra borrado de Aeronave y Producto con orden activa
    console.log("-> 11. Validando protección 409 al borrar aeronave o producto en uso");
    const delAeroConflicto = await request(`/aeronaves/${aeronaveId}`, {
      method: "DELETE",
      token: adminToken
    });
    assert.equal(delAeroConflicto.status, 409);

    const delProdConflicto = await request(`/productos/${productoId}`, {
      method: "DELETE",
      token: adminToken
    });
    assert.equal(delProdConflicto.status, 409);

    // 10. Borrado en cascada: Eliminar lote elimina orden, plan y viajes
    console.log("-> 12. Validando borrado en cascada: eliminar Lote borra la orden asociada");
    const delLoteRes = await request(`/lotes/${loteId}`, {
      method: "DELETE",
      token: adminToken
    });
    assert.equal(delLoteRes.status, 200);

    const checkOrden = await request(`/ordenes/${ordenId}`, { token: adminToken });
    assert.equal(checkOrden.status, 404, "La orden debe haberse eliminado en cascada junto al lote");

    console.log("\n>>> TODAS LAS PRUEBAS DE INTEGRACIÓN DEL SPRINT 3 PASARON EXITOSAMENTE! <<<");
  } finally {
    // Limpieza de datos de prueba
    if (empresaId && adminToken) {
      console.log("-> Limpiando empresa de prueba...");
      await request(`/empresas/${empresaId}`, {
        method: "DELETE",
        token: adminToken
      });
    }
  }
}

runIntegrationTests().catch((err) => {
  console.error("ERROR EN PRUEBAS DE INTEGRACIÓN:", err);
  process.exit(1);
});

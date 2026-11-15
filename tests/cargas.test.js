// Recalculo de la orden del cargador con una transacción simulada (sin base de datos).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recalcularCargas } = require("../services/reparto/cargas");

/** Transacción falsa con lo mínimo que usa recalcularCargas */
const crearTx = ({ viajes, productos, cargasPrevias = [] }) => {
  const estado = { cargas: cargasPrevias.map((c) => ({ ordenId: "o1", ...c })) };
  return {
    estado,
    planVuelo: { findUnique: async () => ({ superficieHa: 100, viajes }) },
    ordenProducto: { findMany: async () => productos },
    cargaProducto: {
      findMany: async ({ where }) => estado.cargas.filter((c) => (where.manual === undefined || c.manual === where.manual)),
      deleteMany: async () => { estado.cargas = []; },
      createMany: async ({ data }) => { estado.cargas = data; }
    }
  };
};

const viajes = [
  { numero: 1, superficieHa: 50, caldoLitros: 1000 },
  { numero: 2, superficieHa: 50, caldoLitros: 1000 }
];

test("calcula las cargas automaticas al guardar el plan", async () => {
  const tx = crearTx({ viajes, productos: [{ productoId: "p", dosisPorHectarea: 0.5, cantidadTotalCliente: 50 }] });
  await recalcularCargas(tx, "o1");
  assert.deepEqual(tx.estado.cargas.map((c) => [c.numeroViaje, c.cantidad, c.manual]), [[1, 25, false], [2, 25, false]]);
});

test("conserva la correccion manual si el calculo de esa carga no cambio", async () => {
  const tx = crearTx({
    viajes,
    productos: [{ productoId: "p", dosisPorHectarea: 0.5 }],
    cargasPrevias: [{ numeroViaje: 1, productoId: "p", cantidad: 30, cantidadAutomatica: 25, manual: true }]
  });
  const resultado = await recalcularCargas(tx, "o1");
  const carga1 = tx.estado.cargas.find((c) => c.numeroViaje === 1);
  assert.equal(carga1.cantidad, 30);
  assert.equal(carga1.manual, true);
  assert.equal(resultado.conservadas, 1);
});

test("descarta la correccion manual si cambio la dosis o el plan", async () => {
  const tx = crearTx({
    viajes,
    productos: [{ productoId: "p", dosisPorHectarea: 0.7 }],
    cargasPrevias: [{ numeroViaje: 1, productoId: "p", cantidad: 30, cantidadAutomatica: 25, manual: true }]
  });
  const resultado = await recalcularCargas(tx, "o1");
  const carga1 = tx.estado.cargas.find((c) => c.numeroViaje === 1);
  // 0,7 L/ha x 50 ha = 35: vuelve al calculo nuevo
  assert.equal(carga1.cantidad, 35);
  assert.equal(carga1.manual, false);
  assert.equal(resultado.descartadas, 1);
});

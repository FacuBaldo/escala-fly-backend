// Pruebas del reparto de productos por viaje. Se corren con: node --test tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dividirProporcional, repartirProductos } = require("../services/reparto");

const sumar = (valores) => Math.round(valores.reduce((a, b) => a + b, 0) * 100) / 100;

test("la division proporcional suma exactamente el total aunque no divida justo", () => {
  const partes = dividirProporcional(50, [1, 1, 1]);
  assert.deepEqual(partes, [16.67, 16.67, 16.66]);
  assert.equal(sumar(partes), 50);
});

test("la division respeta el peso (hectareas) de cada viaje", () => {
  assert.deepEqual(dividirProporcional(100, [40, 40, 20]), [40, 40, 20]);
});

test("sin hectareas no se reparte nada", () => {
  assert.deepEqual(dividirProporcional(10, [0, 0]), [0, 0]);
});

test("ejemplo del interesado: fungicida de 50 L a 0,5 L/ha en 100 ha, 3 viajes", () => {
  const viajes = [
    { numero: 1, superficieHa: 38, caldoLitros: 1500 },
    { numero: 2, superficieHa: 38, caldoLitros: 1500 },
    { numero: 3, superficieHa: 24, caldoLitros: 950 }
  ];
  const { cargas, resumen } = repartirProductos(viajes, [
    { productoId: "fungicida", dosisPorHectarea: 0.5, cantidadTotalCliente: 50 }
  ]);

  assert.deepEqual(cargas.map((c) => c.cantidad), [19, 19, 12]);
  assert.equal(resumen[0].criterio, "DOSIS");
  assert.equal(resumen[0].requerido, 50);
  assert.equal(resumen[0].diferencia, 0);
});

test("avisa cuanto sobra o falta respecto de lo que trajo el cliente", () => {
  const viajes = [{ numero: 1, superficieHa: 100, caldoLitros: 1000 }];
  const [sobra] = repartirProductos(viajes, [{ productoId: "a", dosisPorHectarea: 0.5, cantidadTotalCliente: 60 }]).resumen;
  const [falta] = repartirProductos(viajes, [{ productoId: "a", dosisPorHectarea: 0.5, cantidadTotalCliente: 40 }]).resumen;
  assert.equal(sobra.diferencia, 10);
  assert.equal(falta.diferencia, -10);
});

test("sin dosis reparte el total del cliente por hectareas", () => {
  const viajes = [
    { numero: 2, superficieHa: 25, caldoLitros: 500 },
    { numero: 1, superficieHa: 75, caldoLitros: 1500 }
  ];
  const { cargas, resumen } = repartirProductos(viajes, [{ productoId: "b", dosisPorHectarea: null, cantidadTotalCliente: 20 }]);
  assert.deepEqual(cargas, [
    { numeroViaje: 1, productoId: "b", cantidad: 15 },
    { numeroViaje: 2, productoId: "b", cantidad: 5 }
  ]);
  assert.equal(resumen[0].criterio, "TOTAL_CLIENTE");
  assert.equal(resumen[0].dosisEfectiva, 0.2);
});

test("si el cliente informo cero se muestra el faltante, no un total desconocido", () => {
  const { resumen } = repartirProductos([{ numero: 1, superficieHa: 100 }], [
    { productoId: "a", dosisPorHectarea: 0.5, cantidadTotalCliente: 0 }
  ]);
  assert.equal(resumen[0].totalCliente, 0);
  assert.equal(resumen[0].diferencia, -50);
});

test("un producto sin dosis ni total no genera cargas", () => {
  const { cargas, resumen } = repartirProductos([{ numero: 1, superficieHa: 10, caldoLitros: 100 }], [{ productoId: "c" }]);
  assert.equal(cargas.length, 0);
  assert.equal(resumen[0].criterio, "SIN_DATOS");
});

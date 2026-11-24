// Validación de la geometría de los obstáculos (sin base de datos).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validarGeometria } = require("../utils/geometriaObstaculos");

test("una estructura se marca como punto", () => {
  assert.equal(validarGeometria("MOLINO", { type: "Point", coordinates: [-62.08, -31.42] }), null);
  assert.match(validarGeometria("SILO", { type: "LineString", coordinates: [[-62, -31], [-62.1, -31]] }), /punto/);
});

test("un cable se marca como linea de al menos dos puntos", () => {
  assert.equal(validarGeometria("CABLE", { type: "LineString", coordinates: [[-62, -31], [-62.1, -31.01]] }), null);
  assert.match(validarGeometria("CABLE", { type: "LineString", coordinates: [[-62, -31]] }), /línea/);
  assert.match(validarGeometria("CABLE", { type: "Point", coordinates: [-62, -31] }), /línea/);
});

test("rechaza coordenadas fuera de rango o sin geometria", () => {
  assert.notEqual(validarGeometria("CASA", { type: "Point", coordinates: [-200, -31] }), null);
  assert.notEqual(validarGeometria("CASA", null), null);
});

// Patrón espiral, vuelta en esquina y recomendación según la forma del lote.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calcularGiroEsquina } = require("../services/planificador/giros");
const { prepararEspiral, secuenciarEspiral } = require("../services/planificador/espiral");
const { analizarForma, recomendarPatron } = require("../services/planificador/forma");
const { generarPlanDeVuelo } = require("../services/planificador/index");

const cerrar = (pts) => [...pts, pts[0]];
const CUADRADO = [cerrar([[0, 0], [1000, 0], [1000, 1000], [0, 1000]])];
const CIRCULO = [cerrar(Array.from({ length: 72 }, (_, i) => [500 * Math.cos((i * 5 * Math.PI) / 180), 500 * Math.sin((i * 5 * Math.PI) / 180)]))];
const TRIANGULO = [cerrar([[0, 0], [1200, 0], [300, 900]])];
const ALARGADO = [cerrar([[0, 0], [2000, 0], [2000, 500], [0, 500]])];
const EN_L = [cerrar([[0, 0], [1000, 0], [1000, 300], [300, 300], [300, 1000], [0, 1000]])];

const superficieAplicada = (segmentos, ancho) =>
  segmentos.filter((s) => s.tipo === "APLICACION").reduce((t, s) => t + s.distancia, 0) * ancho / 10000;

test("vuelta en esquina de 90°: largo 2R + 1,5πR y termina en la esquina", () => {
  const giro = calcularGiroEsquina([0, 0], [1, 0], [0, 1], 300);
  assert.equal(giro.tipo, "RULO");
  assert.ok(Math.abs(giro.distancia - (600 + 1.5 * Math.PI * 300)) < 1e-6);
  assert.deepEqual(giro.puntos[giro.puntos.length - 1], [0, 0]);
});

test("en un borde curvo (cambio de rumbo chico) no hay vuelta", () => {
  const a = (10 * Math.PI) / 180;
  const giro = calcularGiroEsquina([0, 0], [1, 0], [Math.cos(a), Math.sin(a)], 300);
  assert.equal(giro.tipo, "SUAVE");
  assert.equal(giro.distancia, 0);
});

for (const [nombre, anillos, superficie] of [["cuadrado", CUADRADO, 100], ["círculo", CIRCULO, 78.5], ["triángulo", TRIANGULO, 54]]) {
  test(`el espiral cubre el ${nombre} (±5% de la superficie)`, () => {
    const { vueltas } = prepararEspiral(anillos, 25);
    const aplicada = superficieAplicada(secuenciarEspiral(vueltas, { radioGiroMetros: 300 }), 25);
    assert.ok(Math.abs(aplicada - superficie) / superficie < 0.05, `aplicó ${aplicada.toFixed(1)} ha de ${superficie}`);
  });
}

test("clasifica la forma del lote", () => {
  assert.equal(analizarForma(CUADRADO).forma, "CUADRADA");
  assert.equal(analizarForma(ALARGADO).forma, "RECTANGULAR");
  assert.equal(analizarForma(CIRCULO).forma, "REDONDEADA");
  assert.equal(analizarForma(TRIANGULO).forma, "TRIANGULAR");
  assert.equal(analizarForma(EN_L).forma, "IRREGULAR");
  assert.equal(analizarForma(EN_L).admiteEspiral, false);
});

test("recomienda según la forma y desempata por distancia", () => {
  const distancias = { IDA_Y_VUELTA: 100, REDONDO: 90, ESPIRAL: 120 };
  assert.equal(recomendarPatron({ forma: "REDONDEADA" }, distancias).patron, "ESPIRAL");
  assert.equal(recomendarPatron({ forma: "IRREGULAR" }, distancias).patron, "REDONDO");
  assert.equal(recomendarPatron({ forma: "CUADRADA" }, { ...distancias, ESPIRAL: 80 }).patron, "ESPIRAL");
  assert.equal(recomendarPatron({ forma: "RECTANGULAR" }, { ...distancias, ESPIRAL: 10 }).patron, "REDONDO");
});

// Plan completo sobre un lote real en coordenadas geográficas
const lon = -61, lat = -33, m2d = 1 / 111320;
const aGeo = (anillo) => ({ type: "Polygon", coordinates: [anillo.map(([x, y]) => [lon + (x * m2d) / Math.cos((lat * Math.PI) / 180), lat + y * m2d])] });
const pista = { id: "p", nombre: "Principal", latitud: lat - 0.01, longitud: lon };
const base = { pistaPrincipal: pista, pistaCarga: pista, anchoAplicacionMetros: 25, litrosPorHectarea: 10, capacidadUtilLitros: 1500, radioGiroMetros: 300 };

test("en un lote redondo el plan automático usa el espiral y explica por qué", () => {
  const plan = generarPlanDeVuelo({ ...base, poligonoGeoJson: aGeo(CIRCULO[0]) });
  assert.equal(plan.patron, "ESPIRAL");
  assert.equal(plan.recomendacion.forma, "REDONDEADA");
  assert.ok(plan.recomendacion.motivo.length > 0);
  assert.ok(plan.viajes.every((v) => v.superficieHa > 0 && v.caldoLitros > 0));
});

test("si se pide otro patrón se respeta, pero se informa el recomendado", () => {
  const plan = generarPlanDeVuelo({ ...base, poligonoGeoJson: aGeo(CIRCULO[0]), patron: "IDA_Y_VUELTA" });
  assert.equal(plan.patron, "IDA_Y_VUELTA");
  assert.equal(plan.recomendacion.patron, "ESPIRAL");
});

test("pedir espiral en un lote con entrantes da un error claro", () => {
  assert.throws(() => generarPlanDeVuelo({ ...base, poligonoGeoJson: aGeo(EN_L[0]), patron: "ESPIRAL" }), /patrón de trabajo espiral/);
});

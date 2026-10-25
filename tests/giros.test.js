const test = require("node:test");
const assert = require("node:assert/strict");
const { calcularGiro, largoGiro } = require("../services/planificador/giros");
const { ordenRedondo, saltoRedondo } = require("../services/planificador/secuencia");
const { generarPlanDeVuelo } = require("../services/planificador/index");

// ---------- Giros ----------

const largoDibujado = (inicio, puntos) => {
  let total = 0;
  let previo = inicio;
  for (const punto of puntos) {
    total += Math.hypot(punto[0] - previo[0], punto[1] - previo[1]);
    previo = punto;
  }
  return total;
};

test("Giros: entre pasadas contiguas hace un giro en pera que cierra en la pasada siguiente", () => {
  const giro = calcularGiro([0, 0], [1, 0], [0, 25], 200);

  assert.equal(giro.tipo, "PERA");
  assert.ok(giro.errorCierre < 1e-6, "la curva tiene que terminar en el comienzo de la pasada siguiente");
  assert.ok(Math.abs(giro.rumboFinal[0] + 1) < 1e-9 && Math.abs(giro.rumboFinal[1]) < 1e-9, "sale en sentido contrario");
  // Con radio 200 m, dar la vuelta a una pasada de 25 m cuesta mas de un kilometro
  assert.ok(giro.distancia > 1400 && giro.distancia < 1450, `largo del giro en pera: ${giro.distancia}`);
  assert.ok(Math.abs(largoDibujado([0, 0], giro.puntos) - giro.distancia) / giro.distancia < 0.01);
});

test("Giros: a 2R o mas de separacion hace un giro en U de pi*R + (d - 2R)", () => {
  for (const separacion of [400, 425, 800]) {
    const giro = calcularGiro([0, 0], [1, 0], [0, -separacion], 200);

    assert.equal(giro.tipo, "U");
    assert.ok(giro.errorCierre < 1e-6);
    assert.ok(Math.abs(giro.distancia - (Math.PI * 200 + separacion - 400)) < 1e-6);
  }
});

test("Giros: si una pasada sobresale, el avion sigue derecho hasta la linea de giro", () => {
  const largoSolo = largoGiro(200, 25);

  // La pasada siguiente arranca 40 m mas adelante: se suman esos 40 m de recta
  assert.ok(Math.abs(calcularGiro([0, 0], [1, 0], [40, 25], 200).distancia - (largoSolo + 40)) < 1e-6);
  // La anterior terminaba 60 m mas adelante: se suman 60 m de recta despues del giro
  assert.ok(Math.abs(calcularGiro([0, 0], [1, 0], [-60, 25], 200).distancia - (largoSolo + 60)) < 1e-6);
});

test("Giros: funciona igual con cualquier rumbo", () => {
  const r = Math.SQRT1_2;
  const giro = calcularGiro([10, 10], [r, r], [10 - 25 * r, 10 + 25 * r], 150);

  assert.equal(giro.tipo, "PERA");
  assert.ok(giro.errorCierre < 1e-6);
  assert.ok(Math.abs(giro.distancia - largoGiro(150, 25)) < 1e-6);
});

// ---------- Orden del patron redondo ----------

test("Redondo: el orden recorre todas las pasadas exactamente una vez", () => {
  for (const cantidad of [1, 2, 3, 7, 18, 34, 35, 36, 50, 101]) {
    for (const k of [1, 2, 5, 17]) {
      for (const empezarPorDerecha of [false, true]) {
        const orden = ordenRedondo(cantidad, k, empezarPorDerecha);
        assert.deepEqual([...orden].sort((a, b) => a - b), Array.from({ length: cantidad }, (_, i) => i));
      }
    }
  }
});

test("Redondo: en los bloques completos, pasadas consecutivas quedan a por lo menos k-1 pasadas", () => {
  const k = 17;
  const orden = ordenRedondo(4 * k, k, false); // dos bloques completos

  for (let i = 1; i < orden.length; i++) {
    assert.ok(Math.abs(orden[i] - orden[i - 1]) >= k - 1, `paso ${i}: ${orden[i - 1]} -> ${orden[i]}`);
  }
});

test("Redondo: el salto deja giros de por lo menos 2R", () => {
  const k = saltoRedondo(200, 25);
  assert.ok((k - 1) * 25 >= 400);
  assert.ok((k - 2) * 25 < 400, "y es el menor salto que lo logra");
});

// ---------- Planificador completo ----------

const lote = (ancho, alto) => {
  const lat0 = -31.52;
  const lng0 = -62.18;
  const dLat = alto / 111320;
  const dLng = ancho / (111320 * Math.cos((lat0 * Math.PI) / 180));
  return {
    type: "Polygon",
    coordinates: [[[lng0, lat0], [lng0 + dLng, lat0], [lng0 + dLng, lat0 + dLat], [lng0, lat0 + dLat], [lng0, lat0]]]
  };
};

const base = {
  poligonoGeoJson: lote(900, 900),
  pistaPrincipal: { id: "p", nombre: "Principal", latitud: -31.53, longitud: -62.2 },
  pistaCarga: { id: "c", nombre: "Carga", latitud: -31.515, longitud: -62.165 },
  anchoAplicacionMetros: 25,
  litrosPorHectarea: 30,
  capacidadUtilLitros: 600,
  radioGiroMetros: 200
};

test("Planificador: el patron redondo vuela menos que ida y vuelta, y aplica lo mismo", () => {
  const idaYVuelta = generarPlanDeVuelo({ ...base, patron: "IDA_Y_VUELTA" });
  const redondo = generarPlanDeVuelo({ ...base, patron: "REDONDO" });

  assert.equal(idaYVuelta.patron, "IDA_Y_VUELTA");
  assert.equal(redondo.patron, "REDONDO");
  assert.ok(redondo.distanciaTotalMetros < idaYVuelta.distanciaTotalMetros);
  assert.ok(redondo.distanciaGirosMetros < idaYVuelta.distanciaGirosMetros);
  // Cambia como se vuela, no cuanto se aplica
  assert.equal(redondo.distanciaAplicacionMetros, idaYVuelta.distanciaAplicacionMetros);
  assert.equal(redondo.caldoTotalLitros, idaYVuelta.caldoTotalLitros);
});

test("Planificador: en automatico elige el patron mas corto y compara los dos", () => {
  const plan = generarPlanDeVuelo({ ...base, patron: "AUTOMATICO" });
  const { IDA_Y_VUELTA: idaYVuelta, REDONDO: redondo } = plan.comparacionPatrones;

  assert.ok(idaYVuelta > 0 && redondo > 0);
  assert.equal(plan.distanciaTotalMetros, Math.min(idaYVuelta, redondo));
  assert.equal(plan.patron, redondo < idaYVuelta ? "REDONDO" : "IDA_Y_VUELTA");
});

test("Planificador: los giros reales hacen preferir pasadas mas largas", () => {
  // Rectangulo de 1800 x 450 m: conviene volar a lo largo (18 pasadas) y no a lo ancho (72)
  const plan = generarPlanDeVuelo({ ...base, poligonoGeoJson: lote(1800, 450) });

  assert.equal(plan.cantidadPasadas, 18);
});

test("Planificador: con giros reales sigue cortando los viajes al terminar pasadas completas", () => {
  for (const patron of ["IDA_Y_VUELTA", "REDONDO"]) {
    const plan = generarPlanDeVuelo({ ...base, patron });
    const tramos = plan.viajes.reduce((total, v) => total + v.tramosAplicacion.coordinates.length, 0);

    assert.ok(plan.cantidadViajes > 1);
    assert.equal(tramos, plan.cantidadPasadas, `${patron}: ninguna pasada queda partida entre dos viajes`);
  }
});

test("Planificador: el recorrido dibuja los giros como curvas", () => {
  const plan = generarPlanDeVuelo({ ...base, patron: "REDONDO" });
  const viaje = plan.viajes[0];

  // Cada pasada aporta 2 puntos; las curvas agregan muchos mas
  assert.ok(viaje.recorrido.coordinates.length > viaje.tramosAplicacion.coordinates.length * 4);
});

test("Planificador: valida el radio de giro y el patron", () => {
  assert.throws(() => generarPlanDeVuelo({ ...base, radioGiroMetros: 0 }), /radio de giro/);
  assert.throws(() => generarPlanDeVuelo({ ...base, radioGiroMetros: -10 }), /radio de giro/);
  assert.throws(() => generarPlanDeVuelo({ ...base, patron: "ESPIRAL" }), /patrón de trabajo/);
});

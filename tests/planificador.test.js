const test = require("node:test");
const assert = require("node:assert/strict");
const { generarPlanDeVuelo } = require("../services/planificador/index");
const { wgs84ALocal, localAWgs84, distanciaEuclidiana } = require("../services/planificador/proyeccion");

// Polígono rectangular en Córdoba/Santa Fe (aprox 500m x 1000m = ~50 ha)
const poligonoRectangular = {
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

const pistaPrincipal = {
  id: "pista-principal-1",
  nombre: "Pista Hangar",
  latitud: -31.4150,
  longitud: -62.0750
};

const pistaCarga = {
  id: "pista-carga-1",
  nombre: "Pista Tolva Auxiliar",
  latitud: -31.4350,
  longitud: -62.0750
};

test("Planificador: genera 1 viaje cuando la capacidad de caldo es suficiente", () => {
  const plan = generarPlanDeVuelo({
    poligonoGeoJson: poligonoRectangular,
    pistaPrincipal,
    pistaCarga,
    anchoAplicacionMetros: 20,
    litrosPorHectarea: 10,
    capacidadUtilLitros: 5000 // Sobra para ~50 ha (50 ha * 10 = 500 L)
  });

  assert.equal(plan.cantidadViajes, 1);
  assert.equal(plan.viajes.length, 1);
  const viaje = plan.viajes[0];

  // Si hay un solo viaje, sale y vuelve a la principal
  assert.equal(viaje.tipoSalida, "PRINCIPAL");
  assert.equal(viaje.pistaSalidaId, pistaPrincipal.id);
  assert.equal(viaje.tipoLlegada, "PRINCIPAL");
  assert.equal(viaje.pistaLlegadaId, pistaPrincipal.id);
  assert.ok(viaje.caldoLitros > 0);
  assert.ok(viaje.distanciaMetros > 0);
  assert.ok(viaje.recorrido.coordinates.length >= 3);
  assert.ok(viaje.tramosAplicacion.coordinates.length >= 1);
});

test("Planificador: reparte en 2 viajes cuando se requiere recarga de caldo", () => {
  // Con 10 L/ha y ~105.4 ha = ~1054 L de caldo total.
  // Fijamos capacidad en 600 L -> debe generar 2 viajes.
  // El corte se hace al terminar una pasada completa, por lo que el viaje 1
  // despega con 600 L pero aplica algo menos y regresa con el sobrante.
  const plan = generarPlanDeVuelo({
    poligonoGeoJson: poligonoRectangular,
    pistaPrincipal,
    pistaCarga,
    anchoAplicacionMetros: 20,
    litrosPorHectarea: 10,
    capacidadUtilLitros: 600
  });

  assert.equal(plan.cantidadViajes, 2);
  assert.equal(plan.viajes.length, 2);

  const [viaje1, viaje2] = plan.viajes;

  // Viaje 1: sale de principal y va a carga
  assert.equal(viaje1.tipoSalida, "PRINCIPAL");
  assert.equal(viaje1.pistaSalidaId, pistaPrincipal.id);
  assert.equal(viaje1.tipoLlegada, "CARGA");
  assert.equal(viaje1.pistaLlegadaId, pistaCarga.id);
  assert.ok(viaje1.caldoLitros <= 600, "El viaje 1 no puede aplicar más caldo que la capacidad útil");
  assert.ok(viaje1.caldoLitros > 0);

  // Viaje 2: sale de carga y vuelve a principal
  assert.equal(viaje2.tipoSalida, "CARGA");
  assert.equal(viaje2.pistaSalidaId, pistaCarga.id);
  assert.equal(viaje2.tipoLlegada, "PRINCIPAL");
  assert.equal(viaje2.pistaLlegadaId, pistaPrincipal.id);
  assert.ok(viaje2.caldoLitros <= 600);

  // Ninguna pasada queda partida: el viaje 2 arranca en una pasada nueva,
  // no donde terminó el viaje 1.
  const ultimoTramoV1 = viaje1.tramosAplicacion.coordinates[viaje1.tramosAplicacion.coordinates.length - 1];
  const puntoFinAplicacionV1 = ultimoTramoV1[1];

  const primerTramoV2 = viaje2.tramosAplicacion.coordinates[0];
  const puntoInicioAplicacionV2 = primerTramoV2[0];

  const distanciaEntreCortes = Math.hypot(
    puntoFinAplicacionV1[0] - puntoInicioAplicacionV2[0],
    puntoFinAplicacionV1[1] - puntoInicioAplicacionV2[1]
  );

  assert.ok(
    distanciaEntreCortes > 1e-5,
    "El viaje 2 debe comenzar en una pasada nueva, no retomar una pasada a medias"
  );

  // En un lote rectangular cada pasada es un único tramo: si no se parte ninguna,
  // la suma de tramos de todos los viajes es igual a la cantidad de pasadas.
  const tramosTotales = plan.viajes.reduce((total, v) => total + v.tramosAplicacion.coordinates.length, 0);
  assert.equal(
    tramosTotales,
    plan.cantidadPasadas,
    "No debe haber tramos extra: cada pasada se vuela completa en un solo viaje"
  );

  // La suma del caldo aplicado en los viajes equivale al caldo total del lote
  const caldoSumado = plan.viajes.reduce((total, v) => total + v.caldoLitros, 0);
  assert.ok(Math.abs(caldoSumado - plan.caldoTotalLitros) < 1, "La suma del caldo por viaje debe dar el total del lote");
});

test("Planificador: maneja 3 o más viajes con viajes intermedios en pista de carga", () => {
  // Capacidad 150 L para ~500 L -> 4 viajes
  const plan = generarPlanDeVuelo({
    poligonoGeoJson: poligonoRectangular,
    pistaPrincipal,
    pistaCarga,
    anchoAplicacionMetros: 20,
    litrosPorHectarea: 10,
    capacidadUtilLitros: 150
  });

  assert.ok(plan.cantidadViajes >= 3);
  const viajes = plan.viajes;

  // Primero: principal -> carga
  assert.equal(viajes[0].tipoSalida, "PRINCIPAL");
  assert.equal(viajes[0].tipoLlegada, "CARGA");

  // Intermedios: carga -> carga
  for (let i = 1; i < viajes.length - 1; i++) {
    assert.equal(viajes[i].tipoSalida, "CARGA", `Viaje ${i + 1} debe salir de carga`);
    assert.equal(viajes[i].tipoLlegada, "CARGA", `Viaje ${i + 1} debe llegar a carga`);
  }

  // Último: carga -> principal
  const ultimo = viajes[viajes.length - 1];
  assert.equal(ultimo.tipoSalida, "CARGA");
  assert.equal(ultimo.tipoLlegada, "PRINCIPAL");
});

test("Planificador: soporta polígono con hueco interior", () => {
  const poligonoConHueco = {
    type: "Polygon",
    coordinates: [
      // Contorno exterior
      [
        [-62.0800, -31.4200],
        [-62.0600, -31.4200],
        [-62.0600, -31.4400],
        [-62.0800, -31.4400],
        [-62.0800, -31.4200]
      ],
      // Hueco interior
      [
        [-62.0750, -31.4250],
        [-62.0650, -31.4250],
        [-62.0650, -31.4350],
        [-62.0750, -31.4350],
        [-62.0750, -31.4250]
      ]
    ]
  };

  const plan = generarPlanDeVuelo({
    poligonoGeoJson: poligonoConHueco,
    pistaPrincipal,
    pistaCarga,
    anchoAplicacionMetros: 25,
    litrosPorHectarea: 15,
    capacidadUtilLitros: 1000
  });

  assert.ok(plan.cantidadViajes >= 1);
  assert.ok(plan.cantidadPasadas >= 1);
  assert.ok(plan.distanciaAplicacionMetros > 0);
});

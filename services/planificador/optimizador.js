/**
 * Módulo de optimización de la ruta de vuelo.
 * Evalúa rumbos theta en [0°, 180°) cada 2°, y para cada uno los patrones de
 * trabajo con todas sus variantes de inicio y sentido, quedándose con el plan de
 * menor distancia total. Como los giros se calculan con el radio real de la
 * aeronave, la comparación refleja lo que de verdad vuela el avión: favorece
 * rumbos con menos pasadas y más largas, y patrones con giros abiertos.
 */

const { generarPasadasBarrido } = require("./barrido");
const { PATRONES, ordenIdaYVuelta, ordenRedondo, saltoRedondo, secuenciarPasadas } = require("./secuencia");
// PATRONES son los de pasadas paralelas (dependen del rumbo); ESPIRAL se evalúa aparte
const { particionarEnViajes } = require("./viajes");
const { entradasCandidatas, prepararEspiral, secuenciarEspiral } = require("./espiral");
const { analizarForma, recomendarPatron } = require("./forma");

const RAD = Math.PI / 180.0;
const PASO_ANGULAR_GRADOS = 2;

/**
 * Órdenes de vuelo candidatos para un patrón. Cada uno es una lista de posiciones
 * de las pasadas; empezar por el otro borde del lote es la misma lista al revés.
 */
function ordenesCandidatos(patron, pasadas, radioGiroMetros) {
  const cantidad = pasadas.length;

  if (patron === PATRONES.IDA_Y_VUELTA) {
    return [ordenIdaYVuelta(cantidad)];
  }

  const separacion = cantidad > 1 ? Math.abs(pasadas[1].yRot - pasadas[0].yRot) : 0;
  const k = saltoRedondo(radioGiroMetros, separacion);
  return [ordenRedondo(cantidad, k, false), ordenRedondo(cantidad, k, true)];
}

/** Suma las métricas de los viajes de un plan candidato. */
function resumirViajes(viajes) {
  return viajes.reduce(
    (total, v) => ({
      distTotal: total.distTotal + v.distanciaMetros,
      distAplicacion: total.distAplicacion + v.distanciaAplicacionMetros,
      distTraslado: total.distTraslado + v.distanciaTrasladoMetros,
      distGiros: total.distGiros + v.distanciaGirosMetros,
      caldoTotal: total.caldoTotal + v.caldoLitros,
      superficieTotal: total.superficieTotal + v.superficieHa
    }),
    { distTotal: 0, distAplicacion: 0, distTraslado: 0, distGiros: 0, caldoTotal: 0, superficieTotal: 0 }
  );
}

/**
 * Encuentra la orientación, el patrón y el recorrido óptimos para el lote.
 * @param {Array<Array<[number, number]>>} anillosLocales - Anillos del polígono en metros
 * @param {Object} config - Configuración agronómica, pistas y aeronave
 * @param {number} config.radioGiroMetros - Radio de giro de la aeronave
 * @param {"AUTOMATICO" | "IDA_Y_VUELTA" | "REDONDO" | "ESPIRAL"} config.patron - Patrón pedido.
 *   AUTOMATICO = el recomendado según la forma del lote (forma.js).
 * @returns {Object|null} Plan del patrón elegido, con la distancia del mejor plan de cada
 *   patrón y la recomendación según la forma del lote
 */
function optimizarRutaVuelo(anillosLocales, config) {
  // Sprint 4: se evalúan siempre todos los patrones, aunque se pida uno, para poder
  // recomendarle al piloto el que corresponde a la forma del lote
  const patrones = Object.values(PATRONES);
  const analisis = analizarForma(anillosLocales);

  if (config.patron === "ESPIRAL" && !analisis.admiteEspiral) {
    throw new Error("El patrón de trabajo espiral solo se puede usar en lotes sin entrantes ni huecos: elegí ida y vuelta, redondo o el recomendado.");
  }

  // Mejor plan encontrado para cada patrón (para recomendar y mostrar la comparación)
  const mejorPorPatron = {};
  const considerar = (patron, viajes, extra) => {
    const r = resumirViajes(viajes);
    if (mejorPorPatron[patron] && mejorPorPatron[patron].distanciaTotalExacta <= r.distTotal) return;
    mejorPorPatron[patron] = {
      distanciaTotalExacta: r.distTotal,
      patron,
      viajes,
      distanciaTotalMetros: Math.round(r.distTotal * 10) / 10,
      distanciaAplicacionMetros: Math.round(r.distAplicacion * 10) / 10,
      distanciaTrasladoMetros: Math.round(r.distTraslado * 10) / 10,
      distanciaGirosMetros: Math.round(r.distGiros * 10) / 10,
      caldoTotalLitros: Math.round(r.caldoTotal * 100) / 100,
      superficieHa: Math.round(r.superficieTotal * 100) / 100,
      ...extra
    };
  };

  for (let anguloDeg = 0; anguloDeg < 180; anguloDeg += PASO_ANGULAR_GRADOS) {
    const pasadas = generarPasadasBarrido(anillosLocales, anguloDeg * RAD, config.anchoAplicacionMetros);
    if (pasadas.length === 0) continue;

    for (const patron of patrones) {
      for (const ordenBase of ordenesCandidatos(patron, pasadas, config.radioGiroMetros)) {
        // Empezar por cualquiera de los dos bordes, y en cualquiera de los dos sentidos
        for (const orden of [ordenBase, [...ordenBase].reverse()]) {
          for (const invertirSentidoInicial of [false, true]) {
            const segmentosRuta = secuenciarPasadas(pasadas, orden, {
              invertirSentidoInicial,
              radioGiroMetros: config.radioGiroMetros
            });
            if (segmentosRuta.length === 0) continue;

            const viajes = particionarEnViajes(segmentosRuta, config);
            if (!viajes || viajes.length === 0) continue;

            considerar(patron, viajes, { orientacionOptimaGrados: anguloDeg, cantidadPasadas: pasadas.length });
          }
        }
      }
    }
  }

  // Espiral: no depende del rumbo; se prueba entrar por distintos vértices y en los dos sentidos
  if (analisis.admiteEspiral) {
    const espiral = prepararEspiral(anillosLocales, config.anchoAplicacionMetros);
    if (espiral) {
      for (const inicio of entradasCandidatas(espiral.vueltas)) {
        for (const horario of [false, true]) {
          const segmentosRuta = secuenciarEspiral(espiral.vueltas, { inicio, horario, radioGiroMetros: config.radioGiroMetros });
          const viajes = particionarEnViajes(segmentosRuta, config);
          if (viajes && viajes.length > 0) {
            // El espiral no tiene un rumbo de pasadas: se guarda 0; "pasadas" son las vueltas
            considerar("ESPIRAL", viajes, { orientacionOptimaGrados: 0, cantidadPasadas: espiral.vueltas.length });
          }
        }
      }
    }
  }

  const distancias = Object.fromEntries(Object.entries(mejorPorPatron).map(([patron, plan]) => [patron, plan.distanciaTotalExacta]));
  if (Object.keys(distancias).length === 0) return null;

  const recomendacion = recomendarPatron(analisis, distancias);
  const patronElegido = config.patron && config.patron !== "AUTOMATICO" ? config.patron : recomendacion.patron;
  const elegido = mejorPorPatron[patronElegido];
  if (!elegido) return null;

  const { distanciaTotalExacta, ...plan } = elegido;
  plan.comparacionPatrones = Object.fromEntries(
    Object.entries(distancias).map(([patron, distancia]) => [patron, Math.round(distancia * 10) / 10])
  );
  plan.recomendacion = { ...recomendacion, metricas: analisis.metricas };
  return plan;
}

module.exports = {
  optimizarRutaVuelo
};

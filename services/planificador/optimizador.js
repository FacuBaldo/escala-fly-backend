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
const { particionarEnViajes } = require("./viajes");

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
 * @param {"AUTOMATICO" | "IDA_Y_VUELTA" | "REDONDO"} config.patron - Patrón pedido
 * @returns {Object|null} Mejor plan, con la distancia del mejor plan de cada patrón evaluado
 */
function optimizarRutaVuelo(anillosLocales, config) {
  const patrones = config.patron && config.patron !== "AUTOMATICO" ? [config.patron] : Object.values(PATRONES);

  let mejorPlan = null;
  // Mejor distancia encontrada por cada patrón, para mostrar la comparación
  const mejorPorPatron = {};

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

            const r = resumirViajes(viajes);

            if (!(mejorPorPatron[patron] <= r.distTotal)) {
              mejorPorPatron[patron] = r.distTotal;
            }

            if (!mejorPlan || r.distTotal < mejorPlan.distanciaTotalExacta) {
              mejorPlan = {
                distanciaTotalExacta: r.distTotal,
                orientacionOptimaGrados: anguloDeg,
                patron,
                cantidadPasadas: pasadas.length,
                viajes,
                distanciaTotalMetros: Math.round(r.distTotal * 10) / 10,
                distanciaAplicacionMetros: Math.round(r.distAplicacion * 10) / 10,
                distanciaTrasladoMetros: Math.round(r.distTraslado * 10) / 10,
                distanciaGirosMetros: Math.round(r.distGiros * 10) / 10,
                caldoTotalLitros: Math.round(r.caldoTotal * 100) / 100,
                superficieHa: Math.round(r.superficieTotal * 100) / 100
              };
            }
          }
        }
      }
    }
  }

  if (!mejorPlan) return null;

  const { distanciaTotalExacta, ...plan } = mejorPlan;
  plan.comparacionPatrones = Object.fromEntries(
    Object.entries(mejorPorPatron).map(([patron, distancia]) => [patron, Math.round(distancia * 10) / 10])
  );
  return plan;
}

module.exports = {
  optimizarRutaVuelo
};

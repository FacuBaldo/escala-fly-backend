/**
 * Módulo de optimización de orientación y sentido para la ruta de vuelo.
 * Evalúa múltiples ángulos de rumbo theta en [0°, 180°) y las 4 variantes de entrada/sentido,
 * seleccionando el plan de vuelo que minimiza la distancia total estimada.
 */

const { generarPasadasBarrido } = require("./barrido");
const { ordenarZigzag } = require("./zigzag");
const { particionarEnViajes } = require("./viajes");

const RAD = Math.PI / 180.0;

/**
 * Encuentra la orientación y el recorrido óptimo para el lote y parámetros dados.
 * @param {Array<Array<[number, number]>>} anillosLocales - Anillos del polígono en metros
 * @param {Object} config - Configuración agronómica y pistas
 * @returns {{
 *   orientacionOptimaGrados: number,
 *   viajes: Array<Object>,
 *   cantidadPasadas: number,
 *   distanciaTotalMetros: number,
 *   distanciaAplicacionMetros: number,
 *   distanciaTrasladoMetros: number,
 *   caldoTotalLitros: number,
 *   superficieHa: number
 * }}
 */
function optimizarRutaVuelo(anillosLocales, config) {
  let mejorPlan = null;
  let menorDistancia = Infinity;

  // Variantes de inicio y sentido
  const variantes = [
    { invertirOrdenPasadas: false, invertirSentidoInicial: false },
    { invertirOrdenPasadas: false, invertirSentidoInicial: true },
    { invertirOrdenPasadas: true, invertirSentidoInicial: false },
    { invertirOrdenPasadas: true, invertirSentidoInicial: true }
  ];

  // Barrido angular: evaluamos cada 2° entre 0° y 178° (90 ángulos x 4 variantes = 360 planes)
  const pasoAngularGrados = 2;

  for (let anguloDeg = 0; anguloDeg < 180; anguloDeg += pasoAngularGrados) {
    const anguloRad = anguloDeg * RAD;
    const pasadas = generarPasadasBarrido(anillosLocales, anguloRad, config.anchoAplicacionMetros);

    if (pasadas.length === 0) continue;

    for (const varOpciones of variantes) {
      const segmentosRuta = ordenarZigzag(pasadas, varOpciones);
      if (segmentosRuta.length === 0) continue;

      const viajes = particionarEnViajes(segmentosRuta, config);
      if (!viajes || viajes.length === 0) continue;

      let distTotal = 0;
      let distAplicacion = 0;
      let distTraslado = 0;
      let caldoTotal = 0;
      let superficieTotal = 0;

      for (const v of viajes) {
        distTotal += v.distanciaMetros;
        distAplicacion += v.distanciaAplicacionMetros;
        distTraslado += v.distanciaTrasladoMetros;
        caldoTotal += v.caldoLitros;
        superficieTotal += v.superficieHa;
      }

      if (distTotal < menorDistancia) {
        menorDistancia = distTotal;
        mejorPlan = {
          orientacionOptimaGrados: anguloDeg,
          cantidadPasadas: pasadas.length,
          viajes,
          distanciaTotalMetros: Math.round(distTotal * 10) / 10,
          distanciaAplicacionMetros: Math.round(distAplicacion * 10) / 10,
          distanciaTrasladoMetros: Math.round(distTraslado * 10) / 10,
          caldoTotalLitros: Math.round(caldoTotal * 100) / 100,
          superficieHa: Math.round(superficieTotal * 100) / 100
        };
      }
    }
  }

  return mejorPlan;
}

module.exports = {
  optimizarRutaVuelo
};

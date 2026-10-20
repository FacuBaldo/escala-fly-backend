/**
 * Módulo de secuenciación de pasadas en patrón Boustrophedon (Zigzag).
 * Conecta las pasadas alternando la dirección de vuelo en cada una y enlazando
 * los extremos para generar una ruta continua de pulverización.
 */

const { distanciaEuclidiana } = require("./proyeccion");

/**
 * Ordena y secuencia las pasadas en un patrón zigzag según las opciones de inicio.
 * @param {Array<{ indice: number, tramos: Array<[[number, number], [number, number]]> }>} pasadas
 * @param {Object} opciones
 * @param {boolean} opciones.invertirOrdenPasadas - Si es true, recorre de la última pasada a la primera
 * @param {boolean} opciones.invertirSentidoInicial - Si es true, la primera pasada se vuela en sentido inverso
 * @returns {Array<{
 *   tipo: "APLICACION" | "ENLACE",
 *   desde: [number, number],
 *   hasta: [number, number],
 *   distancia: number,
 *   pasadaIndice: number
 * }>} Secuencia ordenada de segmentos
 */
function ordenarZigzag(pasadas, { invertirOrdenPasadas = false, invertirSentidoInicial = false } = {}) {
  if (!pasadas || pasadas.length === 0) return [];

  // Clonar y ordenar lista de pasadas
  const pasadasOrdenadas = invertirOrdenPasadas ? [...pasadas].reverse() : [...pasadas];
  const segmentosRuta = [];

  let puntoAnterior = null;

  for (let pIdx = 0; pIdx < pasadasOrdenadas.length; pIdx++) {
    const pasada = pasadasOrdenadas[pIdx];
    // La dirección alterna en cada pasada consecutiva
    const direccionInversa = (pIdx % 2 === 0) ? invertirSentidoInicial : !invertirSentidoInicial;

    // Si la pasada tiene múltiples tramos (lote cóncavo o con hueco)
    let tramosPasada = [...pasada.tramos];
    if (direccionInversa) {
      // Invertir el orden de los tramos y la dirección de cada tramo
      tramosPasada = tramosPasada.reverse().map(([ini, fin]) => [fin, ini]);
    }

    for (let tIdx = 0; tIdx < tramosPasada.length; tIdx++) {
      const [ptInicio, ptFin] = tramosPasada[tIdx];

      // Si venimos de un punto anterior, generar tramo de enlace (giro o salto de hueco)
      if (puntoAnterior) {
        const distEnlace = distanciaEuclidiana(puntoAnterior, ptInicio);
        if (distEnlace > 0.05) {
          segmentosRuta.push({
            tipo: "ENLACE",
            desde: puntoAnterior,
            hasta: ptInicio,
            distancia: distEnlace,
            pasadaIndice: pasada.indice
          });
        }
      }

      // Tramo activo de aplicación
      const distAplicacion = distanciaEuclidiana(ptInicio, ptFin);
      segmentosRuta.push({
        tipo: "APLICACION",
        desde: ptInicio,
        hasta: ptFin,
        distancia: distAplicacion,
        pasadaIndice: pasada.indice
      });

      puntoAnterior = ptFin;
    }
  }

  return segmentosRuta;
}

module.exports = {
  ordenarZigzag
};

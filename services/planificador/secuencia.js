/**
 * Módulo de secuenciación de pasadas: en qué orden se vuelan y cómo se une cada
 * una con la siguiente.
 *
 * Patrones (relevamiento, módulo 6 "Banderillero"):
 * - IDA_Y_VUELTA: pasadas contiguas, una al lado de la otra. Como la separación es
 *   el ancho de pasada (mucho menor que el diámetro de giro), cada vuelta es un
 *   giro en pera.
 * - REDONDO: el avión trabaja en circuito salteando pasadas, para que cada vuelta
 *   sea un giro en U abierto, siempre hacia el mismo lado. Se arman bloques de 2k
 *   pasadas y se alterna entre la mitad izquierda y la derecha del bloque:
 *   1, k+1, 2, k+2, ... k, 2k. Con k elegido para que la separación sea siempre
 *   de al menos 2R.
 *
 * En los dos casos las pasadas consecutivas se vuelan en sentidos opuestos.
 */

const { distanciaEuclidiana } = require("./proyeccion");
const { calcularGiro } = require("./giros");

const PATRONES = {
  IDA_Y_VUELTA: "IDA_Y_VUELTA",
  REDONDO: "REDONDO"
};

/** Orden de ida y vuelta: las pasadas en su orden natural. */
function ordenIdaYVuelta(cantidad) {
  return Array.from({ length: cantidad }, (_, i) => i);
}

/**
 * Cantidad de pasadas que se saltea el patrón redondo: la menor k que deja una
 * separación de al menos 2R tanto en (k) como en (k - 1) pasadas, que son las dos
 * distancias que alterna el circuito.
 */
function saltoRedondo(radio, separacionPasadas) {
  if (!(radio > 0) || !(separacionPasadas > 0)) return 1;
  return Math.ceil((2 * radio) / separacionPasadas) + 1;
}

/**
 * Orden del patrón redondo. Los bloques alternan por qué mitad empiezan para que
 * el paso de un bloque al siguiente también quede a más de 2R (si no, el último
 * de un bloque y el primero del siguiente serían pasadas contiguas).
 * @param {number} cantidad - Cantidad de pasadas
 * @param {number} k - Salto entre las dos mitades del bloque
 * @param {boolean} empezarPorDerecha - Por qué mitad arranca el primer bloque
 * @returns {number[]} Posiciones de las pasadas en el orden de vuelo
 */
function ordenRedondo(cantidad, k, empezarPorDerecha = false) {
  const orden = [];
  const tamanoBloque = 2 * Math.max(1, k);
  let porDerecha = empezarPorDerecha;

  for (let inicio = 0; inicio < cantidad; inicio += tamanoBloque) {
    const enBloque = Math.min(tamanoBloque, cantidad - inicio);
    // En un bloque incompleto el salto se achica a la mitad de lo que queda
    const mitad = enBloque === tamanoBloque ? k : Math.ceil(enBloque / 2);
    const izquierda = [];
    const derecha = [];

    for (let i = 0; i < enBloque; i++) {
      (i < mitad ? izquierda : derecha).push(inicio + i);
    }

    const [primera, segunda] = porDerecha && derecha.length > 0 ? [derecha, izquierda] : [izquierda, derecha];
    for (let i = 0; i < Math.max(primera.length, segunda.length); i++) {
      if (i < primera.length) orden.push(primera[i]);
      if (i < segunda.length) orden.push(segunda[i]);
    }

    porDerecha = !porDerecha;
  }

  return orden;
}

/**
 * Arma la ruta continua de pulverización a partir de un orden de pasadas.
 * @param {Array<{ indice: number, tramos: Array<[[number, number], [number, number]]> }>} pasadas
 * @param {number[]} orden - Posiciones de `pasadas` en el orden de vuelo
 * @param {Object} opciones
 * @param {boolean} opciones.invertirSentidoInicial - Si la primera pasada se vuela al revés
 * @param {number} opciones.radioGiroMetros - Radio de giro (0 = giros rectos, modelo anterior)
 * @returns {Array<{
 *   tipo: "APLICACION" | "ENLACE",
 *   desde: [number, number],
 *   hasta: [number, number],
 *   distancia: number,
 *   pasadaIndice: number,
 *   puntos?: Array<[number, number]>,
 *   esGiro?: boolean
 * }>}
 */
function secuenciarPasadas(pasadas, orden, { invertirSentidoInicial = false, radioGiroMetros = 0 } = {}) {
  if (!pasadas || pasadas.length === 0) return [];

  const segmentosRuta = [];
  let puntoAnterior = null;
  let rumboAnterior = null;

  orden.forEach((posicion, paso) => {
    const pasada = pasadas[posicion];
    const direccionInversa = paso % 2 === 0 ? invertirSentidoInicial : !invertirSentidoInicial;

    // Una pasada con varios tramos (lote cóncavo o con hueco) se recorre de punta a punta
    let tramos = [...pasada.tramos];
    if (direccionInversa) {
      tramos = tramos.reverse().map(([ini, fin]) => [fin, ini]);
    }

    tramos.forEach(([inicio, fin], indiceTramo) => {
      if (puntoAnterior) {
        const esGiro = indiceTramo === 0;

        if (esGiro) {
          // Vuelta entre pasadas, con el radio real de la aeronave
          const giro = calcularGiro(puntoAnterior, rumboAnterior, inicio, radioGiroMetros);
          segmentosRuta.push({
            tipo: "ENLACE",
            desde: puntoAnterior,
            hasta: inicio,
            distancia: giro.distancia,
            pasadaIndice: pasada.indice,
            puntos: giro.puntos,
            esGiro: true
          });
        } else {
          // Salto de un hueco dentro de la misma pasada: sigue derecho sin aplicar
          const distancia = distanciaEuclidiana(puntoAnterior, inicio);
          if (distancia > 0.05) {
            segmentosRuta.push({
              tipo: "ENLACE",
              desde: puntoAnterior,
              hasta: inicio,
              distancia,
              pasadaIndice: pasada.indice
            });
          }
        }
      }

      segmentosRuta.push({
        tipo: "APLICACION",
        desde: inicio,
        hasta: fin,
        distancia: distanciaEuclidiana(inicio, fin),
        pasadaIndice: pasada.indice
      });

      rumboAnterior = [fin[0] - inicio[0], fin[1] - inicio[1]];
      puntoAnterior = fin;
    });
  });

  return segmentosRuta;
}

module.exports = {
  PATRONES,
  ordenIdaYVuelta,
  ordenRedondo,
  saltoRedondo,
  secuenciarPasadas
};

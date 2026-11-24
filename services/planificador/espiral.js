/**
 * Patrón ESPIRAL: el avión recorre el borde del lote y va cerrando vueltas hacia
 * adentro, cada una a un ancho de pasada de la anterior, hasta llegar al centro.
 *
 * - Las vueltas se obtienen recortando el contorno por cada uno de sus lados
 *   corridos hacia adentro una distancia d (Sutherland-Hodgman). La primera vuelta
 *   va a medio ancho del borde y las siguientes cada un ancho. Es exacto en lotes
 *   convexos; por eso el espiral solo se ofrece si el lote no tiene entrantes ni
 *   huecos (ver forma.js).
 * - Es una espiral y no anillos cerrados: el último lado de cada vuelta, en lugar
 *   de cerrar, va al comienzo de la vuelta siguiente.
 * - En cada esquina con un cambio de rumbo mayor a 35° el avión hace un rulo para
 *   no dejar la esquina sin aplicar (giros.js → calcularGiroEsquina).
 *
 * Devuelve los mismos segmentos que secuencia.js, así que el corte en viajes, el
 * reparto de productos y el mapa funcionan igual que con los demás patrones. Cada
 * lado es una "pasada" para la regla de corte (no se interrumpe un lado a la mitad).
 */

const { distanciaEuclidiana } = require("./proyeccion");
const { calcularGiroEsquina } = require("./giros");
const { areaFirmada, sinCierre } = require("./forma");

const LADO_MINIMO_METROS = 0.5;
const MAXIMO_VUELTAS = 1000;

/** Quita puntos repetidos y vértices alineados (no aportan esquinas). */
function limpiar(pts) {
  const sinRepetidos = pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
  });
  return sinRepetidos.filter((b, i) => {
    const a = sinRepetidos[(i - 1 + sinRepetidos.length) % sinRepetidos.length];
    const c = sinRepetidos[(i + 1) % sinRepetidos.length];
    const cruz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    return Math.abs(cruz) > 1e-6;
  });
}

/** Recorta el polígono dejando los puntos con normal·(x − origen) ≥ d. */
function recortarSemiplano(poligono, origen, normal, d) {
  const valor = ([x, y]) => normal[0] * (x - origen[0]) + normal[1] * (y - origen[1]) - d;
  const resultado = [];
  for (let i = 0; i < poligono.length; i++) {
    const actual = poligono[i];
    const siguiente = poligono[(i + 1) % poligono.length];
    const va = valor(actual);
    const vs = valor(siguiente);
    if (va >= 0) resultado.push(actual);
    if ((va >= 0) !== (vs >= 0)) {
      const t = va / (va - vs);
      resultado.push([actual[0] + t * (siguiente[0] - actual[0]), actual[1] + t * (siguiente[1] - actual[1])]);
    }
  }
  return resultado;
}

/**
 * Vueltas del espiral, de afuera hacia adentro. Cada una es un polígono antihorario.
 * @param {Array<[number, number]>} contorno - Contorno antihorario, sin repetir el primer punto
 */
function calcularVueltas(contorno, ancho) {
  // Lados del contorno con su normal hacia adentro (a la izquierda, por ser antihorario)
  const lados = contorno.map((a, i) => {
    const b = contorno[(i + 1) % contorno.length];
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { origen: a, normal: [-(b[1] - a[1]) / largo, (b[0] - a[0]) / largo] };
  });

  const vueltas = [];
  for (let k = 0; k < MAXIMO_VUELTAS; k++) {
    const d = ancho / 2 + k * ancho;
    let vuelta = contorno;
    for (const lado of lados) {
      vuelta = recortarSemiplano(vuelta, lado.origen, lado.normal, d);
      if (vuelta.length < 3) break;
    }
    vuelta = vuelta.length >= 3 ? limpiar(vuelta) : [];
    // Se termina cuando ya no queda superficie (menos de una franja de 1 m de ancho)
    if (vuelta.length < 3 || Math.abs(areaFirmada(vuelta)) < ancho) break;
    vueltas.push(vuelta);
  }
  return vueltas;
}

const indiceMasCercano = (vuelta, [x, y]) => vuelta.reduce((mejor, p, i) => (
  Math.hypot(p[0] - x, p[1] - y) < Math.hypot(vuelta[mejor][0] - x, vuelta[mejor][1] - y) ? i : mejor
), 0);

/**
 * Prepara el espiral de un lote: contorno antihorario y sus vueltas.
 * @returns {{ vueltas: Array<Array<[number, number]>>, contorno: Array<[number, number]> } | null}
 */
function prepararEspiral(anillosLocales, ancho) {
  let contorno = limpiar(sinCierre(anillosLocales[0]));
  if (contorno.length < 3) return null;
  if (areaFirmada(contorno) < 0) contorno = contorno.reverse();
  const vueltas = calcularVueltas(contorno, ancho);
  return vueltas.length > 0 ? { contorno, vueltas } : null;
}

/**
 * Puntos del recorrido en espiral. Cada vuelta empieza en el vértice más cercano al
 * comienzo de la anterior, así el lado que "cierra" la vuelta pasa a la siguiente.
 * @param {number} inicio - Vértice de la primera vuelta por el que se entra
 * @param {boolean} horario - Recorrer en sentido horario en lugar de antihorario
 */
const anguloEntre = (u, v) => Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
const vector = (a, b) => [b[0] - a[0], b[1] - a[1]];

/**
 * Vértice por el que se entra a la vuelta siguiente. Se prueba el más cercano al
 * comienzo de la vuelta anterior y los 3 que le siguen, y se elige el que hace más
 * suave el paso de una vuelta a otra (en un lote redondo evita un rulo por vuelta).
 */
function entradaSiguienteVuelta(vuelta, referencia, penultimo, ultimo) {
  const cercano = indiceMasCercano(vuelta, referencia);
  const distanciaCercano = Math.hypot(vuelta[cercano][0] - referencia[0], vuelta[cercano][1] - referencia[1]);
  let mejor = cercano;
  let mejorGiro = Infinity;
  for (let paso = 0; paso <= 3; paso++) {
    const i = (cercano + paso) % vuelta.length;
    const entrada = vuelta[i];
    // Solo vértices cerca del comienzo anterior: uno lejano (p. ej. en un triángulo)
    // haría que el paso entre vueltas cruce el lote y saltee un lado entero
    if (Math.hypot(entrada[0] - referencia[0], entrada[1] - referencia[1]) > 2 * distanciaCercano + 1) continue;
    const siguiente = vuelta[(i + 1) % vuelta.length];
    const giro = anguloEntre(vector(penultimo, ultimo), vector(ultimo, entrada)) + anguloEntre(vector(ultimo, entrada), vector(entrada, siguiente));
    if (giro < mejorGiro - 1e-9) { mejorGiro = giro; mejor = i; }
  }
  return mejor;
}

function puntosEspiral(vueltas, inicio, horario) {
  const puntos = [];
  let referencia = null;

  vueltas.forEach((vueltaOriginal, k) => {
    const vuelta = horario ? [...vueltaOriginal].reverse() : vueltaOriginal;
    const desde = k === 0
      ? (horario ? vuelta.length - 1 - (inicio % vuelta.length) : inicio % vuelta.length)
      : entradaSiguienteVuelta(vuelta, referencia, puntos[puntos.length - 2], puntos[puntos.length - 1]);
    const ordenada = vuelta.slice(desde).concat(vuelta.slice(0, desde));
    referencia = ordenada[0];
    puntos.push(...ordenada);
  });

  // La última vuelta sí se cierra
  const ultima = vueltas.length - 1;
  if (ultima >= 0) puntos.push(puntos[puntos.length - vueltas[ultima].length]);
  return puntos;
}

/**
 * Segmentos de la ruta en espiral, con el mismo formato que secuenciarPasadas().
 */
function secuenciarEspiral(vueltas, { inicio = 0, horario = false, radioGiroMetros = 0 } = {}) {
  const puntos = puntosEspiral(vueltas, inicio, horario).filter((p, i, todos) => (
    i === 0 || Math.hypot(p[0] - todos[i - 1][0], p[1] - todos[i - 1][1]) >= LADO_MINIMO_METROS
  ));

  const segmentos = [];
  let rumboAnterior = null;
  let lado = 0;

  for (let i = 0; i < puntos.length - 1; i++) {
    const desde = puntos[i];
    const hasta = puntos[i + 1];
    const rumbo = [hasta[0] - desde[0], hasta[1] - desde[1]];

    if (rumboAnterior) {
      const giro = calcularGiroEsquina(desde, rumboAnterior, rumbo, radioGiroMetros);
      if (giro.distancia > 0) {
        segmentos.push({ tipo: "ENLACE", desde, hasta: desde, distancia: giro.distancia, pasadaIndice: lado, puntos: giro.puntos, esGiro: true });
      }
    }

    segmentos.push({ tipo: "APLICACION", desde, hasta, distancia: distanciaEuclidiana(desde, hasta), pasadaIndice: lado });
    rumboAnterior = rumbo;
    lado += 1;
  }

  return segmentos;
}

/** Vértices de la primera vuelta que vale la pena probar como entrada (hasta `maximo`, repartidos). */
function entradasCandidatas(vueltas, maximo = 8) {
  const cantidad = vueltas[0].length;
  const paso = Math.max(1, Math.floor(cantidad / maximo));
  const candidatas = [];
  for (let i = 0; i < cantidad; i += paso) candidatas.push(i);
  return candidatas;
}

module.exports = {
  calcularVueltas,
  entradasCandidatas,
  prepararEspiral,
  secuenciarEspiral
};

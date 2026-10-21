/**
 * Módulo de giros entre pasadas.
 *
 * Un avión agrícola no puede dar la vuelta en el lugar: gira con un radio que,
 * a 180-200 km/h, ronda los 150-300 m, mucho más que el ancho de pasada (20-30 m).
 * Al terminar una pasada sigue derecho hasta la línea de giro, vira y entra a la
 * siguiente en sentido contrario. Según la separación d entre las dos pasadas:
 *
 * - d >= 2R, giro en U: cuarto de círculo, recta de (d - 2R) y otro cuarto de
 *   círculo. Largo: pi·R + (d - 2R).
 * - d < 2R, giro en pera (omega): primero se abre hacia afuera un ángulo phi para
 *   tomar distancia, después vira 180° + 2·phi hacia la pasada siguiente y cierra
 *   con phi hacia afuera. Los tres arcos tienen radio R.
 *
 * Todo se calcula en el plano métrico local del lote.
 */

const PASO_ARCO_RAD = Math.PI / 18; // un punto cada 10° para dibujar las curvas

const sumar = (a, b) => [a[0] + b[0], a[1] + b[1]];
const restar = (a, b) => [a[0] - b[0], a[1] - b[1]];
const escalar = (v, k) => [v[0] * k, v[1] * k];
const producto = (a, b) => a[0] * b[0] + a[1] * b[1];
const cruz = (a, b) => a[0] * b[1] - a[1] * b[0];
// Normal a la izquierda del vector (giro antihorario)
const izquierda = (v) => [-v[1], v[0]];

function normalizar(v) {
  const largo = Math.hypot(v[0], v[1]);
  return largo > 0 ? [v[0] / largo, v[1] / largo] : [0, 0];
}

function rotar(v, angulo) {
  const cos = Math.cos(angulo);
  const sin = Math.sin(angulo);
  return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos];
}

/**
 * Avanza por un arco de radio R girando `angulo` radianes hacia el lado indicado.
 * @param {{ punto: [number, number], rumbo: [number, number] }} estado - Posición y rumbo unitario
 * @param {number} radio
 * @param {number} angulo - Ángulo a girar (positivo)
 * @param {1|-1} lado - 1 = izquierda (antihorario), -1 = derecha (horario)
 * @param {Array<[number, number]>} puntos - Se le agregan los puntos del arco
 * @returns {{ punto: [number, number], rumbo: [number, number] }}
 */
function avanzarArco(estado, radio, angulo, lado, puntos) {
  const centro = sumar(estado.punto, escalar(izquierda(estado.rumbo), radio * lado));
  const radial = restar(estado.punto, centro);
  const pasos = Math.max(1, Math.ceil(angulo / PASO_ARCO_RAD));

  for (let i = 1; i <= pasos; i++) {
    puntos.push(sumar(centro, rotar(radial, (lado * angulo * i) / pasos)));
  }

  return {
    punto: puntos[puntos.length - 1],
    rumbo: rotar(estado.rumbo, lado * angulo)
  };
}

/** Avanza en línea recta. */
function avanzarRecta(estado, largo, puntos) {
  if (largo <= 1e-6) return estado;

  const punto = sumar(estado.punto, escalar(estado.rumbo, largo));
  puntos.push(punto);
  return { punto, rumbo: estado.rumbo };
}

/**
 * Ángulo de apertura del giro en pera para una separación d < 2R.
 * Los centros de los dos arcos chicos quedan a (2R + d) de distancia y el del arco
 * grande, tangente a ambos, a 2R de cada uno.
 */
function aperturaPera(radio, separacion) {
  const mitad = radio + separacion / 2;
  const altura = Math.sqrt(Math.max(0, (2 * radio) ** 2 - mitad ** 2));
  return Math.PI - Math.atan2(altura, -mitad);
}

/** Largo de un giro en U o en pera, sin las prolongaciones rectas. */
function largoGiro(radio, separacion) {
  if (separacion >= 2 * radio) {
    return Math.PI * radio + (separacion - 2 * radio);
  }

  return radio * (4 * aperturaPera(radio, separacion) + Math.PI);
}

/**
 * Calcula el giro entre el final de una pasada y el comienzo de la siguiente,
 * que se vuela en sentido contrario.
 *
 * @param {[number, number]} salida - Último punto de la pasada que termina
 * @param {[number, number]} rumbo - Dirección de vuelo al terminar esa pasada
 * @param {[number, number]} entrada - Primer punto de la pasada siguiente
 * @param {number} radio - Radio de giro de la aeronave en metros
 * @returns {{ tipo: "U" | "PERA" | "RECTO", distancia: number, puntos: Array<[number, number]>,
 *   errorCierre?: number, rumboFinal?: [number, number] }}
 *   `puntos` va desde después de `salida` hasta `entrada` inclusive.
 */
function calcularGiro(salida, rumbo, entrada, radio) {
  const u = normalizar(rumbo);
  const delta = restar(entrada, salida);
  const avance = producto(delta, u);
  const lateral = delta[0] * -u[1] + delta[1] * u[0]; // proyección sobre la izquierda de u
  const separacion = Math.abs(lateral);

  // Sin radio, o pasadas sobre la misma línea: no hay giro que modelar
  if (!(radio > 0) || separacion < 1e-6) {
    return { tipo: "RECTO", distancia: Math.hypot(delta[0], delta[1]), puntos: [entrada] };
  }

  const lado = lateral > 0 ? 1 : -1; // hacia dónde queda la pasada siguiente
  const puntos = [];
  let estado = { punto: salida, rumbo: u };

  // 1) Seguir derecho hasta la línea de giro, si la pasada siguiente sobresale más
  estado = avanzarRecta(estado, Math.max(0, avance), puntos);

  // 2) El giro propiamente dicho
  let tipo;
  if (separacion >= 2 * radio) {
    tipo = "U";
    estado = avanzarArco(estado, radio, Math.PI / 2, lado, puntos);
    estado = avanzarRecta(estado, separacion - 2 * radio, puntos);
    estado = avanzarArco(estado, radio, Math.PI / 2, lado, puntos);
  } else {
    tipo = "PERA";
    const phi = aperturaPera(radio, separacion);
    estado = avanzarArco(estado, radio, phi, -lado, puntos);
    estado = avanzarArco(estado, radio, Math.PI + 2 * phi, lado, puntos);
    estado = avanzarArco(estado, radio, phi, -lado, puntos);
  }

  // 3) Seguir derecho hasta el comienzo de la pasada, si la anterior sobresalía más
  avanzarRecta(estado, Math.max(0, -avance), puntos);

  // Cuanto le erra la trayectoria construida a la entrada: debe ser ~0 (lo verifican los tests).
  // El último punto se fija en la entrada para no arrastrar el redondeo de los arcos.
  const ultimo = puntos[puntos.length - 1];
  const errorCierre = Math.hypot(ultimo[0] - entrada[0], ultimo[1] - entrada[1]);
  const rumboFinal = estado.rumbo;
  puntos[puntos.length - 1] = entrada;

  return { tipo, distancia: Math.abs(avance) + largoGiro(radio, separacion), puntos, errorCierre, rumboFinal };
}

module.exports = {
  aperturaPera,
  calcularGiro,
  cruz,
  largoGiro,
  normalizar
};

/**
 * Módulo de barrido de pasadas paralelas (Sweep-line).
 * Rota el polígono métrico local al ángulo neutro, intersecta líneas horizontales
 * separadas por el ancho de aplicación contra los anillos del polígono (contorno y huecos),
 * y des-rota los segmentos al sistema de coordenadas local original.
 */

/**
 * Rota un punto 2D métrico por un ángulo theta (en radianes).
 * @param {[number, number]} pt - [x, y]
 * @param {number} theta - Ángulo en radianes
 * @returns {[number, number]} [xRot, yRot]
 */
function rotarPunto([x, y], theta) {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [x * cos - y * sin, x * sin + y * cos];
}

/**
 * Calcula las intersecciones de una línea horizontal y = yCorte con los segmentos del polígono.
 * Soporta anillos exteriores e interiores (huecos).
 * @param {Array<Array<[number, number]>>} anillosRotados - Anillos en coordenadas rotadas
 * @param {number} yCorte - Altura de la línea horizontal
 * @returns {Array<[number, number]>} Pares [xInicio, xFin] de los tramos que caen DENTRO del lote
 */
function intersectarLineaConPoligono(anillosRotados, yCorte) {
  const interseccionesX = [];
  const EPSILON = 1e-7;

  for (const anillo of anillosRotados) {
    const numPts = anillo.length;
    for (let i = 0; i < numPts - 1; i++) {
      const p1 = anillo[i];
      const p2 = anillo[i + 1];

      let y1 = p1[1];
      let y2 = p2[1];
      const x1 = p1[0];
      const x2 = p2[0];

      // Pequeño desplazamiento si yCorte coincide exactamente con un vértice para evitar singularidades
      if (Math.abs(y1 - yCorte) < EPSILON) y1 += EPSILON;
      if (Math.abs(y2 - yCorte) < EPSILON) y2 += EPSILON;

      // Verificar si la línea horizontal cruza el segmento
      if ((y1 <= yCorte && yCorte < y2) || (y2 <= yCorte && yCorte < y1)) {
        const t = (yCorte - y1) / (y2 - y1);
        const xInter = x1 + t * (x2 - x1);
        interseccionesX.push(xInter);
      }
    }
  }

  // Ordenar de menor a mayor en X
  interseccionesX.sort((a, b) => a - b);

  // Filtrar duplicados muy cercanos debidos a vértices tangentes
  const interseccionesFiltradas = [];
  for (let i = 0; i < interseccionesX.length; i++) {
    if (
      interseccionesFiltradas.length === 0 ||
      Math.abs(interseccionesX[i] - interseccionesFiltradas[interseccionesFiltradas.length - 1]) > 1e-4
    ) {
      interseccionesFiltradas.push(interseccionesX[i]);
    }
  }

  // Emparejar por la regla par-impar (Inside-Outside de Jordan)
  const tramosX = [];
  for (let i = 0; i < interseccionesFiltradas.length - 1; i += 2) {
    const xInicio = interseccionesFiltradas[i];
    const xFin = interseccionesFiltradas[i + 1];
    // Solo conservar tramos con longitud positiva apreciable (> 0.5 metros)
    if (xFin - xInicio > 0.5) {
      tramosX.push([xInicio, xFin]);
    }
  }

  return tramosX;
}

/**
 * Genera el conjunto de pasadas paralelas para una orientación dada.
 * @param {Array<Array<[number, number]>>} anillosLocales - Anillos [exterior, hueco1, ...] en metros
 * @param {number} anguloRadianes - Ángulo de la pasada respecto al eje X
 * @param {number} anchoAplicacion - Ancho de pasada en metros
 * @returns {Array<{ indice: number, yRot: number, tramos: Array<[[number, number], [number, number]]> }>}
 */
function generarPasadasBarrido(anillosLocales, anguloRadianes, anchoAplicacion) {
  // Rotar el polígono por -anguloRadianes para alinear las pasadas con el eje X horizontal
  const anillosRotados = anillosLocales.map((anillo) =>
    anillo.map((pt) => rotarPunto(pt, -anguloRadianes))
  );

  const exteriorRotado = anillosRotados[0];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of exteriorRotado) {
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }

  const alturaTotal = maxY - minY;
  if (alturaTotal <= 0 || anchoAplicacion <= 0) {
    return [];
  }

  // Determinar alturas de las pasadas distribuidas equitativamente.
  // Se usa el techo (ceil) para cubrir TODO el lote: con el piso (floor) quedaban
  // franjas sin aplicar en los extremos. La separación real entre pasadas es menor o
  // igual al ancho de aplicación, por lo que puede haber una leve superposición,
  // que es lo correcto agronómicamente frente a dejar superficie sin tratar.
  const alturasY = [];
  if (alturaTotal <= anchoAplicacion) {
    // Si el lote es más angosto que el ancho de pasada, hacer 1 sola pasada centrada
    alturasY.push((minY + maxY) / 2);
  } else {
    const numPasadas = Math.max(1, Math.ceil(alturaTotal / anchoAplicacion));
    const separacion = alturaTotal / numPasadas;
    for (let k = 0; k < numPasadas; k++) {
      // Centro de cada franja: la primera y la última quedan a media franja del borde
      alturasY.push(minY + separacion * (k + 0.5));
    }
  }

  const pasadas = [];
  for (let idx = 0; idx < alturasY.length; idx++) {
    const yCorte = alturasY[idx];
    const tramosX = intersectarLineaConPoligono(anillosRotados, yCorte);

    if (tramosX.length === 0) continue;

    // Convertir los tramos [xInicio, xFin] de vuelta a coordenadas del plano local original (+anguloRadianes)
    const tramosLocales = tramosX.map(([xIni, xFin]) => {
      const pIniRot = [xIni, yCorte];
      const pFinRot = [xFin, yCorte];
      return [rotarPunto(pIniRot, anguloRadianes), rotarPunto(pFinRot, anguloRadianes)];
    });

    pasadas.push({
      indice: idx,
      yRot: yCorte,
      tramos: tramosLocales
    });
  }

  return pasadas;
}

module.exports = {
  rotarPunto,
  intersectarLineaConPoligono,
  generarPasadasBarrido
};

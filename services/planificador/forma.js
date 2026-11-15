/**
 * Análisis de la forma del lote y recomendación del patrón de trabajo.
 *
 * El interesado pidió que el trazado dependa de la forma del lote (cuadrado,
 * triángulo, formas irregulares) y que la app lo recomiende al piloto, que igual
 * puede volar otra cosa. Se mide la forma sobre el contorno en metros:
 *
 * - convexidad: superficie / superficie de la envolvente convexa (1 = sin entrantes).
 * - lados: vértices que quedan al simplificar el contorno (Douglas-Peucker con una
 *   tolerancia del 2% del tamaño del lote, para ignorar el "ruido" del dibujo).
 * - rectangularidad: superficie / rectángulo mínimo que lo contiene.
 * - elongación: lado largo / lado corto de ese rectángulo.
 * - giroMaximo: el mayor cambio de rumbo entre lados (bordes curvos → ángulos chicos).
 */

const sinCierre = (anillo) => {
  const pts = anillo.slice();
  const [x0, y0] = pts[0];
  const [xn, yn] = pts[pts.length - 1];
  if (pts.length > 1 && Math.hypot(x0 - xn, y0 - yn) < 1e-6) pts.pop();
  return pts;
};

/** Área con signo (positiva si el anillo es antihorario). El anillo no repite el primer punto. */
function areaFirmada(pts) {
  let suma = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    suma += x1 * y2 - x2 * y1;
  }
  return suma / 2;
}

/** Envolvente convexa (cadena monótona de Andrew), antihoraria. */
function envolventeConvexa(pts) {
  const ordenados = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (ordenados.length < 3) return ordenados;
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inferior = [];
  for (const p of ordenados) {
    while (inferior.length >= 2 && cruz(inferior[inferior.length - 2], inferior[inferior.length - 1], p) <= 0) inferior.pop();
    inferior.push(p);
  }
  const superior = [];
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const p = ordenados[i];
    while (superior.length >= 2 && cruz(superior[superior.length - 2], superior[superior.length - 1], p) <= 0) superior.pop();
    superior.push(p);
  }
  inferior.pop();
  superior.pop();
  return inferior.concat(superior);
}

/** Rectángulo de área mínima que contiene la envolvente (prueba la dirección de cada lado). */
function rectanguloMinimo(envolvente) {
  let mejor = null;
  for (let i = 0; i < envolvente.length; i++) {
    const [x1, y1] = envolvente[i];
    const [x2, y2] = envolvente[(i + 1) % envolvente.length];
    const largo = Math.hypot(x2 - x1, y2 - y1);
    if (largo < 1e-9) continue;
    const ux = (x2 - x1) / largo;
    const uy = (y2 - y1) / largo;
    let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
    for (const [x, y] of envolvente) {
      const pu = x * ux + y * uy;
      const pv = -x * uy + y * ux;
      minU = Math.min(minU, pu); maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv); maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!mejor || area < mejor.area) mejor = { area, a: maxU - minU, b: maxV - minV };
  }
  return mejor;
}

/** Simplificación Douglas-Peucker de un anillo cerrado (sin repetir el primer punto). */
function simplificarAnillo(pts, tolerancia) {
  if (pts.length <= 3) return pts;

  const distanciaASegmento = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax; const dy = by - ay;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  const dp = (lista) => {
    if (lista.length <= 2) return lista;
    let maxDist = 0; let indice = 0;
    for (let i = 1; i < lista.length - 1; i++) {
      const d = distanciaASegmento(lista[i], lista[0], lista[lista.length - 1]);
      if (d > maxDist) { maxDist = d; indice = i; }
    }
    if (maxDist <= tolerancia) return [lista[0], lista[lista.length - 1]];
    const izquierda = dp(lista.slice(0, indice + 1));
    const derecha = dp(lista.slice(indice));
    return izquierda.slice(0, -1).concat(derecha);
  };

  // Se corta el anillo en el punto más lejano al primero para tener dos cadenas abiertas
  let lejano = 0; let maxD = -1;
  pts.forEach(([x, y], i) => {
    const d = Math.hypot(x - pts[0][0], y - pts[0][1]);
    if (d > maxD) { maxD = d; lejano = i; }
  });
  const ida = dp(pts.slice(0, lejano + 1));
  const vuelta = dp(pts.slice(lejano).concat([pts[0]]));
  return ida.slice(0, -1).concat(vuelta.slice(0, -1));
}

/** Mayor cambio de rumbo entre lados consecutivos del anillo, en radianes. */
function giroMaximo(pts) {
  let maximo = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[i];
    const c = pts[(i + 1) % pts.length];
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - b[0], c[1] - b[1]];
    const angulo = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
    maximo = Math.max(maximo, angulo);
  }
  return maximo;
}

const FORMAS = {
  IRREGULAR: "IRREGULAR",
  REDONDEADA: "REDONDEADA",
  TRIANGULAR: "TRIANGULAR",
  CUADRADA: "CUADRADA",
  RECTANGULAR: "RECTANGULAR",
  POLIGONAL: "POLIGONAL"
};

/**
 * @param {Array<Array<[number, number]>>} anillosLocales - Contorno (y huecos) en metros
 * @returns {{ forma: string, metricas: Object, admiteEspiral: boolean }}
 */
function analizarForma(anillosLocales) {
  const contorno = sinCierre(anillosLocales[0]);
  const tieneHuecos = anillosLocales.length > 1;
  const area = Math.abs(areaFirmada(contorno));
  const envolvente = envolventeConvexa(contorno);
  const areaEnvolvente = Math.abs(areaFirmada(envolvente));
  const convexidad = areaEnvolvente > 0 ? area / areaEnvolvente : 0;
  const rect = rectanguloMinimo(envolvente);
  const elongacion = rect ? Math.max(rect.a, rect.b) / Math.max(1e-9, Math.min(rect.a, rect.b)) : 1;
  const rectangularidad = rect && rect.area > 0 ? area / rect.area : 0;

  const tolerancia = 0.02 * Math.sqrt(area);
  const simplificado = simplificarAnillo(contorno, tolerancia);
  const lados = simplificado.length;
  const giro = giroMaximo(simplificado);

  let forma;
  if (tieneHuecos || convexidad < 0.9) forma = FORMAS.IRREGULAR;
  else if (lados >= 8 && giro <= (45 * Math.PI) / 180) forma = FORMAS.REDONDEADA;
  else if (lados === 3) forma = FORMAS.TRIANGULAR;
  else if (lados === 4 && rectangularidad >= 0.9) forma = elongacion < 1.5 ? FORMAS.CUADRADA : FORMAS.RECTANGULAR;
  else forma = FORMAS.POLIGONAL;

  const redondear = (valor, decimales = 2) => Math.round(valor * 10 ** decimales) / 10 ** decimales;

  return {
    forma,
    // El espiral se arma recortando el lote hacia adentro: es exacto solo si no tiene entrantes ni huecos
    admiteEspiral: !tieneHuecos && convexidad >= 0.97,
    metricas: {
      superficieHa: redondear(area / 10000),
      convexidad: redondear(convexidad),
      lados,
      rectangularidad: redondear(rectangularidad),
      elongacion: redondear(elongacion),
      giroMaximoGrados: Math.round((giro * 180) / Math.PI),
      tieneHuecos
    }
  };
}

const NOMBRES = { IDA_Y_VUELTA: "ida y vuelta", REDONDO: "redondo", ESPIRAL: "espiral" };

/**
 * Patrón recomendado para la forma del lote. Primero la forma define qué patrones
 * tienen sentido; entre ellos se elige el de menor distancia total calculada.
 *
 * @param {{ forma: string, admiteEspiral: boolean }} analisis
 * @param {Object<string, number>} distancias - Distancia total del mejor plan de cada patrón
 * @returns {{ patron: string, forma: string, motivo: string, candidatos: string[] }}
 */
function recomendarPatron(analisis, distancias) {
  const disponibles = (lista) => lista.filter((p) => Number.isFinite(distancias[p]));
  let candidatos;
  let motivo;

  switch (analisis.forma) {
    case FORMAS.IRREGULAR:
      candidatos = disponibles(["IDA_Y_VUELTA", "REDONDO"]);
      motivo = "Lote irregular (con entrantes o huecos): un espiral no puede seguir el borde sin dejar zonas sin aplicar, así que se trabaja con pasadas paralelas.";
      break;
    case FORMAS.REDONDEADA:
      candidatos = disponibles(["ESPIRAL"]);
      motivo = "Lote de borde redondeado, sin esquinas marcadas: el espiral sigue el contorno sin vueltas en las esquinas y evita las pasadas cortas de los bordes curvos.";
      break;
    case FORMAS.RECTANGULAR:
      candidatos = disponibles(["REDONDO", "IDA_Y_VUELTA"]);
      motivo = "Lote alargado: conviene volar a lo largo, con pasadas largas y pocos giros.";
      break;
    case FORMAS.TRIANGULAR:
      candidatos = disponibles(["IDA_Y_VUELTA", "REDONDO", "ESPIRAL"]);
      motivo = "Lote triangular: las pasadas se acortan hacia el vértice, así que se compara cuál de los patrones vuela menos.";
      break;
    case FORMAS.CUADRADA:
      candidatos = disponibles(["IDA_Y_VUELTA", "REDONDO", "ESPIRAL"]);
      motivo = "Lote cuadrado, sin un lado dominante: se compara cuál de los patrones vuela menos.";
      break;
    default:
      candidatos = disponibles(["IDA_Y_VUELTA", "REDONDO", "ESPIRAL"]);
      motivo = "Lote poligonal sin entrantes: se compara cuál de los patrones vuela menos.";
  }

  // Si el patrón propio de la forma no se pudo calcular (p. ej. espiral en un lote no apto), se cae al resto
  if (candidatos.length === 0) candidatos = disponibles(["IDA_Y_VUELTA", "REDONDO", "ESPIRAL"]);

  const patron = candidatos.reduce((mejor, p) => (mejor === null || distancias[p] < distancias[mejor] ? p : mejor), null);
  if (candidatos.length > 1) {
    const nombres = candidatos.map((p) => NOMBRES[p]);
    const lista = `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
    motivo += ` Entre ${lista}, el de menor recorrido es ${NOMBRES[patron]}.`;
  }

  return { patron, forma: analisis.forma, motivo, candidatos };
}

module.exports = {
  FORMAS,
  analizarForma,
  areaFirmada,
  recomendarPatron,
  sinCierre
};

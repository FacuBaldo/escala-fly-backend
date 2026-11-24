const MAXIMO_PUNTOS_CABLE = 200;

const esCoordenada = (c) => Array.isArray(c) && c.length === 2 &&
  Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
  c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90;

/** Valida que la geometría corresponda al tipo: punto para estructuras, línea para cables. */
const validarGeometria = (tipo, geometria) => {
  if (!geometria || typeof geometria !== "object") return "Falta la ubicación del obstáculo en el mapa";

  if (tipo === "CABLE") {
    const puntos = geometria.coordinates;
    if (geometria.type !== "LineString" || !Array.isArray(puntos) || puntos.length < 2 || puntos.length > MAXIMO_PUNTOS_CABLE || !puntos.every(esCoordenada)) {
      return `Un cable se marca como una línea de 2 a ${MAXIMO_PUNTOS_CABLE} puntos`;
    }
    return null;
  }

  if (geometria.type !== "Point" || !esCoordenada(geometria.coordinates)) {
    return "Este obstáculo se marca como un punto en el mapa";
  }
  return null;
};

module.exports = { validarGeometria };

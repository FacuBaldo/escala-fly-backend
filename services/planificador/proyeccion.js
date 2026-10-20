/**
 * Servicios de proyección y distancias geoespaciales para el planificador de rutas.
 * Convierte entre coordenadas WGS84 [longitud, latitud] y coordenadas planas métricas
 * locales centradas en el centroide del lote, permitiendo cálculos euclidianos precisos.
 */

const RADIO_TIERRA_METROS = 6371000.0;
const RAD = Math.PI / 180.0;
const DEG = 180.0 / Math.PI;

/**
 * Calcula el centroide geométrico de un polígono GeoJSON.
 * @param {Object} geometriaGeoJson - Objeto Polygon { type: "Polygon", coordinates: [[[lng, lat], ...]] }
 * @returns {[number, number]} [lng0, lat0]
 */
function calcularCentroide(geometriaGeoJson) {
  const coordinates = geometriaGeoJson.coordinates;
  const exterior = coordinates[0];
  let sumX = 0;
  let sumY = 0;
  const count = exterior.length > 1 ? exterior.length - 1 : exterior.length;

  for (let i = 0; i < count; i++) {
    sumX += exterior[i][0];
    sumY += exterior[i][1];
  }

  return [sumX / count, sumY / count];
}

/**
 * Convierte un punto WGS84 [lng, lat] a coordenadas planas métricas locales [x, y]
 * relativas al punto de referencia [lng0, lat0].
 * @param {[number, number]} puntoWgs84 - [lng, lat]
 * @param {[number, number]} origen - [lng0, lat0]
 * @returns {[number, number]} [x, y] en metros
 */
function wgs84ALocal([lng, lat], [lng0, lat0]) {
  const lat0Rad = lat0 * RAD;
  const x = RADIO_TIERRA_METROS * (lng - lng0) * RAD * Math.cos(lat0Rad);
  const y = RADIO_TIERRA_METROS * (lat - lat0) * RAD;
  return [x, y];
}

/**
 * Convierte coordenadas planas métricas locales [x, y] de vuelta a WGS84 [lng, lat].
 * @param {[number, number]} puntoLocal - [x, y] en metros
 * @param {[number, number]} origen - [lng0, lat0]
 * @returns {[number, number]} [lng, lat]
 */
function localAWgs84([x, y], [lng0, lat0]) {
  const lat0Rad = lat0 * RAD;
  const latRad = lat0Rad + y / RADIO_TIERRA_METROS;
  const cosLat0 = Math.cos(lat0Rad);
  const lngRad = (lng0 * RAD) + (cosLat0 !== 0 ? x / (RADIO_TIERRA_METROS * cosLat0) : 0);
  return [lngRad * DEG, latRad * DEG];
}

/**
 * Proyecta todos los anillos de un polígono GeoJSON al plano métrico local.
 * @param {Object} geometriaGeoJson
 * @param {[number, number]} origen - [lng0, lat0]
 * @returns {Array<Array<[number, number]>>} Anillos con coordenadas locales en metros
 */
function proyectarPoligonoALocal(geometriaGeoJson, origen) {
  return geometriaGeoJson.coordinates.map((anillo) =>
    anillo.map((pt) => wgs84ALocal(pt, origen))
  );
}

/**
 * Distancia geodésica Haversine entre dos puntos WGS84 en metros.
 * @param {[number, number]} pt1 - [lng1, lat1]
 * @param {[number, number]} pt2 - [lng2, lat2]
 * @returns {number} Distancia en metros
 */
function distanciaHaversine([lng1, lat1], [lng2, lat2]) {
  const phi1 = lat1 * RAD;
  const phi2 = lat2 * RAD;
  const deltaPhi = (lat2 - lat1) * RAD;
  const deltaLambda = (lng2 - lng1) * RAD;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return RADIO_TIERRA_METROS * c;
}

/**
 * Distancia euclidiana en el plano local métrico.
 * @param {[number, number]} p1 - [x1, y1]
 * @param {[number, number]} p2 - [x2, y2]
 * @returns {number}
 */
function distanciaEuclidiana([x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

module.exports = {
  RADIO_TIERRA_METROS,
  calcularCentroide,
  wgs84ALocal,
  localAWgs84,
  proyectarPoligonoALocal,
  distanciaHaversine,
  distanciaEuclidiana
};

/**
 * Facade principal del servicio de planificación automática de rutas y viajes de vuelo.
 */

const { calcularCentroide, proyectarPoligonoALocal } = require("./proyeccion");
const { optimizarRutaVuelo } = require("./optimizador");

// Radio con el que se calculan los giros si no se indica otro: un avión agrícola a
// 180-200 km/h gira con un radio de entre 180 y 315 m según cuánto se incline.
const RADIO_GIRO_POR_DEFECTO = 200;
const PATRONES_VALIDOS = ["AUTOMATICO", "IDA_Y_VUELTA", "REDONDO"];

/**
 * Genera el plan de vuelo óptimo: pasadas, patrón de trabajo con giros reales y corte en viajes por caldo.
 * @param {Object} params
 * @param {Object} params.poligonoGeoJson - Geometría Polygon GeoJSON (WGS84)
 * @param {Object} params.pistaPrincipal - { id, nombre, latitud, longitud }
 * @param {Object} params.pistaCarga - { id, nombre, latitud, longitud }
 * @param {number} params.anchoAplicacionMetros - Ancho de pasada en metros (> 0)
 * @param {number} params.litrosPorHectarea - Dosis de caldo por hectárea (> 0)
 * @param {number} params.capacidadUtilLitros - Capacidad útil de la tolva en litros (> 0)
 * @param {number} [params.radioGiroMetros] - Radio de giro de la aeronave (> 0, por defecto 200 m)
 * @param {"AUTOMATICO"|"IDA_Y_VUELTA"|"REDONDO"} [params.patron] - Patrón de trabajo; AUTOMATICO
 *   evalúa todos y se queda con el más corto
 * @returns {Object} Plan de vuelo completo con estadísticas y viajes
 */
function generarPlanDeVuelo(params) {
  const {
    poligonoGeoJson,
    pistaPrincipal,
    pistaCarga,
    anchoAplicacionMetros,
    litrosPorHectarea,
    capacidadUtilLitros,
    radioGiroMetros = RADIO_GIRO_POR_DEFECTO,
    patron = "AUTOMATICO"
  } = params;

  if (!poligonoGeoJson || !poligonoGeoJson.coordinates || poligonoGeoJson.coordinates.length === 0) {
    throw new Error("El polígono del lote es obligatorio y debe tener coordenadas válidas");
  }

  if (!pistaPrincipal || pistaPrincipal.latitud === undefined || pistaPrincipal.longitud === undefined) {
    throw new Error("La pista principal es obligatoria con latitud y longitud válidas");
  }

  if (!pistaCarga || pistaCarga.latitud === undefined || pistaCarga.longitud === undefined) {
    throw new Error("La pista de carga es obligatoria con latitud y longitud válidas");
  }

  const ancho = Number(anchoAplicacionMetros);
  const lHa = Number(litrosPorHectarea);
  const cap = Number(capacidadUtilLitros);

  if (!(ancho > 0)) throw new Error("El ancho de aplicación debe ser mayor a 0 metros");
  if (!(lHa > 0)) throw new Error("Los litros por hectárea deben ser mayores a 0");
  if (!(cap > 0)) throw new Error("La capacidad útil debe ser mayor a 0 litros");

  const radio = Number(radioGiroMetros);
  if (!(radio > 0)) throw new Error("El radio de giro debe ser mayor a 0 metros");
  if (!PATRONES_VALIDOS.includes(patron)) {
    throw new Error(`El patrón de trabajo debe ser uno de: ${PATRONES_VALIDOS.join(", ")}`);
  }

  // Con una capacidad ínfima harían falta infinitos viajes para cubrir el lote.
  // Se exige que la tolva alcance al menos para un tramo mínimo de pasada.
  const litrosPorMetro = (ancho * lHa) / 10000.0;
  const METROS_MINIMOS_POR_VIAJE = 50;

  if (cap < litrosPorMetro * METROS_MINIMOS_POR_VIAJE) {
    const minimoLitros = Math.ceil(litrosPorMetro * METROS_MINIMOS_POR_VIAJE);
    throw new Error(
      `La capacidad útil de ${cap} L es demasiado baja para un ancho de ${ancho} m y ${lHa} L/ha: ` +
      `se necesitan al menos ${minimoLitros} L para aplicar un tramo mínimo de pasada.`
    );
  }

  // 1. Calcular centroide WGS84 para la proyección plana métrica local
  const origenCentroide = calcularCentroide(poligonoGeoJson);

  // 2. Proyectar anillos del polígono a metros locales
  const anillosLocales = proyectarPoligonoALocal(poligonoGeoJson, origenCentroide);

  // 3. Ejecutar optimizador
  const resultado = optimizarRutaVuelo(anillosLocales, {
    anchoAplicacionMetros: ancho,
    litrosPorHectarea: lHa,
    capacidadUtilLitros: cap,
    radioGiroMetros: radio,
    patron,
    pistaPrincipal,
    pistaCarga,
    origenCentroide
  });

  if (!resultado || !resultado.viajes || resultado.viajes.length === 0) {
    throw new Error("No se pudo generar una ruta válida para las dimensiones del lote");
  }

  return {
    orientacionGrados: resultado.orientacionOptimaGrados,
    patron: resultado.patron,
    radioGiroMetros: radio,
    distanciaGirosMetros: resultado.distanciaGirosMetros,
    comparacionPatrones: resultado.comparacionPatrones,
    cantidadPasadas: resultado.cantidadPasadas,
    cantidadViajes: resultado.viajes.length,
    superficieHa: resultado.superficieHa,
    caldoTotalLitros: resultado.caldoTotalLitros,
    distanciaTotalMetros: resultado.distanciaTotalMetros,
    distanciaAplicacionMetros: resultado.distanciaAplicacionMetros,
    distanciaTrasladoMetros: resultado.distanciaTrasladoMetros,
    viajes: resultado.viajes
  };
}

module.exports = {
  PATRONES_VALIDOS,
  RADIO_GIRO_POR_DEFECTO,
  generarPlanDeVuelo
};

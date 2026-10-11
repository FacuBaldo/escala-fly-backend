/**
 * Módulo de partición de ruta en viajes según capacidad útil de caldo.
 * Corta en el punto exacto donde se agota la capacidad útil y asigna pistas:
 * - Viaje 1: sale de Pista Principal
 * - Viajes intermedios: van y vuelven de Pista de Carga
 * - Último viaje: vuelve a Pista Principal
 * - Viaje único: sale y vuelve a Pista Principal
 */

const { distanciaEuclidiana, localAWgs84, wgs84ALocal } = require("./proyeccion");

/**
 * Interpola un punto a una distancia d desde el punto inicial en el segmento p1 -> p2.
 * @param {[number, number]} p1
 * @param {[number, number]} p2
 * @param {number} distancia
 * @param {number} longitudTotal
 * @returns {[number, number]}
 */
function interpolarPunto(p1, p2, distancia, longitudTotal) {
  if (longitudTotal <= 0) return [p1[0], p1[1]];
  const ratio = Math.min(1, Math.max(0, distancia / longitudTotal));
  return [
    p1[0] + (p2[0] - p1[0]) * ratio,
    p1[1] + (p2[1] - p1[1]) * ratio
  ];
}

/**
 * Divide la secuencia de segmentos en viajes según la capacidad útil de caldo.
 * @param {Array<{ tipo: "APLICACION" | "ENLACE", desde: [number, number], hasta: [number, number], distancia: number }>} segmentosRuta
 * @param {Object} config
 * @param {number} config.anchoAplicacionMetros
 * @param {number} config.litrosPorHectarea
 * @param {number} config.capacidadUtilLitros
 * @param {Object} config.pistaPrincipal - { id, nombre, latitud, longitud }
 * @param {Object} config.pistaCarga - { id, nombre, latitud, longitud }
 * @param {[number, number]} config.origenCentroide - [lng0, lat0]
 * @returns {Array<Object>} Lista de viajes calculados
 */
function particionarEnViajes(segmentosRuta, config) {
  const {
    anchoAplicacionMetros,
    litrosPorHectarea,
    capacidadUtilLitros,
    pistaPrincipal,
    pistaCarga,
    origenCentroide
  } = config;

  if (!segmentosRuta || segmentosRuta.length === 0) return [];

  // Litros de caldo consumidos por metro lineal de pasada
  // (ancho en metros * 1 m = ancho m2; 1 ha = 10000 m2)
  const litrosPorMetro = (anchoAplicacionMetros * litrosPorHectarea) / 10000.0;

  // Calcular caldo total de todos los tramos de aplicación
  let distanciaAplicacionTotal = 0;
  for (const seg of segmentosRuta) {
    if (seg.tipo === "APLICACION") {
      distanciaAplicacionTotal += seg.distancia;
    }
  }

  const caldoTotalLote = distanciaAplicacionTotal * litrosPorMetro;
  const cantidadViajesEstimada = Math.max(1, Math.ceil(caldoTotalLote / capacidadUtilLitros));

  // Coordenadas locales de las pistas
  const coordPistaPrincipalLocal = wgs84ALocal([pistaPrincipal.longitud, pistaPrincipal.latitud], origenCentroide);
  const coordPistaCargaLocal = wgs84ALocal([pistaCarga.longitud, pistaCarga.latitud], origenCentroide);

  // Copia de trabajo de los segmentos para ir consumiendo
  const colaSegmentos = segmentosRuta.map((s) => ({ ...s, restante: s.distancia }));

  const viajes = [];
  let indiceSeg = 0;
  let puntoPartidaSegmentoActual = null;

  while (indiceSeg < colaSegmentos.length) {
    const numViaje = viajes.length + 1;
    let caldoRestanteEnTolva = capacidadUtilLitros;

    const tramosAplicacionViaje = []; // Array de [[p1, p2], ...]
    const caminoRecorridoViaje = [];  // Array de puntos [pt, pt, ...]

    let distanciaAplicacionViaje = 0;
    let distanciaEnlacesViaje = 0;

    // Determinar pistas para este viaje
    // Nota: Como la cantidad de viajes se conoce al terminar o estimar, asignamos dinámicamente:
    // El viaje 1 sale de principal; posteriores salen de carga.
    // La llegada se ajusta al verificar si es el último viaje.
    const esPrimerViaje = numViaje === 1;

    let puntoSalidaLocal = esPrimerViaje ? coordPistaPrincipalLocal : coordPistaCargaLocal;
    caminoRecorridoViaje.push(puntoSalidaLocal);

    let primerPuntoLote = null;

    while (indiceSeg < colaSegmentos.length && caldoRestanteEnTolva > 1e-4) {
      const seg = colaSegmentos[indiceSeg];
      const pDesde = puntoPartidaSegmentoActual || seg.desde;
      const pHasta = seg.hasta;
      const distDisponibleSeg = seg.restante;

      if (!primerPuntoLote) {
        primerPuntoLote = pDesde;
        // Agregar punto de entrada al lote al recorrido
        caminoRecorridoViaje.push(pDesde);
      }

      if (seg.tipo === "ENLACE") {
        // Enlace no consume caldo
        distanciaEnlacesViaje += distDisponibleSeg;
        caminoRecorridoViaje.push(pHasta);
        puntoPartidaSegmentoActual = null;
        indiceSeg++;
      } else {
        // Tramo de APLICACIÓN
        const caldoNecesario = distDisponibleSeg * litrosPorMetro;

        if (caldoNecesario <= caldoRestanteEnTolva + 1e-5) {
          // El caldo alcanza para completar todo lo que queda de este segmento
          caldoRestanteEnTolva -= caldoNecesario;
          distanciaAplicacionViaje += distDisponibleSeg;
          tramosAplicacionViaje.push([pDesde, pHasta]);
          caminoRecorridoViaje.push(pHasta);

          puntoPartidaSegmentoActual = null;
          indiceSeg++;
        } else {
          // El caldo se agota EN MEDIO de este tramo: CORTE EXACTO
          const distPosible = caldoRestanteEnTolva / litrosPorMetro;
          const pCorte = interpolarPunto(pDesde, pHasta, distPosible, distDisponibleSeg);

          distanciaAplicacionViaje += distPosible;
          tramosAplicacionViaje.push([pDesde, pCorte]);
          caminoRecorridoViaje.push(pCorte);

          // Actualizar el segmento para el siguiente viaje
          seg.restante = distDisponibleSeg - distPosible;
          puntoPartidaSegmentoActual = pCorte;
          caldoRestanteEnTolva = 0;
          break; // Fin de este viaje por agotamiento de caldo
        }
      }
    }

    // El viaje ha concluido su recorrido en lote
    const ultimoPuntoLote = caminoRecorridoViaje[caminoRecorridoViaje.length - 1];

    viajes.push({
      numero: numViaje,
      caldoLitros: Math.round((capacidadUtilLitros - caldoRestanteEnTolva) * 100) / 100,
      superficieHa: Math.round(((distanciaAplicacionViaje * anchoAplicacionMetros) / 10000.0) * 100) / 100,
      distanciaAplicacionMetros: Math.round(distanciaAplicacionViaje * 10) / 10,
      distanciaEnlacesMetros: Math.round(distanciaEnlacesViaje * 10) / 10,
      primerPuntoLote,
      ultimoPuntoLote,
      caminoRecorridoViaje,
      tramosAplicacionViaje
    });
  }

  const totalViajes = viajes.length;

  // Asignar pistas de salida y llegada definitivas y cerrar recorridos
  const viajesFinales = viajes.map((v, i) => {
    const esPrimero = i === 0;
    const esUltimo = i === totalViajes - 1;

    let pistaSalida;
    let tipoSalida;
    let pistaLlegada;
    let tipoLlegada;
    let coordLlegadaLocal;

    if (totalViajes === 1) {
      pistaSalida = pistaPrincipal;
      tipoSalida = "PRINCIPAL";
      pistaLlegada = pistaPrincipal;
      tipoLlegada = "PRINCIPAL";
      coordLlegadaLocal = coordPistaPrincipalLocal;
    } else {
      if (esPrimero) {
        pistaSalida = pistaPrincipal;
        tipoSalida = "PRINCIPAL";
        pistaLlegada = pistaCarga;
        tipoLlegada = "CARGA";
        coordLlegadaLocal = coordPistaCargaLocal;
      } else if (esUltimo) {
        pistaSalida = pistaCarga;
        tipoSalida = "CARGA";
        pistaLlegada = pistaPrincipal;
        tipoLlegada = "PRINCIPAL";
        coordLlegadaLocal = coordPistaPrincipalLocal;
      } else {
        pistaSalida = pistaCarga;
        tipoSalida = "CARGA";
        pistaLlegada = pistaCarga;
        tipoLlegada = "CARGA";
        coordLlegadaLocal = coordPistaCargaLocal;
      }
    }

    // Agregar regreso a la pista de llegada al camino recorrido
    const coordSalidaLocal = esPrimero ? coordPistaPrincipalLocal : coordPistaCargaLocal;
    v.caminoRecorridoViaje.push(coordLlegadaLocal);

    // Calcular distancias de traslados (despegue hasta lote + lote hasta aterrizaje)
    const distDespegue = distanciaEuclidiana(coordSalidaLocal, v.primerPuntoLote || coordSalidaLocal);
    const distRegreso = distanciaEuclidiana(v.ultimoPuntoLote || coordLlegadaLocal, coordLlegadaLocal);
    const distanciaTrasladoMetros = Math.round((distDespegue + distRegreso + v.distanciaEnlacesMetros) * 10) / 10;
    const distanciaTotalMetros = Math.round((distanciaTrasladoMetros + v.distanciaAplicacionMetros) * 10) / 10;

    // Convertir geometrías a GeoJSON WGS84
    const coordsRecorridoWgs84 = v.caminoRecorridoViaje.map((pt) => localAWgs84(pt, origenCentroide));
    const coordsTramosWgs84 = v.tramosAplicacionViaje.map(([p1, p2]) => [
      localAWgs84(p1, origenCentroide),
      localAWgs84(p2, origenCentroide)
    ]);

    return {
      numero: v.numero,
      pistaSalidaId: pistaSalida.id,
      pistaSalidaNombre: pistaSalida.nombre,
      tipoSalida,
      pistaLlegadaId: pistaLlegada.id,
      pistaLlegadaNombre: pistaLlegada.nombre,
      tipoLlegada,
      caldoLitros: v.caldoLitros,
      superficieHa: v.superficieHa,
      distanciaMetros: distanciaTotalMetros,
      distanciaAplicacionMetros: v.distanciaAplicacionMetros,
      distanciaTrasladoMetros,
      recorrido: {
        type: "LineString",
        coordinates: coordsRecorridoWgs84
      },
      tramosAplicacion: {
        type: "MultiLineString",
        coordinates: coordsTramosWgs84
      }
    };
  });

  return viajesFinales;
}

module.exports = {
  interpolarPunto,
  particionarEnViajes
};

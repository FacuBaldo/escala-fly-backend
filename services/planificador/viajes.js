/**
 * Módulo de partición de ruta en viajes según capacidad útil de caldo.
 * El corte se realiza SIEMPRE al finalizar una pasada completa: el piloto nunca
 * deja una pasada a medias, aunque eso implique volver a cargar con caldo sobrante
 * (y, en algunos casos, requiera un viaje adicional). Asignación de pistas:
 * - Viaje 1: sale de Pista Principal
 * - Viajes intermedios: van y vuelven de Pista de Carga
 * - Último viaje: vuelve a Pista Principal
 * - Viaje único: sale y vuelve a Pista Principal
 *
 * Excepción: si una sola pasada necesita más caldo que la capacidad útil de la
 * aeronave, es imposible completarla en un viaje; sólo en ese caso se corta dentro
 * de la pasada para no bloquear la planificación.
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
 * Agrupa los segmentos consecutivos que pertenecen a la misma pasada.
 * Cada grupo incluye el enlace de entrada a la pasada, sus tramos de aplicación
 * y los enlaces internos (por ejemplo, al saltear un hueco del lote).
 * @param {Array<Object>} segmentosRuta
 * @param {number} litrosPorMetro
 * @returns {Array<{ pasadaIndice: number, segmentos: Array<Object>, caldoLitros: number }>}
 */
function agruparPorPasada(segmentosRuta, litrosPorMetro) {
  const grupos = [];

  for (const seg of segmentosRuta) {
    const ultimo = grupos[grupos.length - 1];

    if (ultimo && ultimo.pasadaIndice === seg.pasadaIndice) {
      ultimo.segmentos.push(seg);
    } else {
      grupos.push({ pasadaIndice: seg.pasadaIndice, segmentos: [seg] });
    }
  }

  for (const grupo of grupos) {
    grupo.caldoLitros = grupo.segmentos
      .filter((seg) => seg.tipo === "APLICACION")
      .reduce((total, seg) => total + seg.distancia * litrosPorMetro, 0);
  }

  return grupos;
}

/**
 * Divide la secuencia de segmentos en viajes cortando sólo al terminar pasadas completas.
 * @param {Array<{ tipo: "APLICACION" | "ENLACE", desde: [number, number], hasta: [number, number], distancia: number, pasadaIndice: number }>} segmentosRuta
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

  // Coordenadas locales de las pistas
  const coordPistaPrincipalLocal = wgs84ALocal([pistaPrincipal.longitud, pistaPrincipal.latitud], origenCentroide);
  const coordPistaCargaLocal = wgs84ALocal([pistaCarga.longitud, pistaCarga.latitud], origenCentroide);

  const grupos = agruparPorPasada(segmentosRuta, litrosPorMetro);

  const viajes = [];
  let indiceGrupo = 0;
  // Segmentos sobrantes de una pasada que no entra entera en la tolva (caso excepcional)
  let restoPasada = null;

  while (indiceGrupo < grupos.length || restoPasada) {
    const numViaje = viajes.length + 1;
    let caldoRestanteEnTolva = capacidadUtilLitros;

    const tramosAplicacionViaje = []; // Array de [[p1, p2], ...]
    const caminoRecorridoViaje = [];  // Array de puntos [pt, pt, ...]

    let distanciaAplicacionViaje = 0;
    let distanciaEnlacesViaje = 0;
    let distanciaGirosViaje = 0;
    let primerPuntoLote = null;

    const esPrimerViaje = numViaje === 1;
    const puntoSalidaLocal = esPrimerViaje ? coordPistaPrincipalLocal : coordPistaCargaLocal;
    caminoRecorridoViaje.push(puntoSalidaLocal);

    /**
     * Agrega un segmento al viaje en curso. Los enlaces previos al primer tramo de
     * aplicación se descartan: el avión llega al lote desde la pista, no desde la
     * pasada anterior.
     */
    const agregarSegmento = (seg, puntoDesde) => {
      const pDesde = puntoDesde || seg.desde;
      const pHasta = seg.hasta;

      if (seg.tipo === "ENLACE") {
        if (!primerPuntoLote) return; // enlace de entrada: lo reemplaza el traslado desde la pista
        distanciaEnlacesViaje += seg.distancia;
        if (seg.esGiro) distanciaGirosViaje += seg.distancia;
        // Los giros traen la curva completa; los saltos de hueco, solo el destino
        caminoRecorridoViaje.push(...(seg.puntos || [pHasta]));
        return;
      }

      if (!primerPuntoLote) {
        primerPuntoLote = pDesde;
        caminoRecorridoViaje.push(pDesde);
      }

      const distancia = distanciaEuclidiana(pDesde, pHasta);
      caldoRestanteEnTolva -= distancia * litrosPorMetro;
      distanciaAplicacionViaje += distancia;
      tramosAplicacionViaje.push([pDesde, pHasta]);
      caminoRecorridoViaje.push(pHasta);
    };

    /**
     * Caso excepcional: la pasada no entra entera en la tolva. Se consume lo que
     * permita la capacidad y se devuelven los segmentos restantes para el viaje siguiente.
     */
    const consumirPasadaDemasiadoLarga = (segmentos) => {
      const sobrantes = [];
      let puntoPartida = null;

      for (const seg of segmentos) {
        if (sobrantes.length > 0) {
          sobrantes.push(seg);
          continue;
        }

        const pDesde = puntoPartida || seg.desde;
        const distanciaSeg = distanciaEuclidiana(pDesde, seg.hasta);

        if (seg.tipo === "ENLACE") {
          agregarSegmento(seg, pDesde);
          puntoPartida = null;
          continue;
        }

        const caldoNecesario = distanciaSeg * litrosPorMetro;

        if (caldoNecesario <= caldoRestanteEnTolva + 1e-5) {
          agregarSegmento(seg, pDesde);
          puntoPartida = null;
          continue;
        }

        // El caldo se agota en medio del tramo: corte interno inevitable
        const distPosible = Math.max(0, caldoRestanteEnTolva / litrosPorMetro);
        const pCorte = interpolarPunto(pDesde, seg.hasta, distPosible, distanciaSeg);

        if (distPosible > 0.05) {
          agregarSegmento({ ...seg, hasta: pCorte }, pDesde);
        }

        sobrantes.push({ ...seg, desde: pCorte, distancia: distanciaEuclidiana(pCorte, seg.hasta) });
      }

      return sobrantes.length > 0 ? sobrantes : null;
    };

    // 1) Terminar primero lo que haya quedado pendiente de una pasada demasiado larga
    if (restoPasada) {
      restoPasada = consumirPasadaDemasiadoLarga(restoPasada);
    }

    // 2) Agregar pasadas completas mientras entren enteras en la tolva
    while (!restoPasada && indiceGrupo < grupos.length) {
      const grupo = grupos[indiceGrupo];
      const entraEntera = grupo.caldoLitros <= caldoRestanteEnTolva + 1e-5;

      if (!entraEntera) {
        // Si el viaje ya tiene pasadas, se cierra al final de la última completa
        if (tramosAplicacionViaje.length > 0) break;

        // La pasada sola supera la capacidad útil: corte interno inevitable
        restoPasada = consumirPasadaDemasiadoLarga(grupo.segmentos);
        indiceGrupo++;
        break;
      }

      for (const seg of grupo.segmentos) {
        agregarSegmento(seg, null);
      }
      indiceGrupo++;
    }

    // Si el viaje quedó sin aplicación (por ejemplo, sólo enlaces), evitar un ciclo infinito
    if (tramosAplicacionViaje.length === 0 && !restoPasada) {
      if (indiceGrupo >= grupos.length) break;
      continue;
    }

    const ultimoPuntoLote = caminoRecorridoViaje[caminoRecorridoViaje.length - 1];

    viajes.push({
      numero: numViaje,
      caldoLitros: Math.round((capacidadUtilLitros - caldoRestanteEnTolva) * 100) / 100,
      superficieHa: Math.round(((distanciaAplicacionViaje * anchoAplicacionMetros) / 10000.0) * 100) / 100,
      distanciaAplicacionMetros: Math.round(distanciaAplicacionViaje * 10) / 10,
      distanciaEnlacesMetros: Math.round(distanciaEnlacesViaje * 10) / 10,
      distanciaGirosMetros: Math.round(distanciaGirosViaje * 10) / 10,
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
      distanciaGirosMetros: v.distanciaGirosMetros,
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
  agruparPorPasada,
  interpolarPunto,
  particionarEnViajes
};

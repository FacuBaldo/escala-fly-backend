/**
 * Reparto de los productos de la mezcla entre los viajes (cargas) del plan de vuelo.
 *
 * Funciones puras, sin base de datos: reciben los viajes del plan y los productos de la
 * orden y devuelven cuánto de cada producto lleva cada carga. Se usan para armar la
 * orden del cargador.
 *
 * Regla de reparto (por producto):
 * - Con dosis por hectárea: cada viaje lleva dosis × hectáreas que aplica ese viaje.
 *   Es lo que pide la receta agronómica; el total que trajo el cliente se usa para
 *   avisar si sobra o falta producto.
 * - Sin dosis pero con total del cliente: el total se divide en proporción a las
 *   hectáreas de cada viaje (dosis efectiva = total / superficie).
 * - Sin ninguno de los dos datos: el producto no se reparte.
 */

// Las cantidades se redondean a centésimas de la unidad del producto (p. ej. 0,01 L)
const DECIMALES = 2;
const FACTOR = 10 ** DECIMALES;

const redondear = (valor) => Math.round(valor * FACTOR) / FACTOR;

const esPositivo = (valor) => typeof valor === "number" && Number.isFinite(valor) && valor > 0;

/**
 * Divide `total` en partes proporcionales a `pesos`, redondeadas a centésimas, de modo
 * que la suma de las partes sea exactamente el total redondeado (método del resto mayor).
 * Sin esto, redondear cada parte por separado puede hacer que la suma no cierre.
 */
const dividirProporcional = (total, pesos) => {
  const sumaPesos = pesos.reduce((acumulado, peso) => acumulado + peso, 0);
  if (!(sumaPesos > 0)) return pesos.map(() => 0);

  const totalEnCentesimas = Math.round(total * FACTOR);
  const exactas = pesos.map((peso) => (totalEnCentesimas * peso) / sumaPesos);
  const partes = exactas.map(Math.floor);
  let restante = totalEnCentesimas - partes.reduce((acumulado, parte) => acumulado + parte, 0);

  // Las centésimas que faltan van a las partes con mayor resto decimal
  const porResto = exactas
    .map((exacta, indice) => ({ indice, resto: exacta - Math.floor(exacta) }))
    .sort((a, b) => b.resto - a.resto || a.indice - b.indice);

  for (let i = 0; restante > 0; i = (i + 1) % porResto.length, restante -= 1) {
    partes[porResto[i].indice] += 1;
  }

  return partes.map((parte) => parte / FACTOR);
};

/**
 * @param {Array<{numero:number, superficieHa:number, caldoLitros:number}>} viajes
 * @param {Array<{productoId:string, dosisPorHectarea:?number, cantidadTotalCliente:?number}>} productos
 * @returns {{
 *   cargas: Array<{numeroViaje:number, productoId:string, cantidad:number}>,
 *   resumen: Array<{productoId:string, criterio:"DOSIS"|"TOTAL_CLIENTE"|"SIN_DATOS",
 *     requerido:?number, totalCliente:?number, diferencia:?number, dosisEfectiva:?number}>
 * }}
 */
const repartirProductos = (viajes, productos) => {
  const viajesOrdenados = [...viajes].sort((a, b) => a.numero - b.numero);
  const hectareas = viajesOrdenados.map((viaje) => Math.max(0, Number(viaje.superficieHa) || 0));
  const superficieTotal = hectareas.reduce((acumulado, ha) => acumulado + ha, 0);

  const cargas = [];
  const resumen = [];

  for (const producto of productos) {
    const dosis = esPositivo(producto.dosisPorHectarea) ? producto.dosisPorHectarea : null;
    const totalCliente = esPositivo(producto.cantidadTotalCliente) ? producto.cantidadTotalCliente : null;

    let criterio = "SIN_DATOS";
    let totalARepartir = null;

    if (dosis !== null) {
      criterio = "DOSIS";
      totalARepartir = dosis * superficieTotal;
    } else if (totalCliente !== null) {
      criterio = "TOTAL_CLIENTE";
      totalARepartir = totalCliente;
    }

    if (totalARepartir !== null && viajesOrdenados.length > 0) {
      const partes = dividirProporcional(totalARepartir, hectareas);
      partes.forEach((cantidad, indice) => {
        cargas.push({ numeroViaje: viajesOrdenados[indice].numero, productoId: producto.productoId, cantidad });
      });
    }

    const requerido = criterio === "DOSIS" ? redondear(totalARepartir) : null;

    resumen.push({
      productoId: producto.productoId,
      criterio,
      requerido,
      totalCliente,
      // > 0 sobra producto del cliente; < 0 falta. Solo tiene sentido si hay dosis y total
      diferencia: requerido !== null && totalCliente !== null ? redondear(totalCliente - requerido) : null,
      dosisEfectiva: superficieTotal > 0 && totalARepartir !== null ? totalARepartir / superficieTotal : null
    });
  }

  return { cargas, resumen };
};

module.exports = { dividirProporcional, repartirProductos, redondear };

// Campos que se devuelven de los catalogos cuando vienen anidados en otro recurso
// (producto, orden de trabajo).
const CATALOGO_TIPO = { id: true, nombre: true };
const CATALOGO_UNIDAD = { id: true, nombre: true, abreviatura: true };

module.exports = { CATALOGO_TIPO, CATALOGO_UNIDAD };

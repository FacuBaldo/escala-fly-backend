/**
 * Manejador global de errores. Evita respuestas HTML de Express ante un JSON mal formado
 * y garantiza una respuesta JSON cuando un controlador lanza un error no controlado.
 * Express lo reconoce como manejador de errores por recibir cuatro parametros.
 */
const manejarErrores = (error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "El cuerpo de la solicitud no es un JSON valido" });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "El cuerpo de la solicitud es demasiado grande" });
  }

  console.error("Error no controlado:", error);
  return res.status(500).json({ message: "Ocurrio un error inesperado" });
};

module.exports = manejarErrores;

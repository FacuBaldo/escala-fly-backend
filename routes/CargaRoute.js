const express = require("express");
const CargaController = require("../controllers/CargaController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

// Orden del cargador: reparto de los productos de la mezcla entre las cargas del plan
router.get("/ordenes/:id/cargas", verificarToken, permitirRoles("ADMIN", "ENCARGADO", "PILOTO"), CargaController.getCargas);
router.put("/ordenes/:id/cargas", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), CargaController.actualizarCargas);
router.post("/ordenes/:id/cargas/restablecer", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), CargaController.restablecerCargas);

module.exports = router;

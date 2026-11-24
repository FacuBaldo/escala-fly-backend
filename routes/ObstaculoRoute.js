const express = require("express");
const ObstaculoController = require("../controllers/ObstaculoController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

// Obstáculos del lote: los marca el encargado; el piloto y el cliente los ven sobre la ruta de su orden
router.get("/lotes/:loteId/obstaculos", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ObstaculoController.getObstaculosDeLote);
router.post("/lotes/:loteId/obstaculos", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ObstaculoController.createObstaculo);
router.put("/obstaculos/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ObstaculoController.updateObstaculo);
router.delete("/obstaculos/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ObstaculoController.deleteObstaculo);
router.get("/ordenes/:ordenId/obstaculos", verificarToken, permitirRoles("ADMIN", "ENCARGADO", "PILOTO", "CLIENTE"), ObstaculoController.getObstaculosDeOrden);

module.exports = router;

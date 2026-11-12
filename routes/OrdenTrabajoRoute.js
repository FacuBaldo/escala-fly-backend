const express = require("express");
const OrdenTrabajoController = require("../controllers/OrdenTrabajoController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/ordenes", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), OrdenTrabajoController.createOrden);
router.get("/ordenes", verificarToken, permitirRoles("ADMIN", "ENCARGADO", "PILOTO", "CLIENTE"), OrdenTrabajoController.getOrdenes);
router.get("/ordenes/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO", "PILOTO", "CLIENTE"), OrdenTrabajoController.getOrdenById);
router.get("/ordenes/:id/plan", verificarToken, permitirRoles("ADMIN", "ENCARGADO", "PILOTO", "CLIENTE"), OrdenTrabajoController.getPlanByOrdenId);
router.patch("/ordenes/:id/estado", verificarToken, permitirRoles("ADMIN", "ENCARGADO", "PILOTO"), OrdenTrabajoController.cambiarEstadoOrden);
router.patch("/ordenes/:id/piloto", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), OrdenTrabajoController.asignarPilotoOrden);
router.patch("/ordenes/:id/cliente", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), OrdenTrabajoController.asignarClienteOrden);
router.put("/ordenes/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), OrdenTrabajoController.updateOrden);
router.post("/ordenes/:id/plan/regenerar", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), OrdenTrabajoController.regenerarPlan);
router.delete("/ordenes/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), OrdenTrabajoController.deleteOrden);

module.exports = router;

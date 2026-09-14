const express = require("express");
const LoteController = require("../controllers/LoteController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/lotes", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), LoteController.createLote);
router.get("/lotes", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), LoteController.getLotes);
router.get("/lotes/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), LoteController.getLoteById);
router.put("/lotes/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), LoteController.updateLote);
router.patch("/lotes/:id/baja", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), LoteController.bajaLote);
router.delete("/lotes/:id", verificarToken, permitirRoles("ADMIN"), LoteController.deleteLote);

module.exports = router;

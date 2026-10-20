const express = require("express");
const PistaController = require("../controllers/PistaController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/pistas", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), PistaController.createPista);
router.get("/pistas", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), PistaController.getPistas);
router.get("/pistas/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), PistaController.getPistaById);
router.put("/pistas/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), PistaController.updatePista);
router.patch("/pistas/:id/baja", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), PistaController.bajaPista);
router.delete("/pistas/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), PistaController.deletePista);

module.exports = router;

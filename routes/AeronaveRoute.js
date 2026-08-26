const express = require("express");
const AeronaveController = require("../controllers/AeronaveController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/aeronaves", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), AeronaveController.createAeronave);
router.get("/aeronaves", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), AeronaveController.getAeronaves);
router.get("/aeronaves/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), AeronaveController.getAeronaveById);
router.put("/aeronaves/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), AeronaveController.updateAeronave);
router.delete("/aeronaves/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), AeronaveController.deleteAeronave);

module.exports = router;

const express = require("express");
const AeronaveController = require("../controllers/AeronaveController");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/aeronaves", verificarToken, AeronaveController.createAeronave);
router.get("/aeronaves", verificarToken, AeronaveController.getAeronaves);
router.get("/aeronaves/:id", verificarToken, AeronaveController.getAeronaveById);
router.put("/aeronaves/:id", verificarToken, AeronaveController.updateAeronave);
router.delete("/aeronaves/:id", verificarToken, AeronaveController.deleteAeronave);

module.exports = router;

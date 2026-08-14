const express = require("express");
const CampoController = require("../controllers/CampoController");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/campos", verificarToken, CampoController.createCampo);
router.get("/campos", verificarToken, CampoController.getCampos);
router.get("/campos/:id", verificarToken, CampoController.getCampoById);
router.put("/campos/:id", verificarToken, CampoController.updateCampo);
router.delete("/campos/:id", verificarToken, CampoController.deleteCampo);

module.exports = router;

const express = require("express");
const CampoController = require("../controllers/CampoController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/campos", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), CampoController.createCampo);
router.get("/campos", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), CampoController.getCampos);
router.get("/campos/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), CampoController.getCampoById);
router.put("/campos/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), CampoController.updateCampo);
router.delete("/campos/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), CampoController.deleteCampo);

module.exports = router;

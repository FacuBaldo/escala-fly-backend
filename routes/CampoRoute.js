const express = require("express");
const CampoController = require("../controllers/CampoController");
const verifyToken = require("../middlewares/verifyToken");

const router = express.Router();

router.post("/campos", verifyToken, CampoController.createCampo);
router.get("/campos", verifyToken, CampoController.getCampos);
router.get("/campos/:id", verifyToken, CampoController.getCampoById);
router.put("/campos/:id", verifyToken, CampoController.updateCampo);
router.delete("/campos/:id", verifyToken, CampoController.deleteCampo);

module.exports = router;

const express = require("express");
const AutenticacionController = require("../controllers/AutenticacionController");
const limitarIntentosLogin = require("../middlewares/limitarIntentosLogin");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/iniciar-sesion", limitarIntentosLogin, AutenticacionController.iniciarSesion);
router.get("/me", verificarToken, AutenticacionController.getSesionActual);

module.exports = router;

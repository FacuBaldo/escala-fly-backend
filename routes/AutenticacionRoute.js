const express = require("express");
const AutenticacionController = require("../controllers/AutenticacionController");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/iniciar-sesion", AutenticacionController.iniciarSesion);
router.get("/me", verificarToken, AutenticacionController.getSesionActual);

module.exports = router;

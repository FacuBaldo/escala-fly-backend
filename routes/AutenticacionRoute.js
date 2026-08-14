const express = require("express");
const AutenticacionController = require("../controllers/AutenticacionController");

const router = express.Router();

router.post("/iniciar-sesion", AutenticacionController.iniciarSesion);

module.exports = router;

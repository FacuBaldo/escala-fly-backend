const express = require("express");
const UsuarioController = require("../controllers/UsuarioController");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/usuarios", UsuarioController.createUsuario);
router.get("/usuarios", verificarToken, UsuarioController.getUsuarios);
router.get("/usuarios/:id", verificarToken, UsuarioController.getUsuarioById);
router.put("/usuarios/:id", verificarToken, UsuarioController.updateUsuario);
router.delete("/usuarios/:id", verificarToken, UsuarioController.deleteUsuario);

module.exports = router;

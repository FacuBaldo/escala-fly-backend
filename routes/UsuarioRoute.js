const express = require("express");
const UsuarioController = require("../controllers/UsuarioController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/usuarios", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), UsuarioController.createUsuario);
router.get("/usuarios", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), UsuarioController.getUsuarios);
router.get("/usuarios/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), UsuarioController.getUsuarioById);
router.put("/usuarios/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), UsuarioController.updateUsuario);
router.delete("/usuarios/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), UsuarioController.deleteUsuario);

module.exports = router;

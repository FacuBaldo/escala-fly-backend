const express = require("express");
const EmpresaController = require("../controllers/EmpresaController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/empresas", verificarToken, permitirRoles("ADMIN"), EmpresaController.createEmpresa);
router.get("/empresas", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), EmpresaController.getEmpresas);
router.get("/empresas/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), EmpresaController.getEmpresaById);
router.put("/empresas/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), EmpresaController.updateEmpresa);
router.delete("/empresas/:id", verificarToken, permitirRoles("ADMIN"), EmpresaController.deleteEmpresa);

module.exports = router;

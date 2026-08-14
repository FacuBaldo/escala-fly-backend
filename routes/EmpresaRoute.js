const express = require("express");
const EmpresaController = require("../controllers/EmpresaController");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/empresas", verificarToken, EmpresaController.createEmpresa);
router.get("/empresas", verificarToken, EmpresaController.getEmpresas);
router.get("/empresas/:id", verificarToken, EmpresaController.getEmpresaById);
router.put("/empresas/:id", verificarToken, EmpresaController.updateEmpresa);
router.delete("/empresas/:id", verificarToken, EmpresaController.deleteEmpresa);

module.exports = router;

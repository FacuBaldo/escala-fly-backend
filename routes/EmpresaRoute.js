const express = require("express");
const EmpresaController = require("../controllers/EmpresaController");
const verifyToken = require("../middlewares/verifyToken");

const router = express.Router();

router.post("/empresas", verifyToken, EmpresaController.createEmpresa);
router.get("/empresas", verifyToken, EmpresaController.getEmpresas);
router.get("/empresas/:id", verifyToken, EmpresaController.getEmpresaById);
router.put("/empresas/:id", verifyToken, EmpresaController.updateEmpresa);
router.delete("/empresas/:id", verifyToken, EmpresaController.deleteEmpresa);

module.exports = router;

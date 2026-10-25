const express = require("express");
const { tiposProducto, unidadesMedida } = require("../controllers/CatalogoController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

// El ENCARGADO lee los catalogos para cargar productos; solo el ADMIN los modifica
router.get("/tipos-producto", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), tiposProducto.listar);
router.post("/tipos-producto", verificarToken, permitirRoles("ADMIN"), tiposProducto.crear);
router.put("/tipos-producto/:id", verificarToken, permitirRoles("ADMIN"), tiposProducto.actualizar);
router.delete("/tipos-producto/:id", verificarToken, permitirRoles("ADMIN"), tiposProducto.eliminar);

router.get("/unidades-medida", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), unidadesMedida.listar);
router.post("/unidades-medida", verificarToken, permitirRoles("ADMIN"), unidadesMedida.crear);
router.put("/unidades-medida/:id", verificarToken, permitirRoles("ADMIN"), unidadesMedida.actualizar);
router.delete("/unidades-medida/:id", verificarToken, permitirRoles("ADMIN"), unidadesMedida.eliminar);

module.exports = router;

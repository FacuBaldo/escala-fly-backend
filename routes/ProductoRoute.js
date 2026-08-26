const express = require("express");
const ProductoController = require("../controllers/ProductoController");
const permitirRoles = require("../middlewares/permitirRoles");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/productos", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ProductoController.createProducto);
router.get("/productos", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ProductoController.getProductos);
router.get("/productos/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ProductoController.getProductoById);
router.put("/productos/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ProductoController.updateProducto);
router.delete("/productos/:id", verificarToken, permitirRoles("ADMIN", "ENCARGADO"), ProductoController.deleteProducto);

module.exports = router;

const express = require("express");
const ProductoController = require("../controllers/ProductoController");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();

router.post("/productos", verificarToken, ProductoController.createProducto);
router.get("/productos", verificarToken, ProductoController.getProductos);
router.get("/productos/:id", verificarToken, ProductoController.getProductoById);
router.put("/productos/:id", verificarToken, ProductoController.updateProducto);
router.delete("/productos/:id", verificarToken, ProductoController.deleteProducto);

module.exports = router;

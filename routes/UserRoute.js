const express = require("express");
const UserController = require("../controllers/UserController");
const verifyToken = require("../middlewares/verifyToken");

const router = express.Router();

router.post("/users", UserController.createUser);
router.get("/users", verifyToken, UserController.getUsers);
router.get("/users/:id", verifyToken, UserController.getUserById);
router.put("/users/:id", verifyToken, UserController.updateUser);
router.delete("/users/:id", verifyToken, UserController.deleteUser);

module.exports = router;

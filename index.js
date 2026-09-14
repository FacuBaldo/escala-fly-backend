require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const autenticacionRoutes = require("./routes/AutenticacionRoute");
const usuarioRoutes = require("./routes/UsuarioRoute");
const empresaRoutes = require("./routes/EmpresaRoute");
const campoRoutes = require("./routes/CampoRoute");
const productoRoutes = require("./routes/ProductoRoute");
const aeronaveRoutes = require("./routes/AeronaveRoute");
const loteRoutes = require("./routes/LoteRoute");
const manejarErrores = require("./middlewares/manejarErrores");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(morgan("dev"));

app.use("/api/autenticacion", autenticacionRoutes);
app.use("/api", usuarioRoutes);
app.use("/api", empresaRoutes);
app.use("/api", campoRoutes);
app.use("/api", productoRoutes);
app.use("/api", aeronaveRoutes);
app.use("/api", loteRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Server running successfully"
  });
});

app.use((req, res) => {
  res.status(404).json({ message: "Recurso no encontrado" });
});

app.use(manejarErrores);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;

require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const authRoutes = require("./routes/AuthRoute");
const userRoutes = require("./routes/UserRoute");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api", userRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Server running successfully"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

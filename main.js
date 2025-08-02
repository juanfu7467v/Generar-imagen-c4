const express = require("express");
const cors = require("cors");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

app.get("/reniec-c4", async (req, res) => {
  const { dni, nombre, apellido } = req.query;

  // ⚠️ Valida los parámetros básicos
  if (!dni || !nombre || !apellido) {
    return res.status(400).json({ error: "Faltan datos: dni, nombre, apellido" });
  }

  // 📄 Crear imagen base tipo C4
  const canvas = createCanvas(600, 300);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 600, 300);

  ctx.fillStyle = "#000000";
  ctx.font = "20px Arial";
  ctx.fillText(`Constancia C4 - RENIEC`, 180, 40);
  ctx.fillText(`DNI: ${dni}`, 50, 100);
  ctx.fillText(`Nombres: ${nombre}`, 50, 140);
  ctx.fillText(`Apellidos: ${apellido}`, 50, 180);
  ctx.fillText(`Fecha: ${new Date().toLocaleDateString()}`, 50, 220);

  const imageName = `c4-${dni}-${Date.now()}.png`;
  const imagePath = path.join(__dirname, "public", imageName);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(imagePath, buffer);

  const url = `https://tu-proyecto-production.up.railway.app/public/${imageName}`;
  return res.json({ success: true, image: url });
});

// Carpeta pública para servir imágenes
app.use("/public", express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});

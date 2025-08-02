const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

app.get("/generar-ficha", async (req, res) => {
  const { dni } = req.query;
  if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

  try {
    const response = await axios.get(`https://poxy-production.up.railway.app/reniec?dni=${dni}`);
    const data = response.data?.result;
    if (!data) return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });

    const imagen = new Jimp(800, 1100, "#ffffff");
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

    // Título
    imagen.print(font, 10, 10, "FICHA RENIEC C4 - DNI: " + dni);

    // Mostrar datos (hasta 45 campos para mayor detalle)
    const campos = Object.entries(data);
    let y = 40;
    for (const [key, value] of campos) {
      let texto = `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`;
      imagen.print(font, 10, y, texto);
      y += 22;
    }

    // Guardar imagen en carpeta /public
    const nombreArchivo = `${uuidv4()}.png`;
    const rutaImagen = path.join(PUBLIC_DIR, nombreArchivo);
    await imagen.writeAsync(rutaImagen);

    const url = `${req.protocol}://${req.get("host")}/public/${nombreArchivo}`;
    res.json({ message: "Imagen generada", url });
  } catch (error) {
    res.status(500).json({ error: "Error al generar la ficha", detalle: error.message });
  }
});

app.use("/public", express.static(PUBLIC_DIR));

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

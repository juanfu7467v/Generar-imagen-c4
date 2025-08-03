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

const LOGO_RENEC_PATH = path.join(__dirname, "logo_reniec.png");
const APP_ICON_URL = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjZtu4kKYCxbIje6wHJJKqAFRhmc4D3KzX6eW9I5Jr-PaWOm1kl2OMGJ4MUFvdUDnpR6MOs8Ffsem2fwiIXHgPNINo-8vLbVCgqgCJ7tEj-6lykSjBpxb9HyNtHZAlkfVkR9q7i9xV1cqPAIhy6B_Xifh4yAUQUlG4doZKk41YwDmkp7ivabW8-GV5oSt-G/s511/1000016813.png";

// Función para generar marcas de agua
const generarMarcaDeAgua = async (imagen) => {
  const marcaAgua = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
  const fontWatermark = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const text = "RENIEC";

  for (let i = 0; i < imagen.bitmap.width; i += 200) {
    for (let j = 0; j < imagen.bitmap.height; j += 100) {
      const angle = Math.random() * 30 - 15;
      const textImage = new Jimp(100, 50, 0x00000000);
      textImage.print(fontWatermark, 0, 0, text);
      textImage.rotate(angle);
      marcaAgua.composite(textImage, i, j, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 0.1,
        opacityDest: 1
      });
    }
  }
  return marcaAgua;
};

app.get("/generar-ficha", async (req, res) => {
  const { dni } = req.query;
  if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

  try {
    const response = await axios.get(`https://poxy-production.up.railway.app/reniec?dni=${dni}`);
    const data = response.data?.result;
    if (!data) return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });

    const imagen = new Jimp(1000, 1500, "#f0f2f5"); // Tamaño y color de fondo
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

    // Superponer la marca de agua
    const marcaAgua = await generarMarcaDeAgua(imagen);
    imagen.composite(marcaAgua, 0, 0);

    // Título principal
    imagen.print(fontTitle, 250, 50, "Resultado - consulta pe ");

    // Logo de la RENIEC
    if (fs.existsSync(LOGO_RENEC_PATH)) {
      const logoReniec = await Jimp.read(LOGO_RENEC_PATH);
      logoReniec.resize(Jimp.AUTO, 80);
      imagen.composite(logoReniec, 50, 40);
    }

    // Icono de la aplicación
    const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
    const appIcon = await Jimp.read(iconBuffer);
    appIcon.resize(100, Jimp.AUTO);
    imagen.composite(appIcon, imagen.bitmap.width - 150, 40);

    // Foto del DNI
    if (data.imagenes?.foto) {
      const bufferFoto = Buffer.from(data.imagenes.foto, 'base64');
      const foto = await Jimp.read(bufferFoto);
      foto.resize(250, 300); // Tamaño de foto más grande
      imagen.composite(foto, 700, 150);
    }

    // Datos personales
    let y = 150;
    const camposPersonales = [
      { label: "DNI", value: data.nuDni },
      { label: "Nombres completos", value: `${data.preNombres} ${data.apePaterno} ${data.apeMaterno}` },
      { label: "Fecha de Nacimiento", value: data.feNacimiento },
      { label: "Sexo", value: data.sexo },
      { label: "Estado Civil", value: data.estadoCivil },
      { label: "Estatura", value: `${data.estatura} cm` },
      { label: "Grado de Instrucción", value: data.gradoInstruccion },
      { label: "Donación de Órganos", value: data.donaOrganos },
      { label: "Restricción", value: data.deRestriccion || "NINGUNA" },
    ];
    imagen.print(fontHeading, 50, y, "Datos Personales");
    y += 40;
    for (const campo of camposPersonales) {
      imagen.print(fontBold, 50, y, `${campo.label}:`);
      imagen.print(font, 350, y, `${campo.value || "-"}`);
      y += 30;
    }

    y += 30; // Espacio entre secciones

    // Datos de la dirección
    const camposDireccion = [
      { label: "Dirección", value: data.desDireccion },
      { label: "Departamento", value: data.departamento },
      { label: "Provincia", value: data.provincia },
      { label: "Distrito", value: data.distrito },
    ];
    imagen.print(fontHeading, 50, y, "Datos de Dirección");
    y += 40;
    for (const campo of camposDireccion) {
      imagen.print(fontBold, 50, y, `${campo.label}:`);
      imagen.print(font, 350, y, `${campo.value || "-"}`);
      y += 30;
    }

    y += 30; // Espacio entre secciones

    // Otros datos
    const camposOtros = [
      { label: "Fecha de Emisión", value: data.feEmision },
      { label: "Fecha de Inscripción", value: data.feInscripcion },
      { label: "Fecha de Caducidad", value: data.feCaducidad },
      { label: "Nombre del Padre", value: data.nomPadre },
      { label: "Nombre de la Madre", value: data.nomMadre },
    ];
    imagen.print(fontHeading, 50, y, "Información Adicional");
    y += 40;
    for (const campo of camposOtros) {
      imagen.print(fontBold, 50, y, `${campo.label}:`);
      imagen.print(font, 350, y, `${campo.value || "-"}`);
      y += 30;
    }

    // Guardar imagen
    const nombreArchivo = `${uuidv4()}.png`;
    const rutaImagen = path.join(PUBLIC_DIR, nombreArchivo);
    await imagen.writeAsync(rutaImagen);

    const url = `${req.protocol}://${req.get("host")}/public/${nombreArchivo}`;
    res.json({ message: "Ficha generada", url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al generar la ficha", detalle: error.message });
  }
});

app.use("/public", express.static(PUBLIC_DIR));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

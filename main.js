manteniendo su funcionamiento actual sin canvas por qué lo estoy haciendo en raliway de todo el archivo podrías hacer que el diseño de la imagen sea muy idéntica a una ficha RENIEC con sus marcas de agua logo de RENIEC todos los parecidos posibles y me das el archivo modidicados con el diseño completopara copiar y pegar porfa 


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

// Cargar la imagen del logo de la RENIEC (asegúrate de tenerla en el mismo directorio)
const LOGO_RENEC_PATH = path.join(__dirname, "logo_reniec.png");

// Función para generar marcas de agua
const generarMarcaDeAgua = async (imagen) => {
  const marcaAgua = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
  const fontWatermark = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const text = "RENIEC";

  for (let i = 0; i < imagen.bitmap.width; i += 200) {
    for (let j = 0; j < imagen.bitmap.height; j += 100) {
      const angle = Math.random() * 30 - 15; // Ángulo aleatorio
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

    const imagen = new Jimp(900, 1300, "#ffffff");
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

    // Superponer la marca de agua
    const marcaAgua = await generarMarcaDeAgua(imagen);
    imagen.composite(marcaAgua, 0, 0);

    // Título
    imagen.print(fontTitle, 260, 20, "RESULTADOS - CONSULTA PE APK");

    // Logo de la RENIEC
    if (fs.existsSync(LOGO_RENEC_PATH)) {
      const logoReniec = await Jimp.read(LOGO_RENEC_PATH);
      logoReniec.resize(Jimp.AUTO, 60);
      imagen.composite(logoReniec, 30, 20);
    }

    // Foto del DNI
    if (data.imagenes?.foto) {
      const bufferFoto = Buffer.from(data.imagenes.foto, 'base64');
      const foto = await Jimp.read(bufferFoto);
      foto.resize(180, 220);
      imagen.composite(foto, 680, 100);
    }

    // Campos principales
    const campos = [
      { label: "DNI", value: data.nuDni },
      { label: "Nombres completos", value: `${data.preNombres} ${data.apePaterno} ${data.apeMaterno}` },
      { label: "Apellido Paterno", value: data.apePaterno },
      { label: "Apellido Materno", value: data.apeMaterno },
      { label: "Pre Nombres", value: data.preNombres },
      { label: "Sexo", value: data.sexo },
      { label: "Fecha de Nacimiento", value: data.feNacimiento },
      { label: "Estado Civil", value: data.estadoCivil },
      { label: "Grado de Instrucción", value: data.gradoInstruccion },
      { label: "Estatura", value: `${data.estatura} cm` },
      { label: "Fecha de Emisión", value: data.feEmision },
      { label: "Fecha de Inscripción", value: data.feInscripcion },
      { label: "Fecha de Caducidad", value: data.feCaducidad },
      { label: "Donación de Órganos", value: data.donaOrganos },
      { label: "Restricción", value: data.deRestriccion || "NINGUNA" },
      { label: "Nombre del Padre", value: data.nomPadre },
      { label: "Nro. Doc. del Padre", value: data.nuDocPadre },
      { label: "Nombre de la Madre", value: data.nomMadre },
      { label: "Nro. Doc. de la Madre", value: data.nuDocMadre },
      { label: "Nombre Declarante", value: data.nomDeclarante },
      { label: "Vínculo Declarante", value: data.vinculoDeclarante },
      { label: "Dirección", value: data.desDireccion },
      { label: "Departamento", value: data.departamento },
      { label: "Provincia", value: data.provincia },
      { label: "Distrito", value: data.distrito },
      { label: "Código Postal", value: data.ubicacion?.codigo_postal },
      { label: "Ubigeo (RENIEC)", value: data.ubicacion?.ubigeo_reniec },
      { label: "Ubigeo (SUNAT/INEI)", value: data.ubicacion?.ubigeo_inei },
      { label: "Dígito Verificación", value: data.digitoVerificacion },
    ];

    // Impresión de datos
    let y = 100;
    for (const campo of campos) {
      imagen.print(fontBold, 20, y, `${campo.label}:`);
      imagen.print(font, 280, y, `${campo.value || "-"}`);
      y += 30;
      if (y > 1200) break;
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

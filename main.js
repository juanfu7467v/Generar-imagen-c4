const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ASSETS_DIR = path.join(__dirname, "assets");

// Crear directorios si no existen
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR);

app.get("/generar-ficha", async (req, res) => {
  const { dni } = req.query;
  if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

  try {
    // 1. Obtener datos del DNI
    const response = await axios.get(`https://poxy-production.up.railway.app/reniec?dni=${dni}`);
    const data = response.data?.result;
    if (!data) return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });

    // 2. Cargar recursos gráficos (logo y marca de agua)
    const logoReniec = await Jimp.read(path.join(ASSETS_DIR, "logo-reniec.png"));
    const watermark = await Jimp.read(path.join(ASSETS_DIR, "watermark.png"));

    // 3. Cargar fuentes
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const fontFecha = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK); // Fuente para la fecha de emisión

    // 4. Crear la imagen base
    const imagen = new Jimp(900, 1300, "#ffffff");

    // 5. Aplicar marca de agua repetida
    for (let x = 0; x < imagen.bitmap.width; x += watermark.bitmap.width) {
      for (let y = 0; y < imagen.bitmap.height; y += watermark.bitmap.height) {
        imagen.composite(watermark.opacity(0.15), x, y);
      }
    }

    // 6. Superponer el logo de RENIEC
    logoReniec.resize(100, 100);
    imagen.composite(logoReniec, 30, 20);

    // 7. Título de la ficha
    imagen.print(fontTitle, 260, 40, "Resultado - Consulta pe apk");

    // 8. Foto del DNI
    if (data.imagenes?.foto) {
      const bufferFoto = Buffer.from(data.imagenes.foto, 'base64');
      const foto = await Jimp.read(bufferFoto);
      foto.resize(180, 220);
      imagen.composite(foto, 680, 100); // posición foto
    }

    // 9. Campos principales
    const campos = [
      { label: "DNI", value: data.nuDni },
      { label: "Apellido Paterno", value: data.apePaterno },
      { label: "Apellido Materno", value: data.apeMaterno },
      { label: "Pre Nombres", value: data.preNombres },
      { label: "Nombres Completos", value: `${data.preNombres} ${data.apePaterno} ${data.apeMaterno}` },
      { label: "Sexo", value: data.sexo },
      { label: "Fecha de Nacimiento", value: data.feNacimiento },
      { label: "Estado Civil", value: data.estadoCivil },
      { label: "Grado de Instrucción", value: data.gradoInstruccion },
      { label: "Estatura", value: `${data.estatura} cm` },
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

    // 10. Impresión de datos
    let y = 130;
    for (const campo of campos) {
      imagen.print(fontBold, 40, y, `${campo.label}:`);
      imagen.print(font, 300, y, `${campo.value || "-"}`);
      y += 35;
      if (y > 1200) break;
    }
    
    // 11. Fechas al final de la ficha, con formato especial si es necesario
    imagen.print(fontFecha, 40, y, `Fecha de Emisión: ${data.feEmision || "-"}`);
    y += 35;
    imagen.print(fontFecha, 40, y, `Fecha de Inscripción: ${data.feInscripcion || "-"}`);
    y += 35;
    imagen.print(fontFecha, 40, y, `Fecha de Caducidad: ${data.feCaducidad || "-"}`);

    // 12. Guardar imagen
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

// Servir archivos estáticos
app.use("/public", express.static(PUBLIC_DIR));
app.use("/assets", express.static(ASSETS_DIR));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

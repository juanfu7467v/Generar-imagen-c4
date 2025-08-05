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

// Ruta del logo de RENIEC y del icono de la app (ajusta las rutas si es necesario)
const LOGO_RENEC_PATH = path.join(__dirname, "logo_reniec.png"); // Asegúrate de tener este archivo
const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";

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

   const imagen = new Jimp(1080, 1920, "#F4F4F4"); // Fondo gris claro para un aspecto profesional
   const marginHorizontal = 50;
   const contentWidth = imagen.bitmap.width - 2 * marginHorizontal;
   let y = 50;

   const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
   const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
   const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
   const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

   // Superponer la marca de agua
   const marcaAgua = await generarMarcaDeAgua(imagen);
   imagen.composite(marcaAgua, 0, 0);

   // Icono principal (reemplaza el título)
   try {
     const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
     const mainIcon = await Jimp.read(iconBuffer);
     mainIcon.resize(contentWidth * 0.4, Jimp.AUTO); // Ajustar tamaño del icono
     const iconX = marginHorizontal + (contentWidth * 0.6) / 2 - mainIcon.bitmap.width / 2;
     imagen.composite(mainIcon, iconX, y);
     y += mainIcon.bitmap.height + 30;
   } catch (error) {
     console.error("Error al cargar el icono:", error);
     // Si falla la carga del icono, mostrar un texto alternativo
     imagen.print(fontTitle, marginHorizontal, y, "Consulta Ciudadana");
     y += 70;
   }


   // Foto del DNI
   if (data.imagenes?.foto) {
     const bufferFoto = Buffer.from(data.imagenes.foto, 'base64');
     const foto = await Jimp.read(bufferFoto);
     const fotoWidth = 350;
     const fotoHeight = 400;
     foto.resize(fotoWidth, fotoHeight);
     imagen.composite(foto, imagen.bitmap.width - marginHorizontal - fotoWidth - 30, 150);
   }

   // Datos Personales
   imagen.print(fontHeading, marginHorizontal, y, "Datos Personales");
   y += 40;
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
   for (const campo of camposPersonales) {
     imagen.print(fontBold, marginHorizontal, y, `${campo.label}:`);
     imagen.print(font, marginHorizontal + 350, y, `${campo.value || "-"}`);
     y += 35;
   }

   y += 30;

   // Datos de Dirección
   imagen.print(fontHeading, marginHorizontal, y, "Datos de Dirección");
   y += 40;
   const camposDireccion = [
     { label: "Dirección", value: data.desDireccion },
     { label: "Departamento", value: data.departamento },
     { label: "Provincia", value: data.provincia },
     { label: "Distrito", value: data.distrito },
   ];
   for (const campo of camposDireccion) {
     imagen.print(fontBold, marginHorizontal, y, `${campo.label}:`);
     imagen.print(font, marginHorizontal + 350, y, `${campo.value || "-"}`);
     y += 35;
   }

   y += 30;

   // Información Adicional
   imagen.print(fontHeading, marginHorizontal, y, "Información Adicional");
   y += 40;
   const camposOtros = [
     { label: "Fecha de Emisión", value: data.feEmision },
     { label: "Fecha de Inscripción", value: data.feInscripcion },
     { label: "Fecha de Caducidad", value: data.feCaducidad },
     { label: "Nombre del Padre", value: data.nomPadre },
     { label: "Nombre de la Madre", value: data.nomMadre },
   ];
   for (const campo of camposOtros) {
     imagen.print(fontBold, marginHorizontal, y, `${campo.label}:`);
     imagen.print(font, marginHorizontal + 350, y, `${campo.value || "-"}`);
     y += 35;
   }

   y = imagen.bitmap.height - 120; // Ajustar la posición del pie de página

   // Pie de página: Fuente y descargo de responsabilidad
   imagen.print(
     font,
     marginHorizontal,
     y,
     "Fuente: www.socialcreator.com/consultapeapk"
   );
   imagen.print(
     font,
     marginHorizontal,
     y + 30,
     "Esta imagen es solo informativa. No representa un documento oficial ni tiene validez legal."
   );

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

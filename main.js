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

// Función para imprimir texto que se ajusta a una nueva línea si es demasiado largo
const printWrappedText = (image, font, x, y, maxWidth, text, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (const word of words) {
        const testLine = line.length === 0 ? word : line + ' ' + word;
        const testWidth = Jimp.measureText(font, testLine);
        if (testWidth > maxWidth) {
            image.print(font, x, currentY, line.trim());
            line = word + ' ';
            currentY += lineHeight;
        } else {
            line = testLine + ' ';
        }
    }
    image.print(font, x, currentY, line.trim());
    return currentY + lineHeight;
};

app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

    try {
        const response = await axios.get(`https://poxy-production.up.railway.app/reniec?dni=${dni}`);
        const data = response.data?.result;
        if (!data) return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });

        const imagen = new Jimp(1080, 1920, "#EFEFEF"); // Nuevo fondo más claro
        const marginHorizontal = 50;
        const contentWidth = imagen.bitmap.width - 2 * marginHorizontal;
        const textColumnWidth = contentWidth - 400; // Espacio para el texto, dejando espacio para la foto
        const lineHeight = 50; // Aumento del espaciado entre líneas
        let y = 50;

        const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
        const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
        const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK); // Fuente un poco más grande
        const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

        // Superponer la marca de agua
        const marcaAgua = await generarMarcaDeAgua(imagen);
        imagen.composite(marcaAgua, 0, 0);

        // Icono principal (reemplaza el título)
        try {
            const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
            const mainIcon = await Jimp.read(iconBuffer);
            mainIcon.resize(300, Jimp.AUTO);
            const iconX = (imagen.bitmap.width - mainIcon.bitmap.width) / 2;
            imagen.composite(mainIcon, iconX, y);
            y += mainIcon.bitmap.height + 40;
        } catch (error) {
            console.error("Error al cargar el icono:", error);
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
            imagen.composite(foto, imagen.bitmap.width - marginHorizontal - fotoWidth, 120);
        }

        // Función auxiliar para imprimir campos con formato "Label: Value"
        const printField = (label, value) => {
            const labelX = marginHorizontal;
            const valueX = labelX + 300;
            const maxWidth = textColumnWidth - (valueX - labelX);

            imagen.print(fontBold, labelX, y, `${label}:`);
            const newY = printWrappedText(imagen, font, valueX, y, maxWidth, `${value || "-"}`, lineHeight);
            y = newY;
        };

        // --- Datos Personales ---
        imagen.print(fontHeading, marginHorizontal, y, "Datos Personales");
        y += 50;
        printField("DNI", data.nuDni);
        printField("Primer Apellido", data.apePaterno);
        printField("Segundo Apellido", data.apeMaterno);
        printField("Ap. Casada", data.apCasada || "-");
        printField("Prenombres", data.preNombres);
        printField("Nacimiento", data.feNacimiento);
        printField("Sexo", data.sexo);
        printField("Estado Civil", data.estadoCivil);
        printField("Estatura", `${data.estatura || "-"} cm`);
        printField("Grado de Instrucción", data.gradoInstruccion);
        printField("Restricción", data.deRestriccion || "NINGUNA");
        printField("Donación de Órganos", data.donaOrganos);

        y += 30;

        // --- Datos de Dirección ---
        imagen.print(fontHeading, marginHorizontal, y, "Datos de Dirección");
        y += 50;
        printField("Dirección", data.desDireccion);
        printField("Departamento", data.depaDireccion);
        printField("Provincia", data.provDireccion);
        printField("Distrito", data.distDireccion);

        y += 30;

        // --- Información Adicional ---
        imagen.print(fontHeading, marginHorizontal, y, "Información Adicional");
        y += 50;
        printField("Fecha de Inscripción", data.feInscripcion);
        printField("Fecha de Emisión", data.feEmision);
        printField("Fecha de Caducidad", data.feCaducidad);
        printField("Fecha de Fallecimiento", data.feFallecimiento || "-");
        printField("Nombre del Padre", data.nomPadre);
        printField("Nombre de la Madre", data.nomMadre);

        y += 30;

        // --- Ubicación ---
        imagen.print(fontHeading, marginHorizontal, y, "Ubicación");
        y += 50;
        printField("Ubigeo Reniec", data.ubicacion?.ubigeo_reniec);
        printField("Ubigeo INEI", data.ubicacion?.ubigeo_inei);
        printField("Ubigeo Sunat", data.ubicacion?.ubigeo_sunat);
        printField("Código Postal", data.ubicacion?.codigo_postal);

        y += 30;

        // --- Otros Datos ---
        imagen.print(fontHeading, marginHorizontal, y, "Otros Datos");
        y += 50;
        printField("País", data.pais || "-");
        printField("Grupo de Votación", data.gpVotacion || "-");
        printField("Teléfono", data.telefono || "-");
        printField("Email", data.email || "-");
        printField("Multas Electorales", data.multasElectorales || "-");
        printField("Multa Admin", data.multaAdmin || "-");
        printField("Fecha de Actualización", data.feActualizacion || "-");
        printField("Cancelación", data.cancelacion || "-");

        // Pie de página
        y = imagen.bitmap.height - 100;
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

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

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";

const generarMarcaDeAgua = async (imagen) => {
    const marcaAgua = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
    const fontWatermark = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
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

        const imagen = new Jimp(1080, 1920, "#1F325E"); // Fondo azul oscuro
        const marginHorizontal = 50;
        const textColumnLeft = marginHorizontal;
        const textColumnRight = imagen.bitmap.width / 2 + 50; // Posición de la segunda columna
        const columnWidth = imagen.bitmap.width / 2 - marginHorizontal * 1.5;
        const lineHeight = 50;
        let yLeft = 50;
        let yRight = 50;

        const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
        const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        const fontHeadingLight = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK); // Para fondo claro

        // Superponer la marca de agua
        const marcaAgua = await generarMarcaDeAgua(imagen);
        imagen.composite(marcaAgua, 0, 0);

        // Icono principal
        try {
            const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
            const mainIcon = await Jimp.read(iconBuffer);
            mainIcon.resize(300, Jimp.AUTO);
            const iconX = (imagen.bitmap.width - mainIcon.bitmap.width) / 2;
            imagen.composite(mainIcon, iconX, yLeft);
            yLeft += mainIcon.bitmap.height + 40;
        } catch (error) {
            console.error("Error al cargar el icono:", error);
            imagen.print(fontTitle, marginHorizontal, yLeft, "Consulta Ciudadana");
            yLeft += 70;
        }

        // Foto del DNI
        let fotoY = yLeft;
        if (data.imagenes?.foto) {
            const bufferFoto = Buffer.from(data.imagenes.foto, 'base64');
            const foto = await Jimp.read(bufferFoto);
            const fotoWidth = 350;
            const fotoHeight = 400;
            foto.resize(fotoWidth, fotoHeight);
            const fotoX = imagen.bitmap.width - marginHorizontal - fotoWidth;
            imagen.composite(foto, fotoX, yLeft);
            yLeft += fotoHeight + 50;
        }
        
        yRight = yLeft;

        const printField = (label, value, x, y) => {
            const labelX = x;
            const valueX = labelX + 250;
            const maxWidth = columnWidth - 250;
            imagen.print(fontBold, labelX, y, `${label}:`);
            const newY = printWrappedText(imagen, font, valueX, y, maxWidth, `${value || "-"}`, lineHeight);
            return newY;
        };

        // --- Datos Personales (Columna Izquierda) ---
        imagen.print(fontHeading, textColumnLeft, yLeft, "Datos Personales");
        yLeft += 50;
        yLeft = printField("DNI", data.nuDni, textColumnLeft, yLeft);
        yLeft = printField("Primer Apellido", data.apePaterno, textColumnLeft, yLeft);
        yLeft = printField("Segundo Apellido", data.apeMaterno, textColumnLeft, yLeft);
        yLeft = printField("Prenombres", data.preNombres, textColumnLeft, yLeft);
        yLeft = printField("Nacimiento", data.feNacimiento, textColumnLeft, yLeft);
        yLeft = printField("Sexo", data.sexo, textColumnLeft, yLeft);
        yLeft = printField("Estado Civil", data.estadoCivil, textColumnLeft, yLeft);
        yLeft = printField("Estatura", `${data.estatura || "-"} cm`, textColumnLeft, yLeft);
        yLeft = printField("Grado de Instrucción", data.gradoInstruccion, textColumnLeft, yLeft);
        yLeft = printField("Restricción", data.deRestriccion || "NINGUNA", textColumnLeft, yLeft);
        yLeft = printField("Donación de Órganos", data.donaOrganos, textColumnLeft, yLeft);
        yLeft += 30;

        // --- Datos de Dirección (Columna Izquierda) ---
        imagen.print(fontHeading, textColumnLeft, yLeft, "Datos de Dirección");
        yLeft += 50;
        yLeft = printField("Dirección", data.desDireccion, textColumnLeft, yLeft);
        yLeft = printField("Departamento", data.depaDireccion, textColumnLeft, yLeft);
        yLeft = printField("Provincia", data.provDireccion, textColumnLeft, yLeft);
        yLeft = printField("Distrito", data.distDireccion, textColumnLeft, yLeft);
        yLeft += 30;

        // --- Información Adicional (Columna Izquierda) ---
        imagen.print(fontHeading, textColumnLeft, yLeft, "Información Adicional");
        yLeft += 50;
        yLeft = printField("Fecha de Inscripción", data.feInscripcion, textColumnLeft, yLeft);
        yLeft = printField("Fecha de Emisión", data.feEmision, textColumnLeft, yLeft);
        yLeft = printField("Fecha de Caducidad", data.feCaducidad, textColumnLeft, yLeft);
        yLeft = printField("Fecha de Fallecimiento", data.feFallecimiento || "-", textColumnLeft, yLeft);
        yLeft = printField("Nombre del Padre", data.nomPadre, textColumnLeft, yLeft);
        yLeft = printField("Nombre de la Madre", data.nomMadre, textColumnLeft, yLeft);

        // --- Ubicación (Columna Derecha) ---
        let ubicacionY = fotoY + 450;
        imagen.print(fontHeading, textColumnRight, ubicacionY, "Ubicación");
        ubicacionY += 50;
        ubicacionY = printField("Ubigeo Reniec", data.ubicacion?.ubigeo_reniec, textColumnRight, ubicacionY);
        ubicacionY = printField("Ubigeo INEI", data.ubicacion?.ubigeo_inei, textColumnRight, ubicacionY);
        ubicacionY = printField("Ubigeo Sunat", data.ubicacion?.ubigeo_sunat, textColumnRight, ubicacionY);
        ubicacionY = printField("Cód. Postal", data.ubicacion?.codigo_postal, textColumnRight, ubicacionY);
        ubicacionY += 30;
        
        // --- Otros Datos (Columna Derecha) ---
        let otrosDatosY = ubicacionY;
        imagen.print(fontHeading, textColumnRight, otrosDatosY, "Otros Datos");
        otrosDatosY += 50;
        otrosDatosY = printField("País", data.pais || "-", textColumnRight, otrosDatosY);
        otrosDatosY = printField("Grupo de Votación", data.gpVotacion || "-", textColumnRight, otrosDatosY);
        otrosDatosY = printField("Teléfono", data.telefono || "-", textColumnRight, otrosDatosY);
        otrosDatosY = printField("Email", data.email || "-", textColumnRight, otrosDatosY);
        otrosDatosY = printField("Multas Electorales", data.multasElectorales || "-", textColumnRight, otrosDatosY);
        otrosDatosY = printField("Multa Admin", data.multaAdmin || "-", textColumnRight, otrosDatosY);
        otrosDatosY = printField("Fecha de Act.", data.feActualizacion || "-", textColumnRight, otrosDatosY);
        otrosDatosY = printField("Cancelación", data.cancelacion || "-", textColumnRight, otrosDatosY);


        // Pie de página
        let finalY = Math.max(yLeft, otrosDatosY) + 50;
        imagen.print(
            font,
            marginHorizontal,
            finalY,
            "Fuente: www.socialcreator.com/consultapeapk"
        );
        imagen.print(
            font,
            marginHorizontal,
            finalY + 30,
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

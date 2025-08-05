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

        const imagen = new Jimp(1080, 1920, "#003366"); // Fondo azul oscuro
        const marginHorizontal = 50;
        const columnLeftX = marginHorizontal;
        const columnRightX = imagen.bitmap.width / 2 + 50; // Posición de la columna derecha
        const columnWidthLeft = imagen.bitmap.width / 2 - marginHorizontal - 25; // Ancho de la columna izquierda
        const columnWidthRight = imagen.bitmap.width / 2 - marginHorizontal - 25; // Ancho de la columna derecha
        const lineHeight = 50;
        
        let yStartContent = 300; // Posición vertical de inicio para las columnas
        let yLeft = yStartContent; // Posición vertical para la columna izquierda
        let yRight = yStartContent; // Posición vertical para la columna derecha

        // Cargar fuentes en blanco
        const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
        const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

        // Superponer la marca de agua
        const marcaAgua = await generarMarcaDeAgua(imagen);
        imagen.composite(marcaAgua, 0, 0);

        // Icono principal (reemplaza el título)
        try {
            const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
            const mainIcon = await Jimp.read(iconBuffer);
            mainIcon.resize(300, Jimp.AUTO);
            const iconX = (imagen.bitmap.width - mainIcon.bitmap.width) / 2;
            imagen.composite(mainIcon, iconX, 50);
        } catch (error) {
            console.error("Error al cargar el icono:", error);
            imagen.print(fontTitle, marginHorizontal, 50, "Consulta Ciudadana");
        }
        
        // Dibuja una línea separadora vertical
        const separatorX = imagen.bitmap.width / 2;
        const separatorYStart = yStartContent - 50;
        const separatorYEnd = imagen.bitmap.height - 150;
        new Jimp(2, separatorYEnd - separatorYStart, 0xFFFFFFFF, (err, line) => {
            if (!err) imagen.composite(line, separatorX, separatorYStart);
        });
        
        // Foto del DNI (parte superior de la columna derecha)
        if (data.imagenes?.foto) {
            const bufferFoto = Buffer.from(data.imagenes.foto, 'base64');
            const foto = await Jimp.read(bufferFoto);
            const fotoWidth = 350;
            const fotoHeight = 400;
            foto.resize(fotoWidth, fotoHeight);
            const fotoX = columnRightX + (columnWidthRight - fotoWidth) / 2;
            imagen.composite(foto, fotoX, yStartContent);
            yRight += fotoHeight + 40; // Ajusta la posición para el contenido debajo de la foto
        }


        // Función auxiliar para imprimir campos en la columna izquierda
        const printFieldLeft = (label, value) => {
            const labelX = columnLeftX;
            const valueX = labelX + 250;
            const maxWidth = columnWidthLeft - (valueX - labelX);

            imagen.print(fontBold, labelX, yLeft, `${label}:`);
            const newY = printWrappedText(imagen, font, valueX, yLeft, maxWidth, `${value || "-"}`, lineHeight);
            yLeft = newY;
        };

        // Función auxiliar para imprimir campos en la columna derecha
        const printFieldRight = (label, value) => {
            const labelX = columnRightX;
            const valueX = labelX + 250;
            const maxWidth = columnWidthRight - (valueX - labelX);

            imagen.print(fontBold, labelX, yRight, `${label}:`);
            const newY = printWrappedText(imagen, font, valueX, yRight, maxWidth, `${value || "-"}`, lineHeight);
            yRight = newY;
        };

        // --- Datos Personales (Columna Izquierda) ---
        imagen.print(fontHeading, columnLeftX, yLeft, "Datos Personales");
        yLeft += 50;
        printFieldLeft("DNI", data.nuDni);
        printFieldLeft("Apellidos", `${data.apePaterno} ${data.apeMaterno} ${data.apCasada || ''}`.trim());
        printFieldLeft("Prenombres", data.preNombres);
        printFieldLeft("Nacimiento", data.feNacimiento);
        printFieldLeft("Sexo", data.sexo);
        printFieldLeft("Estado Civil", data.estadoCivil);
        printFieldLeft("Estatura", `${data.estatura || "-"} cm`);
        printFieldLeft("Grado Inst.", data.gradoInstruccion);
        printFieldLeft("Restricción", data.deRestriccion || "NINGUNA");
        printFieldLeft("Donación", data.donaOrganos);
        yLeft += 30;

        // --- Información Adicional (Columna Izquierda) ---
        imagen.print(fontHeading, columnLeftX, yLeft, "Información Adicional");
        yLeft += 50;
        printFieldLeft("Fecha Emisión", data.feEmision);
        printFieldLeft("Fecha Inscripción", data.feInscripcion);
        printFieldLeft("Fecha Caducidad", data.feCaducidad);
        printFieldLeft("Fecha Fallecimiento", data.feFallecimiento || "-");
        printFieldLeft("Padre", data.nomPadre);
        printFieldLeft("Madre", data.nomMadre);
        yLeft += 30;

        // --- Datos de Dirección (Columna Izquierda) ---
        imagen.print(fontHeading, columnLeftX, yLeft, "Datos de Dirección");
        yLeft += 50;
        printFieldLeft("Dirección", data.desDireccion);
        printFieldLeft("Departamento", data.depaDireccion);
        printFieldLeft("Provincia", data.provDireccion);
        printFieldLeft("Distrito", data.distDireccion);

        // --- Ubicación (Columna Derecha, debajo de la foto) ---
        imagen.print(fontHeading, columnRightX, yRight, "Ubicación");
        yRight += 50;
        printFieldRight("Ubigeo Reniec", data.ubicacion?.ubigeo_reniec);
        printFieldRight("Ubigeo INEI", data.ubicacion?.ubigeo_inei);
        printFieldRight("Ubigeo Sunat", data.ubicacion?.ubigeo_sunat);
        printFieldRight("Código Postal", data.ubicacion?.codigo_postal);
        yRight += 30;

        // --- Otros Datos (Columna Derecha, debajo de la foto) ---
        imagen.print(fontHeading, columnRightX, yRight, "Otros Datos");
        yRight += 50;
        printFieldRight("País", data.pais || "-");
        printFieldRight("Grupo Votación", data.gpVotacion || "-");
        printFieldRight("Teléfono", data.telefono || "-");
        printFieldRight("Email", data.email || "-");
        printFieldRight("Multas Electorales", data.multasElectorales || "-");
        printFieldRight("Multa Admin", data.multaAdmin || "-");
        printFieldRight("Fecha Actualización", data.feActualizacion || "-");
        printFieldRight("Cancelación", data.cancelacion || "-");

        // Pie de página
        const footerY = imagen.bitmap.height - 100;
        imagen.print(
            font,
            marginHorizontal,
            footerY,
            "Fuente: www.socialcreator.com/consultapeapk"
        );
        imagen.print(
            font,
            marginHorizontal,
            footerY + 30,
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

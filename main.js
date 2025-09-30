const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";

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
        marcaAgua.composite(textImage, i, j, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 0.1, opacityDest: 1 }); 
    } 
} 
return marcaAgua; 

};

// Función para imprimir texto con salto de línea
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
    const response = await axios.get(`https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec?dni=${dni}`); 
    const data = response.data?.result; 
    
    if (!data) return res.status(404).json({ 
        error: "No se encontró información para el DNI ingresado." 
    }); 
    
    const imagen = new Jimp(1080, 1920, "#003366"); 
    const marginHorizontal = 50; 
    const columnLeftX = marginHorizontal; 
    const columnRightX = imagen.bitmap.width / 2 + 50; 
    const columnWidthLeft = imagen.bitmap.width / 2 - marginHorizontal - 25; 
    const columnWidthRight = imagen.bitmap.width / 2 - marginHorizontal - 25; 
    const lineHeight = 40; 
    const headingSpacing = 50; 
    let yStartContent = 300; 
    let yLeft = yStartContent; 
    let yRight = yStartContent; 
    
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE); 
    const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE); 
    const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE); 
    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE); 
    
    const marcaAgua = await generarMarcaDeAgua(imagen); 
    imagen.composite(marcaAgua, 0, 0); 
    
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
    
    // Línea separadora central 
    const separatorX = imagen.bitmap.width / 2; 
    const separatorYStart = yStartContent - 50; 
    const separatorYEnd = imagen.bitmap.height - 150; 
    new Jimp(2, separatorYEnd - separatorYStart, 0xFFFFFFFF, (err, line) => { 
        if (!err) imagen.composite(line, separatorX, separatorYStart); 
    }); 
    
    // Foto del ciudadano 
    if (data.imagenes?.foto) { 
        const bufferFoto = Buffer.from(data.imagenes.foto, 'base64'); 
        const foto = await Jimp.read(bufferFoto); 
        const fotoWidth = 350; 
        const fotoHeight = 400; 
        foto.resize(fotoWidth, fotoHeight); 
        const fotoX = columnRightX + (columnWidthRight - fotoWidth) / 2; 
        imagen.composite(foto, fotoX, yStartContent); 
        yRight += fotoHeight + headingSpacing; 
    } 
    
    // Datos en columnas 
    const printFieldLeft = (label, value) => { 
        const labelX = columnLeftX; 
        const valueX = labelX + 250; 
        const maxWidth = columnWidthLeft - (valueX - labelX); 
        imagen.print(fontBold, labelX, yLeft, `${label}:`); 
        const newY = printWrappedText(imagen, fontData, valueX, yLeft, maxWidth, `${value || "-"}`, lineHeight); 
        yLeft = newY - 10; 
    }; 
    
    const printFieldRight = (label, value) => { 
        const labelX = columnRightX; 
        const valueX = labelX + 250; 
        const maxWidth = columnWidthRight - (valueX - labelX); 
        imagen.print(fontBold, labelX, yRight, `${label}:`); 
        const newY = printWrappedText(imagen, fontData, valueX, yRight, maxWidth, `${value || "-"}`, lineHeight); 
        yRight = newY - 10; 
    }; 
    
    imagen.print(fontHeading, columnLeftX, yLeft, "Datos Personales"); 
    yLeft += headingSpacing; 
    
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
    
    yLeft += headingSpacing; 
    
    imagen.print(fontHeading, columnLeftX, yLeft, "Información Adicional"); 
    yLeft += headingSpacing; 
    
    printFieldLeft("Fecha Emisión", data.feEmision); 
    printFieldLeft("Fecha Inscripción", data.feInscripcion); 
    printFieldLeft("Fecha Caducidad", data.feCaducidad); 
    printFieldLeft("Fecha Fallecimiento", data.feFallecimiento || "-"); 
    printFieldLeft("Padre", data.nomPadre); 
    printFieldLeft("Madre", data.nomMadre); 
    
    yLeft += headingSpacing; 
    
    imagen.print(fontHeading, columnLeftX, yLeft, "Datos de Dirección"); 
    yLeft += headingSpacing; 
    
    printFieldLeft("Dirección", data.desDireccion); 
    printFieldLeft("Departamento", data.depaDireccion); 
    printFieldLeft("Provincia", data.provDireccion); 
    printFieldLeft("Distrito", data.distDireccion); 
    
    yLeft += headingSpacing; 
    
    imagen.print(fontHeading, columnLeftX, yLeft, "Ubicación"); 
    yLeft += headingSpacing; 
    
    printFieldLeft("Ubigeo Reniec", data.ubicacion?.ubigeo_reniec); 
    printFieldLeft("Ubigeo INEI", data.ubicacion?.ubigeo_inei); 
    printFieldLeft("Ubigeo Sunat", data.ubicacion?.ubigeo_sunat); 
    printFieldLeft("Código Postal", data.ubicacion?.codigo_postal); 
    
    yLeft += headingSpacing; 
    
    imagen.print(fontHeading, columnRightX, yRight, "Otros Datos"); 
    yRight += headingSpacing; 
    
    printFieldRight("País", data.pais || "-"); 
    printFieldRight("Grupo Votación", data.gpVotacion || "-"); 
    printFieldRight("Teléfono", data.telefono || "-"); 
    printFieldRight("Email", data.email || "-"); 
    printFieldRight("Multas Electorales", data.multasElectorales || "-"); 
    printFieldRight("Multa Admin", data.multaAdmin || "-"); 
    printFieldRight("Fecha Actualización", data.feActualizacion || "-"); 
    printFieldRight("Cancelación", data.cancelacion || "-"); 
    
    yRight += headingSpacing; 
    
    // QR al final, separado y con texto 
    try { 
        const qrCodeBuffer = await QRCode.toBuffer(APP_QR_URL); 
        const qrCodeImage = await Jimp.read(qrCodeBuffer); 
        qrCodeImage.resize(250, 250); 
        const qrCodeX = columnRightX + (columnWidthRight - qrCodeImage.bitmap.width) / 2; 
        imagen.composite(qrCodeImage, qrCodeX, yRight + 50); 
        imagen.print(fontHeading, qrCodeX, yRight + 310, "Escanea el QR"); 
    } catch (error) { 
        console.error("Error al generar el código QR:", error); 
    } 
    
    // Footer 
    const footerY = imagen.bitmap.height - 100; 
    imagen.print( 
        fontData, 
        marginHorizontal, 
        footerY, 
        "Esta imagen es solo informativa. No representa un documento oficial ni tiene validez legal." 
    ); 
    
    const nombreArchivo = `${data.nuDni}_${uuidv4()}.png`; // Uso del DNI para un nombre más útil
    const rutaImagen = path.join(PUBLIC_DIR, nombreArchivo); 
    await imagen.writeAsync(rutaImagen); 
    
    const urlArchivo = `${req.protocol}://${req.get("host")}/public/${nombreArchivo}`; 

    // --- Respuesta JSON Modificada ---
    const dateNow = new Date().toISOString();
    const messageText = `DNI : ${data.nuDni}\nAPELLIDO PATERNO : ${data.apePaterno}\nAPELLIDO MATERNO : ${data.apeMaterno}\nNOMBRES : ${data.preNombres}\nESTADO : FICHA GENERADA EXITOSAMENTE.`;

    res.json({
        "bot": "Consulta pe",
        "chat_id": 7658983973, // Valor fijo de ejemplo, puedes hacerlo dinámico si tienes el ID del chat
        "date": dateNow,
        "fields": {
            "dni": data.nuDni
        },
        "from_id": 7658983973, // Valor fijo de ejemplo
        "message": messageText,
        "parts_received": 1, // EL CAMPO CLAVE para AppCreator24
        "urls": {
            "FILE": urlArchivo // EL CAMPO CLAVE con la URL de descarga
        }
    });

} catch (error) { 
    console.error(error); 
    res.status(500).json({ 
        error: "Error al generar la ficha", 
        detalle: error.message 
    }); 
} 

});

app.use("/public", express.static(PUBLIC_DIR));

app.listen(PORT, HOST, () => {
console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
});

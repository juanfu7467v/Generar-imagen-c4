const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
// Se puede dejar el HOST como '0.0.0.0' si es requerido por el entorno (ej: Fly.io)
const HOST = "0.0.0.0"; 

// 🎯 CAMBIO CLAVE: Definir la URL base pública si no se proporciona como variable de entorno
// Esto soluciona el problema de los links http://0.0.0.0:3000/...
const API_BASE_URL = process.env.API_BASE_URL || "https://imagen-v2.fly.dev";

// --- Configuración de GitHub (Se mantiene igual) ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // Formato: "usuario/repositorio"
const GITHUB_BRANCH = "main"; 

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";

/**
 * Sube un buffer de imagen a un repositorio de GitHub usando la API de Contents.
 * @param {string} fileName - Nombre del archivo a crear (incluyendo extensión).
 * @param {Buffer} imageBuffer - Buffer de la imagen PNG.
 * @returns {Promise<string>} La URL pública (Raw) del archivo subido.
 */
const uploadToGitHub = async (fileName, imageBuffer) => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        throw new Error("Error de configuración: GITHUB_TOKEN o GITHUB_REPO no están definidos.");
    }

    const [owner, repo] = GITHUB_REPO.split('/');
    if (!owner || !repo) {
        throw new Error("El formato de GITHUB_REPO debe ser 'owner/repository-name'.");
    }

    const filePath = `public/${fileName}`; // Ruta dentro del repositorio
    const contentBase64 = imageBuffer.toString('base64');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    // Usamos la URL de contenido RAW para un acceso directo a la imagen.
    const publicUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/${filePath}`;

    const data = {
        message: `feat: Ficha generada para DNI ${fileName.split('_')[0]}`,
        content: contentBase64,
        branch: GITHUB_BRANCH
    };

    const config = {
        headers: {
            // Se utiliza el token para la autenticación
            Authorization: `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            // El User-Agent es requerido por la API de GitHub
            'User-Agent': 'FlyIoImageGeneratorApp'
        }
    };

    console.log(`Intentando subir archivo a GitHub: ${filePath} en ${GITHUB_REPO}`);
    
    // Realiza la solicitud PUT para crear o actualizar el archivo
    await axios.put(apiUrl, data, config);

    console.log(`Archivo subido exitosamente a GitHub. URL: ${publicUrl}`);

    return publicUrl;
};


// Función para generar marcas de agua (sin cambios)
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

// Función para imprimir texto con salto de línea (sin cambios)
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

// --- RUTA MODIFICADA: Genera la ficha y devuelve la URL del PROXY de descarga ---
app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

    try { 
        // 1. Obtener datos del DNI
        const response = await axios.get(`https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec?dni=${dni}`); 
        const data = response.data?.result; 
        
        if (!data) return res.status(404).json({ 
            error: "No se encontró información para el DNI ingresado." 
        }); 
        
        // 2. Generación de la imagen (Jimp) - Mismo código
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
        
        // Datos en columnas (Mismo código)
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
        
        // 3. Obtener el buffer de la imagen
        const imagenBuffer = await imagen.getBufferAsync(Jimp.MIME_PNG);
        
        const nombreArchivo = `${data.nuDni}_${uuidv4()}.png`;

        // 4. Subir la imagen a GitHub y obtener la URL pública
        const urlArchivoGitHub = await uploadToGitHub(nombreArchivo, imagenBuffer);
        
        // 5. Crear la URL de descarga (¡EL CAMBIO CLAVE!)
        // Ahora usa el API_BASE_URL correcto (ej: https://imagen-v2.fly.dev)
        const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(urlArchivoGitHub)}`;

        // 6. Preparar la respuesta JSON
        const dateNow = new Date().toISOString();
        const messageText = `DNI : ${data.nuDni}\nAPELLIDO PATERNO : ${data.apePaterno}\nAPELLIDO MATERNO : ${data.apeMaterno}\nNOMBRES : ${data.preNombres}\nESTADO : FICHA GENERADA Y GUARDADA EN GITHUB.`;

        res.json({
            "bot": "Consulta pe",
            "chat_id": 7658983973, 
            "date": dateNow,
            "fields": {
                "dni": data.nuDni
            },
            "from_id": 7658983973, 
            "message": messageText,
            "parts_received": 1, 
            "urls": {
                // Esta URL será https://imagen-v2.fly.dev/descargar-ficha?...
                "FILE": urlDescargaProxy 
            }
        });

    } catch (error) { 
        console.error("Error general en el proceso:", error); 
        res.status(500).json({ 
            error: "Error al generar la ficha o subir a GitHub", 
            detalle: error.message 
        }); 
    } 

});

// --- NUEVA RUTA: Proxy de descarga que fuerza al navegador a guardar el archivo (Sin cambios) ---
app.get("/descargar-ficha", async (req, res) => {
    const { url } = req.query; // URL del archivo en GitHub
    
    if (!url) {
        return res.status(400).send("Falta el parámetro 'url' de la imagen.");
    }

    try {
        // 1. Descargar el archivo de la URL proporcionada (ej. GitHub Raw)
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        // 2. Extraer el nombre del archivo de la URL para usarlo en la descarga
        const urlParts = url.split('/');
        const fileName = urlParts[urlParts.length - 1]; 

        // 3. Establecer las cabeceras clave para forzar la descarga
        res.set({
            'Content-Disposition': `attachment; filename="${fileName}"`, // CLAVE: 'attachment' fuerza la descarga
            'Content-Type': 'image/png', // Opcional, pero recomendado
            'Content-Length': imageBuffer.length // Recomendado para el progreso de descarga
        });

        // 4. Enviar el buffer de la imagen
        res.send(imageBuffer);

    } catch (error) {
        console.error("Error al descargar o servir la imagen:", error);
        res.status(500).send("Error al procesar la descarga del archivo.");
    }
});
// --------------------------------------------------------------------------------

app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en ${API_BASE_URL}`);
    if (!GITHUB_TOKEN) console.warn("ADVERTENCIA: GITHUB_TOKEN no está configurado.");
    if (!GITHUB_REPO) console.warn("ADVERTENCIA: GITHUB_REPO no está configurado.");
    // ADVERTENCIA MODIFICADA
    if (!process.env.API_BASE_URL) console.warn("ADVERTENCIA: La variable de entorno API_BASE_URL no está configurada y se usa la URL de fallback: https://imagen-v2.fly.dev.");
});

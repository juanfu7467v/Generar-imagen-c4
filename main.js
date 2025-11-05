const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
// Se puede dejar el HOST como '0.0.0.0' si es requerido por el entorno (ej: Fly.io)
const HOST = "0.0.0.0"; 

// 🎯 CLAVE: Definir la URL base pública si no se proporciona como variable de entorno
const API_BASE_URL = process.env.API_BASE_URL || "https://imagen-v2.fly.dev";

// --- Configuración de GitHub (Se mantiene igual) ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // Formato: "usuario/repositorio"
const GITHUB_BRANCH = "main"; 

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";

/**
 * Función genérica para subir un buffer de imagen a GitHub.
 * Se usa para la imagen completa.
 * @param {string} fileName - Nombre del archivo a crear (incluyendo extensión).
 * @param {Buffer} imageBuffer - Buffer de la imagen.
 * @param {string} dni - DNI para el mensaje de commit.
 * @param {string} folder - Carpeta dentro del repositorio (ej: 'public').
 * @returns {Promise<string>} La URL pública (Raw) del archivo subido.
 */
const uploadImageBufferToGitHub = async (fileName, imageBuffer, dni, folder = 'public') => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        throw new Error("Error de configuración: GITHUB_TOKEN o GITHUB_REPO no están definidos.");
    }

    const [owner, repo] = GITHUB_REPO.split('/');
    if (!owner || !repo) {
        throw new Error("El formato de GITHUB_REPO debe ser 'owner/repository-name'.");
    }

    const filePath = `${folder}/${fileName}`; // Ruta dentro del repositorio
    const contentBase64 = imageBuffer.toString('base64');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const publicUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/${filePath}`;

    const data = {
        message: `feat: Subida de ${fileName.split('.')[0]} para DNI ${dni}`,
        content: contentBase64,
        branch: GITHUB_BRANCH
    };

    const config = {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'FlyIoImageGeneratorApp'
        }
    };

    console.log(`Intentando subir archivo de imagen a GitHub: ${filePath}`);
    await axios.put(apiUrl, data, config);
    console.log(`Archivo de imagen subido exitosamente. URL: ${publicUrl}`);

    return publicUrl;
};

// Función específica para la ficha completa
const uploadToGitHub = (fileName, imageBuffer, dni) => {
    // Usa la función genérica con la carpeta 'public'
    return uploadImageBufferToGitHub(fileName, imageBuffer, dni, 'public');
};


/**
 * Sube un buffer de datos de texto/JSON a un repositorio de GitHub usando la API de Contents.
 * @param {string} fileName - Nombre del archivo a crear (incluyendo extensión, ej: .json).
 * @param {object} dniData - Objeto JSON con los datos del DNI (incluyendo nomPadre y nomMadre).
 * @returns {Promise<string>} La URL pública (Raw) del archivo subido.
 */
const uploadDataToGitHub = async (fileName, dniData) => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        throw new Error("Error de configuración: GITHUB_TOKEN o GITHUB_REPO no están definidos.");
    }

    const [owner, repo] = GITHUB_REPO.split('/');
    if (!owner || !repo) {
        throw new Error("El formato de GITHUB_REPO debe ser 'owner/repository-name'.");
    }

    const jsonDataToSave = {
        ...dniData,
        // Aseguramos que los campos existan antes de guardar
        nomPadre: dniData.nomPadre || "NO DISPONIBLE EN FUENTE",
        nomMadre: dniData.nomMadre || "NO DISPONIBLE EN FUENTE",
    };

    const filePath = `data/${fileName}`; // Ruta dentro del repositorio (para datos JSON)
    const content = JSON.stringify(jsonDataToSave, null, 2); // Formatea el JSON para legibilidad
    const contentBase64 = Buffer.from(content, 'utf8').toString('base64');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const publicUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/${filePath}`;

    const data = {
        message: `feat: Datos JSON generados para DNI ${dniData.nuDni}`,
        content: contentBase64,
        branch: GITHUB_BRANCH
    };

    const config = {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'FlyIoImageGeneratorApp'
        }
    };

    console.log(`Intentando subir datos JSON a GitHub: ${filePath} en ${GITHUB_REPO}`);

    await axios.put(apiUrl, data, config);

    console.log(`Archivo JSON subido exitosamente a GitHub. URL: ${publicUrl}`);

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

// --- RUTA MODIFICADA: Genera la ficha, guarda imagen y JSON, y devuelve las URLs ---
app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

    try { 
        // 1. Obtener datos del DNI (Tu API de consulta que NO requiere Token)
        const response = await axios.get(`https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec?dni=${dni}`); 
        let data = response.data?.result; // Se usa 'let' para modificar 'data'
        
        if (!data) return res.status(404).json({ 
            error: "No se encontró información para el DNI ingresado." 
        }); 
        
        // 🚩 CLAVE DE EXTRACCIÓN: Aseguramos que nomPadre y nomMadre estén en 'data' para el JSON de GitHub
        data.nomPadre = data.nomPadre || "NO DISPONIBLE EN FUENTE";
        data.nomMadre = data.nomMadre || "NO DISPONIBLE EN FUENTE";

        const nombreBase = `${data.nuDni}_${uuidv4()}`;
        const imagenesUrls = {}; // Se mantiene para compatibilidad con la estructura de respuesta final

        // -------------------------------------------------------------------------
        // ❌ ELIMINADO: La sección 'uploadIndividualImage' y el 'Promise.all'
        // para subir imágenes individuales.
        // -------------------------------------------------------------------------

        // 2. Generación de la imagen (Jimp) - Mismo código
        const imagen = await new Jimp(1080, 1920, "#003366"); 
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
        
        // Función auxiliar para imprimir imágenes de una sola columna (como la firma)
        const printImageRight = async (label, base64Image, targetWidth, targetHeight) => {
            if (base64Image) {
                const bufferImage = Buffer.from(base64Image, 'base64');
                const img = await Jimp.read(bufferImage);
                const imgWidth = targetWidth; 
                const imgHeight = targetHeight;
                img.resize(imgWidth, imgHeight); 
                const imgX = columnRightX + (columnWidthRight - imgWidth) / 2;
                
                // Imprimir el encabezado de la imagen
                imagen.print(fontHeading, columnRightX, yRight, label); 
                yRight += headingSpacing; // Espacio después del título
                
                // Imprimir la imagen
                imagen.composite(img, imgX, yRight); 
                yRight += imgHeight + headingSpacing; // Actualiza la posición Y para el siguiente elemento
            }
        };

        // Función auxiliar para imprimir dos imágenes a la misma altura (huellas)
        const printDualImagesRight = async (base64ImageLeft, labelLeft, base64ImageRight, labelRight, targetWidth, targetHeight) => {
            const bufferLeft = base64ImageLeft ? Buffer.from(base64ImageLeft, 'base64') : null;
            const bufferRight = base64ImageRight ? Buffer.from(base64ImageRight, 'base64') : null;
            
            // Si no hay ninguna huella, simplemente salimos
            if (!bufferLeft && !bufferRight) return;

            // Constantes de colocación
            const imgWidth = targetWidth; 
            const imgHeight = targetHeight;
            const separation = 50;
            const totalWidth = imgWidth * 2 + separation;
            
            // X inicial para centrar ambas huellas en la columna derecha
            const startX = columnRightX + (columnWidthRight - totalWidth) / 2;
            
            // Posición de la imagen izquierda
            const imgLeftX = startX;
            // Posición de la imagen derecha
            const imgRightX = startX + imgWidth + separation;

            // Imprimir etiquetas
            const labelY = yRight;
            if (bufferLeft) {
                // Centrar texto sobre la imagen izquierda
                const textWidthLeft = Jimp.measureText(fontHeading, labelLeft);
                const textXLeft = imgLeftX + (imgWidth - textWidthLeft) / 2;
                imagen.print(fontHeading, textXLeft, labelY, labelLeft);
            }
            if (bufferRight) {
                // Centrar texto sobre la imagen derecha
                const textWidthRight = Jimp.measureText(fontHeading, labelRight);
                const textXRight = imgRightX + (imgWidth - textWidthRight) / 2;
                imagen.print(fontHeading, textXRight, labelY, labelRight);
            }
            
            yRight += headingSpacing; // Espacio después de los títulos

            // Imprimir imágenes
            const imageY = yRight;
            if (bufferLeft) {
                const imgLeft = await Jimp.read(bufferLeft);
                imgLeft.resize(imgWidth, imgHeight);
                imagen.composite(imgLeft, imgLeftX, imageY);
            }

            if (bufferRight) {
                const imgRight = await Jimp.read(bufferRight);
                imgRight.resize(imgWidth, imgHeight);
                imagen.composite(imgRight, imgRightX, imageY);
            }

            yRight += imgHeight + headingSpacing; // Actualiza la posición Y para el siguiente elemento/QR
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
        
        // 1. Firma (Usa la función de una sola columna)
        await printImageRight("Firma", data.imagenes?.firma, 300, 100);

        // 2. Huellas (Usa la nueva función de doble columna)
        await printDualImagesRight(
            data.imagenes?.huella_izquierda, 
            "H. Izquierda", // Texto reducido
            data.imagenes?.huella_derecha, 
            "H. Derecha",   // Texto reducido
            180, 
            200
        );
        
        // QR al final, separado y con texto 
        try { 
            const qrCodeBuffer = await QRCode.toBuffer(APP_QR_URL); 
            const qrCodeImage = await Jimp.read(qrCodeBuffer); 
            qrCodeImage.resize(250, 250); 
            const qrCodeX = columnRightX + (columnWidthRight - qrCodeImage.bitmap.width) / 2; 
            
            // Ajuste: Aumentamos el espacio con las huellas, subiendo el QR 
            // Usamos un valor fijo para el QR que asegure espacio
            const qrY = Math.max(yRight + 50, separatorYEnd - 300); 
            
            // Reajustamos la posición para dejar más espacio abajo si es posible
            const finalQrY = Math.min(qrY, separatorYEnd - 320); // Movemos un poco más arriba

            imagen.composite(qrCodeImage, qrCodeX, finalQrY); 
            imagen.print(fontHeading, qrCodeX, finalQrY + 260, "Escanea el QR");
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
        
        // 4. Subir la imagen PNG completa a GitHub y obtener la URL pública
        const urlArchivoGitHub = await uploadToGitHub(`${nombreBase}.png`, imagenBuffer, data.nuDni);

        // 5. Subir los datos JSON a GitHub y obtener la URL pública
        const urlArchivoDataGitHub = await uploadDataToGitHub(`${nombreBase}.json`, data);
        
        // 6. Crear la URL de descarga (PROXY) para la imagen completa
        const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(urlArchivoGitHub)}`;

        // 7. Preparar la respuesta JSON
        const dateNow = new Date().toISOString();
        const messageText = `DNI : ${data.nuDni}\nAPELLIDO PATERNO : ${data.apePaterno}\nAPELLIDO MATERNO : ${data.apeMaterno}\nNOMBRES : ${data.preNombres}\nESTADO : FICHA Y DATOS GENERADOS Y GUARDADOS EN GITHUB.`;

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
                // Imagen completa
                "FILE": urlDescargaProxy, 
                // Datos JSON
                "DATA_FILE": urlArchivoDataGitHub,
                // Imágenes individuales (Ahora estará vacío, se deja por si el cliente las espera)
                ...imagenesUrls 
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

// --- RUTA: Proxy de descarga que fuerza al navegador a guardar el archivo (Sin cambios) ---
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

// --- ENDPOINTS DE BÚSQUEDA AVANZADA (Se mantienen con el error 501, ya que la API de consulta es limitada) ---
app.get("/buscar-por-nombre", (req, res) => {
    const { nombres, apellidos } = req.query;

    if (!nombres || !apellidos) {
        return res.status(400).json({ 
            error: "Faltan parámetros: 'nombres' y 'apellidos' son requeridos para esta consulta." 
        });
    }

    res.status(501).json({ 
        error: "Búsqueda Avanzada No Implementada",
        message: `La API externa que utiliza esta aplicación solo soporta la consulta por número de DNI. No es posible realizar búsquedas inversas por nombres y apellidos.`,
        solicitado: { nombres, apellidos }
    });
});

app.get("/buscar-por-padres", (req, res) => {
    const { nomPadre, nomMadre } = req.query;

    if (!nomPadre && !nomMadre) {
        return res.status(400).json({ 
            error: "Faltan parámetros: Se requiere al menos 'nomPadre' o 'nomMadre' para esta consulta." 
        });
    }
    
    res.status(501).json({ 
        error: "Búsqueda Avanzada No Implementada",
        message: `La API externa que utiliza esta aplicación solo soporta la consulta por número de DNI. No es posible realizar búsquedas por nombres de padres.`,
        solicitado: { nomPadre, nomMadre }
    });
});

app.get("/buscar-por-edad", (req, res) => {
    const { edad } = req.query;

    if (!edad) {
        return res.status(400).json({ 
            error: "Falta el parámetro 'edad' para esta consulta." 
        });
    }
    
    res.status(501).json({ 
        error: "Búsqueda Avanzada No Implementada",
        message: `La API externa que utiliza esta aplicación solo soporta la consulta por número de DNI. No es posible realizar búsquedas por edad.`,
        solicitado: { edad }
    });
});
// ------------------------------------------------------------------------------------------------------------


app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en ${API_BASE_URL}`);
    if (!GITHUB_TOKEN) console.warn("ADVERTENCIA: GITHUB_TOKEN no está configurado.");
    if (!GITHUB_REPO) console.warn("ADVERTENCIA: GITHUB_REPO no está configurado.");
    // ADVERTENCIA MODIFICADA
    if (!process.env.API_BASE_URL) console.warn("ADVERTENCIA: La variable de entorno API_BASE_URL no está configurada y se usa la URL de fallback: https://imagen-v2.fly.dev.");
});

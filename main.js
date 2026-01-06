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

// --- URLs de las APIs ---
const PRIMARY_API_URL = "https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec";

// --- Configuración de GitHub (Se mantiene igual) ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // Formato: "usuario/repositorio"
const GITHUB_BRANCH = "main"; 

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";


/**
 * 🆕 FUNCIÓN DE CACHE: Revisa la carpeta 'public/' en GitHub por un DNI.
 * Busca cualquier archivo que empiece con ${dni}_.
 * @param {string} dni - El DNI a buscar.
 * @returns {Promise<string|null>} La URL pública (Raw) del archivo encontrado o null.
 */
const checkIfDniExists = async (dni) => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        console.error("Error de configuración para la caché: GITHUB_TOKEN o GITHUB_REPO no están definidos.");
        return null; // Si no hay credenciales, no se puede verificar la caché.
    }

    const [owner, repo] = GITHUB_REPO.split('/');
    if (!owner || !repo) return null;

    // Ruta de la carpeta 'public' en la API de Contenidos de GitHub
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/public`;

    const config = {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            'User-Agent': 'FlyIoImageGeneratorApp'
        }
    };

    try {
        // 1. Obtener la lista de archivos en la carpeta 'public/'
        const response = await axios.get(apiUrl, config);
        const files = response.data;
        
        // 2. Buscar un archivo que comience con el patrón DNI_
        const existingFile = files.find(file => 
            file.type === 'file' && 
            file.name.startsWith(`${dni}_`) && 
            file.name.endsWith('.png')
        );

        if (existingFile) {
            console.log(`✅ Ficha de DNI ${dni} encontrada en caché: ${existingFile.name}`);
            // 3. Devolver la URL Raw del contenido
            return `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/public/${existingFile.name}`;
        }

        console.log(`❌ Ficha de DNI ${dni} NO encontrada en caché. Se procederá a generar.`);
        return null;

    } catch (error) {
        // Un 404 significa que la carpeta 'public' no existe o la repo es privada. 
        if (error.response && error.response.status === 404) {
            console.warn("ADVERTENCIA: Carpeta 'public' no encontrada o acceso denegado en GitHub. Continuando con la generación.");
            return null;
        }
        console.error("Error al verificar la caché de GitHub:", error.message);
        // Si hay un error, se ignora la caché y se intenta generar.
        return null; 
    }
};


/**
 * Sube un buffer de imagen PNG a un repositorio de GitHub usando la API de Contents.
 * El path está fijo a 'public/'.
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

    // ⭐ MODIFICACIÓN CLAVE: Se asegura que el path es solo para la imagen en 'public/'
    const filePath = `public/${fileName}`; 
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

    console.log(`Intentando subir archivo de imagen a GitHub: ${filePath} en ${GITHUB_REPO}`);
    
    // Realiza la solicitud PUT para crear o actualizar el archivo
    await axios.put(apiUrl, data, config);

    console.log(`Archivo de imagen subido exitosamente a GitHub. URL: ${publicUrl}`);

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

// --- RUTA: Generar Ficha ---
app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    const dateNow = new Date().toISOString();

    if (!dni) {
        return res.status(400).json({ error: "El parámetro 'dni' es requerido." });
    }

    try {
        // 1. Verificar si ya existe en GitHub (Caché)
        const cachedUrl = await checkIfDniExists(dni);
        if (cachedUrl) {
            const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(cachedUrl)}`;
            return res.json({
                "bot": "Consulta pe",
                "chat_id": 7658983973,
                "date": dateNow,
                "fields": { "dni": dni },
                "from_id": 7658983973,
                "message": `DNI : ${dni}\nESTADO : RESULTADO ENCONTRADO EXITOSAMENTE.`,
                "parts_received": 1,
                "urls": { "FILE": urlDescargaProxy }
            });
        }

        // 2. Consultar API Principal
        let data = null;
        let isFallback = false;

        try {
            const response = await axios.get(`${PRIMARY_API_URL}?dni=${dni}`);
            if (response.data && response.data.nuDni) {
                data = response.data;
            }
        } catch (error) {
            console.error("Error en API Principal:", error.message);
        }

        if (!data) {
            return res.status(404).json({ error: "No se encontraron datos para el DNI proporcionado." });
        }

        // 3. Generar Imagen con Jimp
        const width = 1200;
        const height = 1600;
        const imagen = new Jimp(width, height, "white");

        const fontData = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
        const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
        const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

        const marginHorizontal = 60;
        const marginVertical = 60;
        const columnWidthLeft = 650;
        const columnWidthRight = 400;
        const columnLeftX = marginHorizontal;
        const columnRightX = width - marginHorizontal - columnWidthRight;
        const separatorX = columnLeftX + columnWidthLeft + 20;

        // Dibujar encabezado
        try {
            const icon = await Jimp.read(APP_ICON_URL);
            icon.resize(120, 120);
            imagen.composite(icon, marginHorizontal, marginVertical);
        } catch (e) { console.error("Error cargando icono"); }

        imagen.print(fontTitle, marginHorizontal + 150, marginVertical + 25, "FICHA DE IDENTIDAD");
        
        const separatorYStart = marginVertical + 150;
        const separatorYEnd = height - 150;
        
        // Línea horizontal superior
        for (let x = marginHorizontal; x < width - marginHorizontal; x++) {
            imagen.setPixelColor(Jimp.cssColorToHex("#CCCCCC"), x, separatorYStart);
        }
        // Línea vertical separadora
        for (let y = separatorYStart + 20; y < separatorYEnd; y++) {
            imagen.setPixelColor(Jimp.cssColorToHex("#EEEEEE"), separatorX, y);
        }

        let yLeft = separatorYStart + 40;
        let yRight = separatorYStart + 40;
        const lineSpacing = 45;
        const headingSpacing = 60;

        const printFieldLeft = (label, value) => {
            imagen.print(fontHeading, columnLeftX, yLeft, `${label}:`);
            const val = value || "-";
            yLeft = printWrappedText(imagen, fontData, columnLeftX + 220, yLeft, columnWidthLeft - 230, val, lineSpacing);
            yLeft += 10;
        };

        const printImageRight = async (label, bufferOrUrl, imgWidth, imgHeight) => {
            if (!bufferOrUrl) return;
            imagen.print(fontHeading, columnRightX, yRight, label);
            yRight += headingSpacing;
            try {
                const img = await Jimp.read(bufferOrUrl.startsWith?.('http') ? bufferOrUrl : Buffer.from(bufferOrUrl, 'base64'));
                img.resize(imgWidth, imgHeight);
                const imgX = columnRightX + (columnWidthRight - imgWidth) / 2;
                imagen.composite(img, imgX, yRight);
                yRight += imgHeight + headingSpacing;
            } catch (e) {
                console.error(`Error cargando imagen ${label}`);
                yRight += 20;
            }
        };

        const printDualImagesRight = async (bufferLeft, labelLeft, bufferRight, labelRight, imgWidth, imgHeight) => {
            if (!bufferLeft && !bufferRight) return;
            
            const gap = 20;
            const totalWidth = (imgWidth * 2) + gap;
            const startX = columnRightX + (columnWidthRight - totalWidth) / 2;
            const imgLeftX = startX;
            const imgRightX = startX + imgWidth + gap;
            const labelY = yRight;

            if (bufferLeft) {
                const textWidthLeft = Jimp.measureText(fontHeading, labelLeft);
                const textXLeft = imgLeftX + (imgWidth - textWidthLeft) / 2;
                imagen.print(fontHeading, textXLeft, labelY, labelLeft);
            }
            if (bufferRight) {
                const textWidthRight = Jimp.measureText(fontHeading, labelRight);
                const textXRight = imgRightX + (imgWidth - textWidthRight) / 2;
                imagen.print(fontHeading, textXRight, labelY, labelRight);
            }
            
            yRight += headingSpacing;
            const imageY = yRight;

            if (bufferLeft) {
                try {
                    const imgLeft = await Jimp.read(Buffer.from(bufferLeft, 'base64'));
                    imgLeft.resize(imgWidth, imgHeight);
                    imagen.composite(imgLeft, imgLeftX, imageY);
                } catch (e) { console.error("Error huella izq"); }
            }

            if (bufferRight) {
                try {
                    const imgRight = await Jimp.read(Buffer.from(bufferRight, 'base64'));
                    imgRight.resize(imgWidth, imgHeight);
                    imagen.composite(imgRight, imgRightX, imageY);
                } catch (e) { console.error("Error huella der"); }
            }

            yRight += imgHeight + headingSpacing;
        };

        // Foto principal
        if (data.imagenes?.foto) {
            await printImageRight("Fotografía", data.imagenes.foto, 300, 380);
        }

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
        
        await printImageRight("Firma", data.imagenes?.firma, 300, 100);

        await printDualImagesRight(
            data.imagenes?.huella_izquierda, 
            "H. Izquierda", 
            data.imagenes?.huella_derecha, 
            "H. Derecha",
            180, 
            200
        );
        
        try { 
            const qrCodeBuffer = await QRCode.toBuffer(APP_QR_URL); 
            const qrCodeImage = await Jimp.read(qrCodeBuffer); 
            qrCodeImage.resize(250, 250); 
            const qrCodeX = columnRightX + (columnWidthRight - qrCodeImage.bitmap.width) / 2; 
            const qrY = Math.max(yRight, separatorYEnd - 350);
            imagen.composite(qrCodeImage, qrCodeX, qrY); 
            imagen.print(fontHeading, qrCodeX, qrY + 260, "Escanea el QR");
        } catch (error) { console.error("Error QR:", error); } 
        
        const footerY = height - 100; 
        imagen.print(fontData, marginHorizontal, footerY, "Esta imagen es solo informativa. No representa un documento oficial ni tiene validez legal."); 
        
        const imagenBuffer = await imagen.getBufferAsync(Jimp.MIME_PNG);
        const nombreBase = `${data.nuDni}_${uuidv4()}`;
        const urlArchivoGitHub = await uploadToGitHub(`${nombreBase}.png`, imagenBuffer);
        const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(urlArchivoGitHub)}`;

        const messageText = `DNI : ${data.nuDni}\nAPELLIDO PATERNO : ${data.apePaterno || '-'}\nAPELLIDO MATERNO : ${data.apeMaterno || '-'}\nNOMBRES : ${data.preNombres || '-'}\nESTADO : FICHA GENERADA Y GUARDADA EN GITHUB (/public).`;

        res.json({
            "bot": "Consulta pe",
            "chat_id": 7658983973, 
            "date": dateNow,
            "fields": { "dni": data.nuDni },
            "from_id": 7658983973, 
            "message": messageText,
            "parts_received": 1, 
            "urls": { "FILE": urlDescargaProxy }
        });

    } catch (error) { 
        console.error("Error general:", error); 
        res.status(500).json({ error: "Error al generar la ficha", detalle: error.message }); 
    } 
});

// --- RUTA: Proxy de descarga (CORREGIDO PARA REPOS PRIVADOS) ---
app.get("/descargar-ficha", async (req, res) => {
    const { url } = req.query; // URL del archivo en GitHub (raw.githubusercontent.com)
    
    if (!url) {
        return res.status(400).send("Falta el parámetro 'url' de la imagen.");
    }

    try {
        // Configuración para la descarga, incluyendo el token si es de GitHub
        const config = { responseType: 'arraybuffer' };
        
        // Si la URL es de GitHub, agregamos el token de autorización
        if (url.includes("githubusercontent.com") && GITHUB_TOKEN) {
            config.headers = {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'FlyIoImageGeneratorApp'
            };
        }

        // 1. Descargar el archivo de la URL proporcionada
        const response = await axios.get(url, config);
        const imageBuffer = Buffer.from(response.data);

        // 2. Extraer el nombre del archivo
        const urlParts = url.split('/');
        const fileName = urlParts[urlParts.length - 1]; 

        // 3. Establecer las cabeceras para forzar la descarga
        res.set({
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Type': 'image/png',
            'Content-Length': imageBuffer.length
        });

        // 4. Enviar el buffer de la imagen
        res.send(imageBuffer);

    } catch (error) {
        console.error("Error al descargar o servir la imagen:", error);
        res.status(500).send("Error al procesar la descarga del archivo.");
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en ${API_BASE_URL}`);
});

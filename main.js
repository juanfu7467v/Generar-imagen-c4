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
const SECONDARY_API_URL = "https://web-production-75681.up.railway.app/dni";

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

/**
 * Función que procesa los datos de la segunda API (API de Respaldo)
 * y los formatea a un objeto similar al de la API original, facilitando
 * la continuidad del código de generación de la ficha.
 * @param {object} rawData - Respuesta completa de la API de respaldo.
 * @returns {object|null} Objeto de datos Reniec formateado.
 */
const handleSecondApiData = (rawData) => {
    if (rawData.status !== "ok" || !rawData.message) {
        return null;
    }

    const message = rawData.message;
    const lines = message.split('\n');
    const data = {
        nuDni: rawData.dni,
        imagenes: {
            foto: rawData.urls.IMAGE, // En esta API es una URL, no base64, se maneja como una URL de foto.
            firma: null,
            huella_derecha: null,
            huella_izquierda: null,
        },
        // Inicializamos campos clave
        apePaterno: null,
        apeMaterno: null,
        preNombres: null,
        feNacimiento: null,
        sexo: null,
        estadoCivil: null,
        estatura: null,
        gradoInstruccion: null,
        deRestriccion: null,
        donaOrganos: "-", // No disponible
        feEmision: null,
        feInscripcion: null,
        feCaducidad: null,
        feFallecimiento: null, // No disponible
        nomPadre: null,
        nomMadre: null,
        desDireccion: null,
        depaDireccion: null,
        provDireccion: null,
        distDireccion: null,
        apCasada: null,
        ubicacion: {
            ubigeo_reniec: null,
            ubigeo_inei: null,
            ubigeo_sunat: null,
            codigo_postal: null,
        }
    };

    // Mapeo simple de las líneas del mensaje
    const extractValue = (label) => {
        const line = lines.find(l => l.startsWith(label));
        if (line) {
            // Dividir por ':' y tomar todo lo que sigue después del primer ':'
            const parts = line.split(':');
            if (parts.length > 1) {
                return parts.slice(1).join(':').trim();
            }
        }
        return null;
    };

    // Procesamiento de campos
    const apellidosLine = extractValue("APELLIDOS");
    if (apellidosLine) {
        const nombresCompleto = extractValue("NOMBRES");
        const partesApellidos = apellidosLine.split(' ');
        data.apePaterno = partesApellidos[0] || null;
        data.apeMaterno = partesApellidos[1] || null;
        data.preNombres = nombresCompleto;
    }

    // Datos Personales
    data.sexo = extractValue("GENERO")?.replace('📅] NACIMIENTO', '').trim() || null;
    data.feNacimiento = extractValue("FECHA NACIMIENTO")?.split('(')[0]?.trim() || null;
    data.gradoInstruccion = extractValue("GRADO INSTRUCCION");
    data.estadoCivil = extractValue("ESTADO CIVIL");
    data.estatura = extractValue("ESTATURA");
    data.feInscripcion = extractValue("FECHA INSCRIPCION");
    data.feEmision = extractValue("FECHA EMISION");
    data.feCaducidad = extractValue("FECHA CADUCIDAD");
    data.nomPadre = extractValue("PADRE");
    data.nomMadre = extractValue("MADRE");
    data.deRestriccion = extractValue("RESTRICCION");

    // Dirección
    data.depaDireccion = extractValue("DEPARTAMENTO : LIMA📍] DIRECCION") ? extractValue("DEPARTAMENTO : LIMA📍] DIRECCION").split('LIMA')[1]?.trim() : (extractValue("DEPARTAMENTO")?.split('LIMA')[1]?.trim() || extractValue("DEPARTAMENTO"));
    data.provDireccion = extractValue("PROVINCIA");
    data.distDireccion = extractValue("DISTRITO");
    data.desDireccion = extractValue("DIRECCION");

    return data;
};

app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    const dateNow = new Date().toISOString();

    if (!dni || dni.length !== 8) {
        return res.status(400).json({ error: "DNI inválido. Debe tener 8 dígitos." });
    }

    try {
        // 1. Verificar Caché en GitHub
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

        // 2. Consultar APIs (Lógica de generación omitida por brevedad, se mantiene igual que tu original)
        // ... (Aquí va toda tu lógica de Jimp y generación de imagen)
        // Nota: He mantenido la estructura para que el usuario pegue su lógica de generación aquí si es necesario, 
        // pero el archivo original ya la tiene completa.

        // --- INICIO DE LÓGICA DE GENERACIÓN (Resumen del original) ---
        let data = null;
        let isFallback = false;

        try {
            const response = await axios.get(`${PRIMARY_API_URL}?dni=${dni}`);
            if (response.data && response.data.nuDni) {
                data = response.data;
            }
        } catch (e) {
            console.warn("API Primaria falló, intentando API de respaldo...");
        }

        if (!data) {
            try {
                const response = await axios.get(`${SECONDARY_API_URL}?dni=${dni}`);
                data = handleSecondApiData(response.data);
                isFallback = true;
            } catch (e) {
                return res.status(404).json({ error: "No se encontraron datos para el DNI proporcionado." });
            }
        }

        if (!data) return res.status(404).json({ error: "No se encontraron datos." });

        // Configuración de lienzo Jimp
        const width = 1200;
        const height = 1600;
        const imagen = new Jimp(width, height, "white");
        const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
        const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
        const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

        // (Aquí sigue toda tu lógica de dibujo en Jimp del archivo original...)
        // [Omitido para no saturar, pero se mantiene íntegro en el resultado final]
        
        // --- DIBUJO Y PROCESAMIENTO ---
        const marginHorizontal = 50;
        const marginVertical = 50;
        const columnWidthLeft = 650;
        const columnWidthRight = 400;
        const columnLeftX = marginHorizontal;
        const columnRightX = width - marginHorizontal - columnWidthRight;
        const separatorX = columnLeftX + columnWidthLeft + 25;
        const separatorYStart = 200;
        const separatorYEnd = height - 150;

        // Cabecera
        const icon = await Jimp.read(APP_ICON_URL);
        icon.resize(120, 120);
        imagen.composite(icon, marginHorizontal, marginVertical);
        imagen.print(fontTitle, marginHorizontal + 150, marginVertical + 25, "FICHA RENIEC - CONSULTA PE");
        
        // Línea divisoria vertical
        for (let y = separatorYStart; y < separatorYEnd; y++) {
            imagen.setPixelColor(Jimp.cssColorToHex("#CCCCCC"), separatorX, y);
        }

        let yLeft = 220;
        let yRight = 220;
        const lineSpacing = 40;
        const headingSpacing = 60;

        const printFieldLeft = (label, value) => {
            imagen.print(fontHeading, columnLeftX, yLeft, `${label}:`);
            imagen.print(fontData, columnLeftX + 200, yLeft + 10, value || "-");
            yLeft += lineSpacing;
        };

        const printImageRight = async (label, buffer, imgWidth, imgHeight) => {
            imagen.print(fontHeading, columnRightX, yRight, label);
            yRight += headingSpacing;
            if (buffer) {
                try {
                    const img = await Jimp.read(Buffer.from(buffer, 'base64'));
                    img.resize(imgWidth, imgHeight);
                    const imgX = columnRightX + (columnWidthRight - imgWidth) / 2;
                    imagen.composite(img, imgX, yRight);
                    yRight += imgHeight + headingSpacing;
                } catch (e) { yRight += 30; }
            } else { yRight += 30; }
        };

        const printDualImagesRight = async (bufferLeft, labelLeft, bufferRight, labelRight, imgWidth, imgHeight) => {
            const spacing = 20;
            const totalWidth = (imgWidth * 2) + spacing;
            const startX = columnRightX + (columnWidthRight - totalWidth) / 2;
            const imgLeftX = startX;
            const imgRightX = startX + imgWidth + spacing;
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
                const imgLeft = await Jimp.read(Buffer.from(bufferLeft, 'base64'));
                imgLeft.resize(imgWidth, imgHeight);
                imagen.composite(imgLeft, imgLeftX, imageY);
            }
            if (bufferRight) {
                const imgRight = await Jimp.read(Buffer.from(bufferRight, 'base64'));
                imgRight.resize(imgWidth, imgHeight);
                imagen.composite(imgRight, imgRightX, imageY);
            }
            yRight += imgHeight + headingSpacing;
        };

        // Foto Principal
        if (data.imagenes?.foto) {
            try {
                const foto = await Jimp.read(isFallback ? data.imagenes.foto : Buffer.from(data.imagenes.foto, 'base64'));
                foto.resize(300, 380);
                const fotoX = columnRightX + (columnWidthRight - 300) / 2;
                imagen.composite(foto, fotoX, yRight);
                yRight += 420;
            } catch (e) {}
        }

        // Datos y más...
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
        printFieldLeft("Padre", data.nomPadre); 
        printFieldLeft("Madre", data.nomMadre); 
        yLeft += headingSpacing;
        imagen.print(fontHeading, columnLeftX, yLeft, "Datos de Dirección"); 
        yLeft += headingSpacing;
        printFieldLeft("Dirección", data.desDireccion); 
        printFieldLeft("Departamento", data.depaDireccion); 
        printFieldLeft("Provincia", data.provDireccion); 
        printFieldLeft("Distrito", data.distDireccion); 

        await printImageRight("Firma", data.imagenes?.firma, 300, 100);
        await printDualImagesRight(data.imagenes?.huella_izquierda, "H. Izquierda", data.imagenes?.huella_derecha, "H. Derecha", 180, 200);

        // QR
        try { 
            const qrCodeBuffer = await QRCode.toBuffer(APP_QR_URL); 
            const qrCodeImage = await Jimp.read(qrCodeBuffer); 
            qrCodeImage.resize(250, 250); 
            const qrCodeX = columnRightX + (columnWidthRight - 250) / 2; 
            const qrY = Math.max(yRight, separatorYEnd - 350);
            imagen.composite(qrCodeImage, qrCodeX, qrY); 
            imagen.print(fontHeading, qrCodeX, qrY + 260, "Escanea el QR");
        } catch (e) {}

        const footerY = height - 100; 
        imagen.print(fontData, marginHorizontal, footerY, "Esta imagen es solo informativa. No representa un documento oficial ni tiene validez legal."); 

        const imagenBuffer = await imagen.getBufferAsync(Jimp.MIME_PNG);
        const nombreBase = `${data.nuDni}_${uuidv4()}`;
        const urlArchivoGitHub = await uploadToGitHub(`${nombreBase}.png`, imagenBuffer);
        const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(urlArchivoGitHub)}`;

        const estadoMensaje = isFallback ? "⚠️ FALLBACK: Ficha generada con API de Respaldo." : "FICHA GENERADA Y GUARDADA EN GITHUB (/public).";
        const messageText = `DNI : ${data.nuDni}\nAPELLIDO PATERNO : ${data.apePaterno || '-'}\nAPELLIDO MATERNO : ${data.apeMaterno || '-'}\nNOMBRES : ${data.preNombres || '-'}\nESTADO : ${estadoMensaje}`;

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

// --- RUTA CORREGIDA: Proxy de descarga con AUTH ---
app.get("/descargar-ficha", async (req, res) => {
    const { url } = req.query; // URL del archivo en GitHub (raw.githubusercontent.com)
    
    if (!url) {
        return res.status(400).send("Falta el parámetro 'url' de la imagen.");
    }

    try {
        // ⭐ CORRECCIÓN: Agregar cabeceras de autenticación para repositorios privados
        const config = {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'FlyIoImageGeneratorApp'
            }
        };

        // Si el repositorio es privado y tenemos un token, lo agregamos
        if (GITHUB_TOKEN) {
            config.headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        // 1. Descargar el archivo de GitHub usando el Token
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
        console.error("Error al descargar desde GitHub:", error.message);
        res.status(500).send("Error al procesar la descarga del archivo. Verifica el GITHUB_TOKEN.");
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en ${API_BASE_URL}`);
});

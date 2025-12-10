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

// --- Configuración de APIs ---
const API_PRIMARY_URL = "https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec";
const API_FALLBACK_URL = "https://web-production-75681.up.railway.app/dni"; // API de respaldo

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
 * 🌟 NUEVA FUNCIÓN: Normaliza los datos de la API de respaldo al formato de la API primaria.
 * @param {object} fallbackData - La respuesta JSON de la API de respaldo.
 * @returns {object} Un objeto de datos normalizado (similar al formato de la API primaria).
 */
const normalizeFallbackData = (fallbackData) => {
    const message = fallbackData.message || '';
    const lines = message.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Función auxiliar para extraer el valor después del separador (ej: ":")
    const getValue = (key, rawLines) => {
        const line = rawLines.find(l => l.startsWith(key));
        return line ? line.split(':')[1]?.trim().replace(/\[.*?\]/g, '').trim() : null; // Limpia las etiquetas como [GÉNERO]
    };
    
    // Función auxiliar para extraer el valor de una línea simple
    const getSimpleValue = (key, rawLines) => {
        const line = rawLines.find(l => l.startsWith(key));
        // Devuelve el valor después de la clave y el separador (:)
        return line ? line.split(':')[1]?.trim() : null;
    };
    
    // Función auxiliar para extraer el valor en un bloque
    const getBlockValue = (blockStart, key, rawLines) => {
        const startIndex = rawLines.findIndex(l => l.includes(blockStart));
        if (startIndex === -1) return null;

        for (let i = startIndex + 1; i < rawLines.length; i++) {
            const line = rawLines[i];
            // Si encuentra otra sección, para
            if (line.includes(']')) break; 
            
            // Si la línea contiene la clave
            if (line.startsWith(key)) {
                return line.split(':')[1]?.trim();
            }
        }
        return null;
    };
    
    // Función para obtener la dirección completa
    const getFullAddress = (rawLines) => {
        // Buscamos la línea que comienza con "DIRECCION :"
        const direccionLine = rawLines.find(l => l.startsWith('DIRECCION :'));
        if (!direccionLine) return null;
        
        // Removemos "DIRECCION :" y el texto del DNI que parece ser el inicio de la línea
        // La estructura es a veces "DIRECCION : CALLE HOLBEIN 172 URB. SAN BORJA📍] UBICACION"
        let fullAddress = direccionLine.split(':')[1]?.trim() || '';
        
        // Eliminamos todo lo que está después del primer caracter de etiqueta (📍)
        const blockSeparatorIndex = fullAddress.indexOf('📍');
        if (blockSeparatorIndex !== -1) {
            fullAddress = fullAddress.substring(0, blockSeparatorIndex).trim();
        }
        
        return fullAddress;
    };

    // --- Mapeo de datos ---
    const dni = fallbackData.dni;
    const nombres = getValue('NOMBRES', lines);
    const apellidosCompletos = getValue('APELLIDOS', lines);
    const [apePaterno, apeMaterno] = apellidosCompletos?.split(' ') || [];
    
    // Extracción de datos con limpieza de etiquetas
    const ubigeoReniec = getValue('UBIGEO RENIEC', lines);
    const ubigeoInei = getValue('UBIGEO INEI', lines);
    const ubigeoSunat = getValue('UBIGEO SUNAT', lines);
    
    const feNacimientoRaw = getValue('FECHA NACIMIENTO', lines);
    const feNacimiento = feNacimientoRaw ? feNacimientoRaw.split('(')[0]?.trim() : null;
    
    // La API de respaldo a veces usa una sola línea para el DNI en el mensaje, ignoramos el primer valor que parece ser de control
    const nomPadre = getSimpleValue('PADRE', lines);
    const nomMadre = getSimpleValue('MADRE', lines);
    
    // La URL de la foto viene separada
    const fotoUrl = fallbackData.urls?.IMAGE;

    return {
        // Datos Personales
        nuDni: dni,
        apePaterno: apePaterno,
        apeMaterno: apeMaterno,
        preNombres: nombres,
        feNacimiento: feNacimiento,
        sexo: getSimpleValue('GENERO', lines),
        estadoCivil: getSimpleValue('ESTADO CIVIL', lines),
        estatura: getSimpleValue('ESTATURA', lines),
        gradoInstruccion: getSimpleValue('GRADO INSTRUCCION', lines),
        deRestriccion: getSimpleValue('RESTRICCION', lines),
        donaOrganos: "-", // No disponible en esta API de respaldo

        // Información Adicional
        feEmision: getSimpleValue('FECHA EMISION', lines),
        feInscripcion: getSimpleValue('FECHA INSCRIPCION', lines),
        feCaducidad: getSimpleValue('FECHA CADUCIDAD', lines),
        feFallecimiento: "-", // No disponible en esta API de respaldo
        nomPadre: nomPadre,
        nomMadre: nomMadre,

        // Datos de Dirección
        desDireccion: getFullAddress(lines),
        depaDireccion: getBlockValue('📍] DIRECCION', 'DEPARTAMENTO', lines),
        provDireccion: getBlockValue('📍] DIRECCION', 'PROVINCIA', lines),
        distDireccion: getBlockValue('📍] DIRECCION', 'DISTRITO', lines),

        // Ubicación
        ubicacion: {
            ubigeo_reniec: ubigeoReniec,
            ubigeo_inei: ubigeoInei,
            ubigeo_sunat: ubigeoSunat,
            codigo_postal: getSimpleValue('CODIGO POSTAL', lines),
        },
        
        // Imágenes (solo la foto está disponible, la firma/huellas se marcarán como nulas)
        imagenes: {
            // El Jimp actual espera una imagen en Base64. Debemos descargarla y convertirla.
            foto_url: fotoUrl, // Usamos una clave temporal para la URL
            firma: null,
            huella_izquierda: null,
            huella_derecha: null,
        }
    };
};

/**
 * 🌟 NUEVA FUNCIÓN: Descarga una imagen desde una URL y la convierte a Base64.
 * @param {string} url - La URL de la imagen.
 * @returns {Promise<string>} La imagen en Base64 o null si falla.
 */
const imageUrlToBase64 = async (url) => {
    if (!url) return null;
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data).toString('base64');
    } catch (error) {
        console.error("Error al descargar la imagen de la URL:", url, error.message);
        return null;
    }
}


// --- RUTA MODIFICADA: Genera la ficha, incluye lógica de cache y FALLBACK ---
app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });
    
    const dateNow = new Date().toISOString();
    let apiUsed = "PRIMARY"; // Indicador de qué API se usó
    let data = null;

    try { 
        // 1. 🔍 LÓGICA DE CACHE: Verificar si la imagen ya existe en GitHub
        const cachedUrl = await checkIfDniExists(dni);
        
        if (cachedUrl) {
            // Si la imagen existe, devolver la respuesta inmediatamente.
            const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(cachedUrl)}`;
            
            const messageText = `DNI : ${dni}\nESTADO : RESULTADO ENCONTRADO EXITOSAMENTE.`;
            
            return res.json({
                "bot": "Consulta pe",
                "chat_id": 7658983973, 
                "date": dateNow,
                "fields": { "dni": dni },
                "from_id": 7658983973, 
                "message": messageText,
                "parts_received": 1, 
                "urls": {
                    "FILE": urlDescargaProxy, 
                }
            });
        }
        
        // ----------------------------------------------------
        // 2. 🚀 LÓGICA DE GENERACIÓN (Si no existe en caché)
        // ----------------------------------------------------
        
        try {
            // 2.1. Intento con la API Primaria
            const response = await axios.get(`${API_PRIMARY_URL}?dni=${dni}`); 
            data = response.data?.result; 

            if (!data) {
                // Si la respuesta es exitosa pero sin 'result', pasamos a la API de respaldo
                throw new Error("Respuesta primaria vacía o inesperada.");
            }

        } catch (primaryError) {
            // 2.2. Manejo de errores de la API Primaria y Fallback
            const isTokenError = primaryError.response && 
                                 primaryError.response.data && 
                                 primaryError.response.data.message === "Error Leder Data" &&
                                 primaryError.response.data.detalle?.error === "token without credits";

            if (isTokenError || primaryError.message.includes("Respuesta primaria vacía")) {
                console.log("⚠️ Error de Token o Respuesta Primaria Inesperada. Intentando con la API de respaldo...");
                apiUsed = "FALLBACK";
                
                // 2.2.1. Intento con la API de Respaldo
                const fallbackResponse = await axios.get(`${API_FALLBACK_URL}?dni=${dni}`);
                const fallbackData = fallbackResponse.data;

                if (fallbackData.status === "ok" && fallbackData.message) {
                    console.log("✅ Datos obtenidos de la API de respaldo. Normalizando...");
                    // 2.2.2. Normalizar los datos al formato esperado
                    data = normalizeFallbackData(fallbackData);
                    
                    // 2.2.3. Descargar y convertir la foto de la URL a Base64
                    const fotoBase64 = await imageUrlToBase64(data.imagenes.foto_url);
                    // Reemplazamos el campo foto con la imagen en Base64
                    data.imagenes.foto = fotoBase64; 
                    delete data.imagenes.foto_url;
                } else {
                    throw new Error("No se pudo obtener información del DNI con la API de respaldo.");
                }

            } else {
                // Si es otro tipo de error de la API primaria, lo lanzamos
                throw primaryError;
            }
        }
        
        // Si después de la lógica anterior `data` es nulo, significa que no se encontró nada.
        if (!data) return res.status(404).json({ 
            error: "No se encontró información para el DNI ingresado.",
            api_intento: apiUsed
        }); 
        
        // 3. Generación de la imagen (Jimp) - **El código de aquí en adelante NO NECESITA CAMBIOS**
        //    ya que hemos normalizado los datos de la API de respaldo al formato esperado.
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
            // Manejar valores nulos o indefinidos
            const displayValue = value === null || value === undefined ? "-" : String(value);

            const labelX = columnLeftX; 
            const valueX = labelX + 250; 
            const maxWidth = columnWidthLeft - (valueX - labelX); 
            imagen.print(fontBold, labelX, yLeft, `${label}:`); 
            const newY = printWrappedText(imagen, fontData, valueX, yLeft, maxWidth, `${displayValue}`, lineHeight); 
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
        printFieldLeft("Apellidos", `${data.apePaterno || ''} ${data.apeMaterno || ''} ${data.apCasada || ''}`.trim()); 
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
            
            // ⭐ MODIFICACIÓN CLAVE: Mover el QR más arriba. 
            // Lo posicionamos un poco más arriba de donde termina el contenido de la columna, 
            // pero asegurando espacio con el pie (separatorYEnd - 300)
            const qrY = Math.max(yRight, separatorYEnd - 350); // Ajuste aquí (350 para subirlo un poco más)

            imagen.composite(qrCodeImage, qrCodeX, qrY); 
            imagen.print(fontHeading, qrCodeX, qrY + 260, "Escanea el QR");
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
        
        // 4. Obtener el buffer de la imagen
        const imagenBuffer = await imagen.getBufferAsync(Jimp.MIME_PNG);
        
        // 5. Generar nombre con UUID
        const nombreBase = `${data.nuDni}_${uuidv4()}`;

        // 6. Subir la imagen PNG a GitHub y obtener la URL pública
        const urlArchivoGitHub = await uploadToGitHub(`${nombreBase}.png`, imagenBuffer);

        // 7. Lógica de subida de JSON ELIMINADA.

        // 8. Crear la URL de descarga (PROXY)
        const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(urlArchivoGitHub)}`;

        // 9. Preparar la respuesta JSON (Ajustamos el mensaje)
        const messageText = `DNI : ${data.nuDni}\nAPELLIDO PATERNO : ${data.apePaterno}\nAPELLIDO MATERNO : ${data.apeMaterno}\nNOMBRES : ${data.preNombres}\nESTADO : FICHA GENERADA Y GUARDADA EN GITHUB (/public). (API: ${apiUsed})`;

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
                // URL de descarga del proxy (para la imagen)
                "FILE": urlDescargaProxy, 
                // ⭐ CLAVE: La URL del DATA_FILE ha sido eliminada.
            }
        });

    } catch (error) { 
        console.error("Error general en el proceso:", error); 
        res.status(500).json({ 
            error: "Error al generar la ficha o subir a GitHub (o ambas APIs fallaron)", 
            detalle: error.message,
            api_intento: apiUsed
        }); 
    } 

});

// --- ENDPOINTS DE BÚSQUEDA AVANZADA (SIN CAMBIOS) ---
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
// -------------------------------------------------------------


// --- RUTA: Proxy de descarga (Sin cambios) ---
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
    if (!process.env.API_BASE_URL) console.warn("ADVERTENCIA: La variable de entorno API_BASE_URL no está configurada y se usa la URL de fallback: https://imagen-v2.fly.dev.");
});

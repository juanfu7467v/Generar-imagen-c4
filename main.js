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
    data.provDireccion = extractValue("PROVINCIA : LIMA") ? extractValue("PROVINCIA : LIMA").split('LIMA')[1]?.trim() : (extractValue("PROVINCIA")?.split('LIMA')[1]?.trim() || extractValue("PROVINCIA"));
    data.distDireccion = extractValue("DISTRITO : JESUS MARIA") ? extractValue("DISTRITO : JESUS MARIA").split('JESUS MARIA')[1]?.trim() : (extractValue("DISTRITO")?.split('JESUS MARIA')[1]?.trim() || extractValue("DISTRITO"));
    data.desDireccion = extractValue("DIRECCION");

    // Ubicación
    data.ubicacion.ubigeo_reniec = extractValue("UBIGEO RENIEC");
    data.ubicacion.ubigeo_inei = extractValue("UBIGEO INEI");
    data.ubicacion.ubigeo_sunat = extractValue("UBIGEO SUNAT");
    data.ubicacion.codigo_postal = extractValue("CODIGO POSTAL");
    
    // Devolvemos el objeto formateado.
    return data;
};

/**
 * Función para descargar una imagen desde una URL y devolverla como base64,
 * para mantener la compatibilidad con el código de Jimp.
 * @param {string} url - La URL de la imagen.
 * @returns {Promise<string|null>} Base64 de la imagen o null si falla.
 */
const downloadImageAsBase64 = async (url) => {
    try {
        if (!url || !url.startsWith('http')) return null;

        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);
        return imageBuffer.toString('base64');
    } catch (error) {
        console.warn(`Error al descargar imagen desde URL de respaldo ${url}:`, error.message);
        return null;
    }
};

// --- RUTA MODIFICADA: Genera la ficha, incluye lógica de cache y FALLBACK ---
app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });
    
    const dateNow = new Date().toISOString();
    let data = null;
    let isFallback = false;

    try { 
        // 1. 🔍 LÓGICA DE CACHE: Verificar si la imagen ya existe en GitHub
        const cachedUrl = await checkIfDniExists(dni);
        
        if (cachedUrl) {
            // Si la imagen existe, devolver la respuesta inmediatamente.
            const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(cachedUrl)}`;
            
            // ⭐ CAMBIO SOLICITADO AQUÍ (Respuesta de caché)
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
        
        // --- Intento de API Primaria ---
        try {
            console.log(`Intentando con API Primaria: ${PRIMARY_API_URL}`);
            const response = await axios.get(`${PRIMARY_API_URL}?dni=${dni}`); 
            // La API Primaria devuelve el resultado en `response.data.result`
            data = response.data?.result;
            
            // Si la API primaria devuelve un error específico (aunque sea con status 200/500)
            if (response.data?.success === false && response.data?.message === "Error Leder Data" && response.data?.detalle?.error === "token without credits") {
                throw new Error("TOKEN_CREDITS_ERROR");
            }
            
            if (!data) {
                // Si la API primaria no devuelve datos válidos (ej. DNI no encontrado, error desconocido)
                throw new Error("No se encontró información para el DNI en la API principal.");
            }

        } catch (error) {
            
            // Si el error es el específico de "token without credits", usamos la API de respaldo.
            if (error.message === "TOKEN_CREDITS_ERROR" || (axios.isAxiosError(error) && error.response?.data?.detalle?.error === "token without credits")) {
                console.log("⚠️ API Primaria falló por 'token without credits'. Usando API de Respaldo.");
                isFallback = true;
                
                // --- Intento de API Secundaria (Fallback) ---
                const fallbackResponse = await axios.get(`${SECONDARY_API_URL}?dni=${dni}`);
                const fallbackData = fallbackResponse.data;
                
                // Formatear los datos complejos de la API de respaldo.
                data = handleSecondApiData(fallbackData);
                
                if (!data) {
                     // Si la API de respaldo no funciona o el DNI no existe.
                    throw new Error("API de Respaldo no devolvió información válida o DNI no encontrado.");
                }

                // Descargar la foto de la URL y convertirla a base64 para la compatibilidad con Jimp.
                if (data.imagenes.foto) {
                    data.imagenes.foto = await downloadImageAsBase64(data.imagenes.foto);
                }

            } else {
                // Relanzar cualquier otro error de la API primaria (conexión, 404, etc.)
                console.error("Error al consultar API Primaria (no es error de token):", error.message);
                throw error;
            }
        }
        
        // En este punto, 'data' contiene la información de la API primaria o de la API de respaldo.
        if (!data) return res.status(404).json({ 
            error: "No se encontró información para el DNI ingresado en ninguna de las APIs." 
        }); 
        
        // 3. Generación de la imagen (Jimp) - Mismo código
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
            // Si es la API de respaldo, data.imagenes.foto ya es base64 gracias a downloadImageAsBase64
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

        // 7. Crear la URL de descarga (PROXY)
        const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(urlArchivoGitHub)}`;

        // 8. Preparar la respuesta JSON (Ajustamos el mensaje)
        const estadoMensaje = isFallback ? "⚠️ FALLBACK: Ficha generada con API de Respaldo." : "FICHA GENERADA Y GUARDADA EN GITHUB (/public).";
        const messageText = `DNI : ${data.nuDni}\nAPELLIDO PATERNO : ${data.apePaterno || '-'}\nAPELLIDO MATERNO : ${data.apeMaterno || '-'}\nNOMBRES : ${data.preNombres || '-'}\nESTADO : ${estadoMensaje}`;

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

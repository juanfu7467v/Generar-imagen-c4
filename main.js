const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; 

// 🎯 CLAVE: Definir la URL base pública
const API_BASE_URL = process.env.API_BASE_URL || "https://gdni-imagen-v2.fly.dev";

// --- URLs de las APIs ---
const PRIMARY_API_URL = "https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec";
const SECONDARY_API_URL = "https://web-production-75681.up.railway.app/dni";

// --- Configuración de GitHub ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; 
const GITHUB_BRANCH = "main"; 

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";


/**
 * 🆕 FUNCIÓN DE CACHE
 */
const checkIfDniExists = async (dni) => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        console.error("Error de configuración para la caché: GITHUB_TOKEN o GITHUB_REPO no están definidos.");
        return null;
    }

    const [owner, repo] = GITHUB_REPO.split('/');
    if (!owner || !repo) return null;

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/public`;

    const config = {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            'User-Agent': 'FlyIoImageGeneratorApp'
        }
    };

    try {
        const response = await axios.get(apiUrl, config);
        const files = response.data;
        
        const existingFile = files.find(file => 
            file.type === 'file' && 
            file.name.startsWith(`${dni}_`) && 
            file.name.endsWith('.png')
        );

        if (existingFile) {
            console.log(`✅ Ficha de DNI ${dni} encontrada en caché: ${existingFile.name}`);
            return `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/public/${existingFile.name}`;
        }

        console.log(`❌ Ficha de DNI ${dni} NO encontrada en caché. Se procederá a generar.`);
        return null;

    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn("ADVERTENCIA: Carpeta 'public' no encontrada.");
            return null;
        }
        console.error("Error al verificar la caché de GitHub:", error.message);
        return null; 
    }
};


/**
 * Sube un buffer de imagen PNG a GitHub
 */
const uploadToGitHub = async (fileName, imageBuffer) => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        throw new Error("Error de configuración: GITHUB_TOKEN o GITHUB_REPO no están definidos.");
    }

    const [owner, repo] = GITHUB_REPO.split('/');
    const filePath = `public/${fileName}`; 
    const contentBase64 = imageBuffer.toString('base64');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const publicUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/${filePath}`;

    const data = {
        message: `feat: Ficha generada para DNI ${fileName.split('_')[0]}`,
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

    await axios.put(apiUrl, data, config);
    return publicUrl;
};

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

const handleSecondApiData = (rawData) => {
    if (rawData.status !== "ok" || !rawData.message) {
        return null;
    }

    const message = rawData.message;
    const lines = message.split('\n');
    const data = {
        nuDni: rawData.dni,
        imagenes: {
            foto: rawData.urls.IMAGE,
            firma: null,
            huella_derecha: null,
            huella_izquierda: null,
        },
        apePaterno: null, apeMaterno: null, preNombres: null, feNacimiento: null,
        sexo: null, estadoCivil: null, estatura: null, gradoInstruccion: null,
        deRestriccion: null, donaOrganos: "-", feEmision: null, feInscripcion: null,
        feCaducidad: null, feFallecimiento: null, nomPadre: null, nomMadre: null,
        desDireccion: null, depaDireccion: null, provDireccion: null, distDireccion: null,
        apCasada: null, ubicacion: { ubigeo_reniec: null, ubigeo_inei: null, ubigeo_sunat: null, codigo_postal: null }
    };

    const extractValue = (label) => {
        const line = lines.find(l => l.startsWith(label));
        if (line) {
            const parts = line.split(':');
            if (parts.length > 1) return parts.slice(1).join(':').trim();
        }
        return null;
    };

    const apellidosLine = extractValue("APELLIDOS");
    if (apellidosLine) {
        const nombresCompleto = extractValue("NOMBRES");
        const partesApellidos = apellidosLine.split(' ');
        data.apePaterno = partesApellidos[0] || null;
        data.apeMaterno = partesApellidos[1] || null;
        data.preNombres = nombresCompleto;
    }

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
    data.desDireccion = extractValue("DIRECCION");

    return data;
};

const downloadImageAsBase64 = async (url) => {
    try {
        if (!url || !url.startsWith('http')) return null;
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data).toString('base64');
    } catch (error) {
        return null;
    }
};

app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });
    
    const dateNow = new Date().toISOString();
    let data = null;
    let isFallback = false;

    try { 
        const cachedUrl = await checkIfDniExists(dni);
        
        if (cachedUrl) {
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
                "urls": { "FILE": urlDescargaProxy }
            });
        }
        
        try {
            const response = await axios.get(`${PRIMARY_API_URL}?dni=${dni}`); 
            data = response.data?.result;
            if (response.data?.success === false && response.data?.message === "Error Leder Data") {
                throw new Error("TOKEN_CREDITS_ERROR");
            }
            if (!data) throw new Error("No data");
        } catch (error) {
            isFallback = true;
            const fallbackResponse = await axios.get(`${SECONDARY_API_URL}?dni=${dni}`);
            data = handleSecondApiData(fallbackResponse.data);
            if (!data) throw new Error("Fallback failed");
            if (data.imagenes.foto) data.imagenes.foto = await downloadImageAsBase64(data.imagenes.foto);
        }
        
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
            imagen.composite(mainIcon, (imagen.bitmap.width - mainIcon.bitmap.width) / 2, 50); 
        } catch (e) { imagen.print(fontTitle, marginHorizontal, 50, "Consulta Ciudadana"); } 
        
        const separatorYEnd = imagen.bitmap.height - 150; 
        new Jimp(2, separatorYEnd - (yStartContent - 50), 0xFFFFFFFF, (err, line) => { 
            if (!err) imagen.composite(line, imagen.bitmap.width / 2, yStartContent - 50); 
        }); 
        
        if (data.imagenes?.foto) { 
            const bufferFoto = Buffer.from(data.imagenes.foto, 'base64'); 
            const foto = await Jimp.read(bufferFoto); 
            foto.resize(350, 400); 
            imagen.composite(foto, columnRightX + (columnWidthRight - 350) / 2, yStartContent); 
            yRight += 400 + headingSpacing; 
        } 
        
        const printFieldLeft = (label, value) => { 
            imagen.print(fontBold, columnLeftX, yLeft, `${label}:`); 
            yLeft = printWrappedText(imagen, fontData, columnLeftX + 250, yLeft, columnWidthLeft - 250, `${value || "-"}`, lineHeight) - 10; 
        }; 

        imagen.print(fontHeading, columnLeftX, yLeft, "Datos Personales"); yLeft += headingSpacing; 
        printFieldLeft("DNI", data.nuDni); 
        printFieldLeft("Apellidos", `${data.apePaterno} ${data.apeMaterno}`.trim()); 
        printFieldLeft("Prenombres", data.preNombres); 
        printFieldLeft("Nacimiento", data.feNacimiento); 
        printFieldLeft("Sexo", data.sexo); 
        
        yLeft += headingSpacing;
        imagen.print(fontHeading, columnLeftX, yLeft, "Dirección"); yLeft += headingSpacing; 
        printFieldLeft("Dirección", data.desDireccion); 

        // Firmas y Huellas simplificadas para el ejemplo
        if(data.imagenes?.firma) {
            const firma = await Jimp.read(Buffer.from(data.imagenes.firma, 'base64'));
            firma.resize(300, 100);
            imagen.print(fontHeading, columnRightX, yRight, "Firma"); yRight += 40;
            imagen.composite(firma, columnRightX + (columnWidthRight - 300)/2, yRight); yRight += 120;
        }

        const qrCodeBuffer = await QRCode.toBuffer(APP_QR_URL); 
        const qrCodeImage = await Jimp.read(qrCodeBuffer); 
        qrCodeImage.resize(250, 250); 
        imagen.composite(qrCodeImage, columnRightX + (columnWidthRight - 250) / 2, separatorYEnd - 300); 

        const imagenBuffer = await imagen.getBufferAsync(Jimp.MIME_PNG);
        const urlArchivoGitHub = await uploadToGitHub(`${data.nuDni}_${uuidv4()}.png`, imagenBuffer);
        const urlDescargaProxy = `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(urlArchivoGitHub)}`;

        res.json({
            "bot": "Consulta pe",
            "chat_id": 7658983973, 
            "date": dateNow,
            "fields": { "dni": data.nuDni },
            "from_id": 7658983973, 
            "message": `DNI : ${data.nuDni}\nESTADO : FICHA GENERADA EXITOSAMENTE.`,
            "parts_received": 1, 
            "urls": { "FILE": urlDescargaProxy }
        });

    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    } 
});

// --- RUTA CORREGIDA: Proxy de descarga con Headers para GitHub ---
app.get("/descargar-ficha", async (req, res) => {
    const { url } = req.query; 
    
    if (!url) return res.status(400).send("Falta la URL.");

    try {
        // 🎯 IMPORTANTE: Agregamos User-Agent para que GitHub no bloquee la petición
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const imageBuffer = Buffer.from(response.data);
        const fileName = url.split('/').pop(); 

        // 🎯 Cabeceras para forzar visualización y descarga
        res.set({
            'Content-Disposition': `inline; filename="${fileName}"`,
            'Content-Type': 'image/png',
            'Content-Length': imageBuffer.length,
            'Cache-Control': 'no-cache'
        });

        res.send(imageBuffer);

    } catch (error) {
        console.error("Error en proxy:", error.message);
        res.status(500).send("Error al obtener la imagen de GitHub.");
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Servidor en puerto ${PORT}`);
});

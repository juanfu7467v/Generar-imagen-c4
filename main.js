const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Configuración de CORS - Permitir acceso desde cualquier origen
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Manejar preflight requests
app.options('*', cors());

// URL base pública
const API_BASE_URL = process.env.API_BASE_URL || "https://imagen-v2.fly.dev";

// --- URLs de las APIs (Solo Primaria) ---
// Cargar desde variable de entorno por seguridad
const PRIMARY_API_URL = process.env.PRIMARY_API_URL || "https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec";

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

// --- RUTA PRINCIPAL: Genera la ficha ---
app.get("/generar-ficha", cors(), async (req, res) => {
    // Configurar headers CORS explícitamente para esta ruta
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });
    
    const dateNow = new Date().toISOString();

    try {
        // 1. Obtener datos de la API Primaria
        const response = await axios.get(`${PRIMARY_API_URL}?dni=${dni}`);
        const data = response.data?.result;
        
        if (!data) {
            return res.status(404).json({ error: "No se encontró información para el DNI en la API principal." });
        }
        
        // 2. Configuración de lienzo Jimp
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
        
        const printFieldLeft = (label, value) => {
            const labelX = columnLeftX;
            const valueX = labelX + 250;
            const maxWidth = columnWidthLeft - (valueX - labelX);
            imagen.print(fontBold, labelX, yLeft, `${label}:`);
            const newY = printWrappedText(imagen, fontData, valueX, yLeft, maxWidth, `${value || "-"}`, lineHeight);
            yLeft = newY - 10;
        };

        const printImageRight = async (label, base64Image, targetWidth, targetHeight) => {
            if (base64Image) {
                const bufferImage = Buffer.from(base64Image, 'base64');
                const img = await Jimp.read(bufferImage);
                img.resize(targetWidth, targetHeight);
                const imgX = columnRightX + (columnWidthRight - targetWidth) / 2;
                imagen.print(fontHeading, columnRightX, yRight, label);
                yRight += headingSpacing;
                imagen.composite(img, imgX, yRight);
                yRight += targetHeight + headingSpacing;
            }
        };

        const printDualImagesRight = async (base64ImageLeft, labelLeft, base64ImageRight, labelRight, targetWidth, targetHeight) => {
            if (!base64ImageLeft && !base64ImageRight) return;
            const separation = 50;
            const totalWidth = targetWidth * 2 + separation;
            const startX = columnRightX + (columnWidthRight - totalWidth) / 2;
            
            const labelY = yRight;
            if (base64ImageLeft) {
                const tw = Jimp.measureText(fontHeading, labelLeft);
                imagen.print(fontHeading, startX + (targetWidth - tw) / 2, labelY, labelLeft);
            }
            if (base64ImageRight) {
                const tw = Jimp.measureText(fontHeading, labelRight);
                imagen.print(fontHeading, (startX + targetWidth + separation) + (targetWidth - tw) / 2, labelY, labelRight);
            }
            yRight += headingSpacing;

            if (base64ImageLeft) {
                const img = await Jimp.read(Buffer.from(base64ImageLeft, 'base64'));
                img.resize(targetWidth, targetHeight);
                imagen.composite(img, startX, yRight);
            }
            if (base64ImageRight) {
                const img = await Jimp.read(Buffer.from(base64ImageRight, 'base64'));
                img.resize(targetWidth, targetHeight);
                imagen.composite(img, startX + targetWidth + separation, yRight);
            }
            yRight += targetHeight + headingSpacing;
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
        await printDualImagesRight(data.imagenes?.huella_izquierda, "H. Izquierda", data.imagenes?.huella_derecha, "H. Derecha", 180, 200);
        
        try {
            const qrCodeBuffer = await QRCode.toBuffer(APP_QR_URL);
            const qrCodeImage = await Jimp.read(qrCodeBuffer);
            qrCodeImage.resize(250, 250);
            const qrCodeX = columnRightX + (columnWidthRight - 250) / 2;
            const qrY = Math.max(yRight, separatorYEnd - 350);
            imagen.composite(qrCodeImage, qrCodeX, qrY);
            imagen.print(fontHeading, qrCodeX, qrY + 260, "Escanea el QR");
        } catch (e) {}
        
        const footerY = imagen.bitmap.height - 100;
        imagen.print(fontData, marginHorizontal, footerY, "Esta imagen es informativa. No representa un documento oficial.");
        
        // 4. Generar imagen en buffer (sin subir a GitHub)
        const imagenBuffer = await imagen.getBufferAsync(Jimp.MIME_PNG);
        const nombreArchivo = `ficha_${data.nuDni}_${uuidv4()}.png`;
        
        // Codificar la imagen en base64 para enviarla directamente
        const imagenBase64 = imagenBuffer.toString('base64');
        const urlDescargaDirecta = `${API_BASE_URL}/descargar-ficha-directa?filename=${encodeURIComponent(nombreArchivo)}`;
        
        // También mantener compatibilidad con la URL con parámetro base64
        const urlBase64 = `${API_BASE_URL}/descargar-ficha-base64?data=${encodeURIComponent(imagenBase64)}&filename=${encodeURIComponent(nombreArchivo)}`;

        res.json({
            "bot": "Consulta pe",
            "chat_id": 7658983973,
            "date": dateNow,
            "fields": { "dni": data.nuDni },
            "message": `DNI : ${data.nuDni}\nAPELLIDOS : ${data.apePaterno} ${data.apeMaterno}\nNOMBRES : ${data.preNombres}\nESTADO : FICHA GENERADA EXITOSAMENTE.`,
            "urls": { 
                "FILE": urlDescargaDirecta,
                "FILE_BASE64": urlBase64,
                "BASE64_DATA": imagenBase64 // Opcional: enviar base64 directamente
            },
            "metadata": {
                "generated_at": dateNow,
                "dni": data.nuDni,
                "filename": nombreArchivo
            }
        });

    } catch (error) {
        console.error("Error en generación de ficha:", error.message);
        res.status(500).json({ 
            error: "Error en el proceso", 
            detalle: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// --- Ruta para descargar ficha directamente desde base64 en memoria ---
app.get("/descargar-ficha-base64", cors(), async (req, res) => {
    // Configurar headers CORS explícitamente para esta ruta
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const { data, filename } = req.query;
    if (!data) return res.status(400).send("Falta el parámetro data (imagen en base64)");
    
    try {
        const imageBuffer = Buffer.from(data, 'base64');
        const fileName = filename || `ficha_${uuidv4()}.png`;
        
        res.set({
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Type': 'image/png',
            'Content-Length': imageBuffer.length
        });
        res.send(imageBuffer);
    } catch (e) {
        console.error("Error en descarga base64:", e.message);
        res.status(500).send("Error en generación de descarga");
    }
});

// --- Proxy de descarga (mantener compatibilidad) ---
app.get("/descargar-ficha", cors(), async (req, res) => {
    // Configurar headers CORS explícitamente para esta ruta
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const { url } = req.query;
    if (!url) return res.status(400).send("Falta la URL");
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        res.set({
            'Content-Disposition': `attachment; filename="ficha_${uuidv4()}.png"`,
            'Content-Type': 'image/png'
        });
        res.send(Buffer.from(response.data));
    } catch (e) {
        console.error("Error en descarga proxy:", e.message);
        res.status(500).send("Error en descarga");
    }
});

// --- Nueva ruta para descargar ficha generada en la misma sesión ---
// Esta ruta usaría un almacenamiento temporal en memoria o sesión
const fichasTemporales = new Map();

app.get("/descargar-ficha-directa", cors(), async (req, res) => {
    // Configurar headers CORS explícitamente para esta ruta
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const { filename, dni, session } = req.query;
    
    // En una implementación real, aquí recuperarías la imagen de almacenamiento temporal
    // Por simplicidad, devolvemos un mensaje instructivo
    res.json({
        message: "Esta ficha se genera bajo demanda",
        instruction: "Use la ruta /generar-ficha para crear y descargar una nueva ficha",
        note: "La imagen se genera en tiempo real y se envía en la respuesta como base64",
        alternative: "Utilice el campo 'BASE64_DATA' de la respuesta de /generar-ficha"
    });
});

// Ruta de verificación de salud
app.get("/health", cors(), (req, res) => {
    res.json({ 
        status: "ok", 
        message: "API funcionando correctamente",
        version: "1.0.0",
        features: {
            generacion_fichas: true,
            cors: true,
            cache_github: false,
            descarga_directa: true
        }
    });
});

// Ruta raíz
app.get("/", cors(), (req, res) => {
    res.json({ 
        message: "API de generación de fichas RENIEC",
        description: "Genera fichas de identificación a partir del DNI",
        version: "1.0.0",
        endpoints: {
            generar_ficha: "/generar-ficha?dni=TU_DNI",
            descargar_ficha_base64: "/descargar-ficha-base64?data=BASE64&filename=NOMBRE.png",
            descargar_ficha_proxy: "/descargar-ficha?url=URL_ARCHIVO",
            health: "/health"
        },
        configuracion: {
            cors: "habilitado para todos los orígenes",
            cache: "deshabilitado (sin guardado en GitHub)",
            primary_api: "configurable por variable de entorno PRIMARY_API_URL"
        },
        nota: "Las imágenes se generan en tiempo real y no se almacenan permanentemente"
    });
});

app.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor iniciado en http://${HOST}:${PORT}`);
    console.log(`🌐 URL base: ${API_BASE_URL}`);
    console.log(`🔗 CORS habilitado para todos los orígenes`);
    console.log(`🔧 PRIMARY_API_URL: ${PRIMARY_API_URL}`);
    console.log(`📝 Modo: Sin almacenamiento en GitHub (cache deshabilitado)`);
});

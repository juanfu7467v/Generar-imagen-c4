const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; 

// 🎯 URL base de tu aplicación
const API_BASE_URL = process.env.API_BASE_URL || "https://gdni-imagen-v2.fly.dev";

// --- Configuración de GitHub ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; 
const GITHUB_BRANCH = "main"; 

// --- URLs de las APIs ---
const PRIMARY_API_URL = "https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec";
const SECONDARY_API_URL = "https://web-production-75681.up.railway.app/dni";
const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";

/**
 * FUNCIÓN DE CACHE
 */
const checkIfDniExists = async (dni) => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) return null;
    const [owner, repo] = GITHUB_REPO.split('/');
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/public`;
    try {
        const response = await axios.get(apiUrl, {
            headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'FlyIoApp' }
        });
        const existingFile = response.data.find(file => 
            file.type === 'file' && file.name.startsWith(`${dni}_`) && file.name.endsWith('.png')
        );
        if (existingFile) {
            return `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/public/${existingFile.name}`;
        }
        return null;
    } catch (error) { return null; }
};

/**
 * SUBIR A GITHUB
 */
const uploadToGitHub = async (fileName, imageBuffer) => {
    const [owner, repo] = GITHUB_REPO.split('/');
    const filePath = `public/${fileName}`; 
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    await axios.put(apiUrl, {
        message: `Ficha DNI ${fileName}`,
        content: imageBuffer.toString('base64'),
        branch: GITHUB_BRANCH
    }, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'FlyIoApp' }
    });
    return `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/${filePath}`;
};

const generarMarcaDeAgua = async (imagen) => {
    const marcaAgua = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    for (let i = 0; i < imagen.bitmap.width; i += 200) { 
        for (let j = 0; j < imagen.bitmap.height; j += 100) { 
            const textImage = new Jimp(100, 50, 0x00000000); 
            textImage.print(font, 0, 0, "RENIEC"); 
            textImage.rotate(Math.random() * 30 - 15); 
            marcaAgua.composite(textImage, i, j, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 0.1, opacityDest: 1 }); 
        } 
    } 
    return marcaAgua; 
};

const printWrappedText = (image, font, x, y, maxWidth, text, lineHeight) => {
    const words = text.split(' ');
    let line = ''; let currentY = y;
    for (const word of words) { 
        const testLine = line.length === 0 ? word : line + ' ' + word; 
        if (Jimp.measureText(font, testLine) > maxWidth) { 
            image.print(font, x, currentY, line.trim()); 
            line = word + ' '; currentY += lineHeight; 
        } else { line = testLine + ' '; } 
    } 
    image.print(font, x, currentY, line.trim()); 
    return currentY + lineHeight; 
};

const handleSecondApiData = (rawData) => {
    if (rawData.status !== "ok") return null;
    const lines = rawData.message.split('\n');
    const extract = (label) => {
        const line = lines.find(l => l.startsWith(label));
        return line ? line.split(':').slice(1).join(':').trim() : null;
    };
    return {
        nuDni: rawData.dni,
        imagenes: { foto: rawData.urls.IMAGE, firma: null },
        apePaterno: extract("APELLIDOS")?.split(' ')[0],
        apeMaterno: extract("APELLIDOS")?.split(' ')[1],
        preNombres: extract("NOMBRES"),
        feNacimiento: extract("FECHA NACIMIENTO")?.split('(')[0].trim(),
        sexo: extract("GENERO")?.replace('📅] NACIMIENTO', '').trim(),
        desDireccion: extract("DIRECCION")
    };
};

app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta DNI" });
    
    try { 
        let data;
        const cachedUrl = await checkIfDniExists(dni);
        if (cachedUrl) {
            return res.json({
                bot: "Consulta pe",
                message: `DNI : ${dni}\nESTADO : ENCONTRADO EN CACHÉ.`,
                urls: { FILE: `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(cachedUrl)}` }
            });
        }
        
        try {
            const resp = await axios.get(`${PRIMARY_API_URL}?dni=${dni}`);
            data = resp.data?.result;
            if (!data) throw new Error();
        } catch {
            const resp = await axios.get(`${SECONDARY_API_URL}?dni=${dni}`);
            data = handleSecondApiData(resp.data);
            if (data?.imagenes.foto) {
                const imgResp = await axios.get(data.imagenes.foto, { responseType: 'arraybuffer' });
                data.imagenes.foto = Buffer.from(imgResp.data).toString('base64');
            }
        }

        if (!data) return res.status(404).json({ error: "No encontrado" });

        const imagen = await new Jimp(1080, 1920, "#003366");
        const fontH = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        const fontD = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        
        imagen.composite(await generarMarcaDeAgua(imagen), 0, 0);

        if (data.imagenes?.foto) {
            const foto = await Jimp.read(Buffer.from(data.imagenes.foto, 'base64'));
            foto.resize(350, 400);
            imagen.composite(foto, 600, 300);
        }

        let y = 350;
        imagen.print(fontH, 50, 300, "DATOS PERSONALES");
        const print = (l, v) => { imagen.print(fontD, 50, y, `${l}:`); imagen.print(fontD, 200, y, `${v || "-"}`); y += 40; };
        print("DNI", data.nuDni);
        print("APELLIDOS", `${data.apePaterno} ${data.apeMaterno}`);
        print("NOMBRES", data.preNombres);
        print("NACIDO", data.feNacimiento);
        print("SEXO", data.sexo);

        const qrBuffer = await QRCode.toBuffer(APP_QR_URL);
        const qrImg = await Jimp.read(qrBuffer);
        qrImg.resize(200, 200);
        imagen.composite(qrImg, 700, 1500);

        const buffer = await imagen.getBufferAsync(Jimp.MIME_PNG);
        const githubUrl = await uploadToGitHub(`${data.nuDni}_${uuidv4()}.png`, buffer);

        res.json({
            bot: "Consulta pe",
            message: `DNI : ${data.nuDni}\nESTADO : FICHA GENERADA.`,
            urls: { FILE: `${API_BASE_URL}/descargar-ficha?url=${encodeURIComponent(githubUrl)}` }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RUTA CRÍTICA: PROXY DE DESCARGA CON TOKEN ---
app.get("/descargar-ficha", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("No URL");

    try {
        const config = {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'FlyIoApp' }
        };

        // Si el repo es privado, necesitamos el token para descargar de raw.githubusercontent
        if (GITHUB_TOKEN) {
            config.headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        const response = await axios.get(url, config);
        
        res.set({
            'Content-Type': 'image/png',
            'Content-Length': response.data.length,
            'Cache-Control': 'public, max-age=86400'
        });

        res.send(response.data);
    } catch (error) {
        console.error("Error Proxy:", error.message);
        res.status(500).send("Error al descargar: El archivo aún no está disponible o el Token es inválido.");
    }
});

app.listen(PORT, HOST, () => console.log(`Servidor activo` ));

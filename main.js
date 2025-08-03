const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

// Cargar la imagen del logo de la RENIEC (asegúrate de tenerla en el mismo directorio)
const LOGO_RENEC_PATH = path.join(__dirname, "logo_reniec.png");

// Función mejorada para generar marcas de agua más realistas
const generarMarcaDeAgua = async (imagen) => {
  const marcaAgua = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
  const fontWatermark = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  const text = "RENIEC";

  // Crear patrón diagonal de marcas de agua más denso
  for (let i = -100; i < imagen.bitmap.width + 100; i += 120) {
    for (let j = -50; j < imagen.bitmap.height + 50; j += 80) {
      const textImage = new Jimp(80, 30, 0x00000000);
      textImage.print(fontWatermark, 0, 0, text);
      textImage.rotate(-25); // Ángulo diagonal fijo
      marcaAgua.composite(textImage, i, j, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 0.08, // Más sutil
        opacityDest: 1
      });
    }
  }
  return marcaAgua;
};

// Función para crear bordes y marcos como en documentos oficiales
const crearMarcoOficial = (imagen) => {
  // Borde exterior azul oscuro
  imagen.scan(0, 0, imagen.bitmap.width, 5, function (x, y, idx) {
    this.bitmap.data[idx + 0] = 0;   // R
    this.bitmap.data[idx + 1] = 51;  // G
    this.bitmap.data[idx + 2] = 102; // B
    this.bitmap.data[idx + 3] = 255; // A
  });
  
  imagen.scan(0, imagen.bitmap.height - 5, imagen.bitmap.width, 5, function (x, y, idx) {
    this.bitmap.data[idx + 0] = 0;
    this.bitmap.data[idx + 1] = 51;
    this.bitmap.data[idx + 2] = 102;
    this.bitmap.data[idx + 3] = 255;
  });
  
  imagen.scan(0, 0, 5, imagen.bitmap.height, function (x, y, idx) {
    this.bitmap.data[idx + 0] = 0;
    this.bitmap.data[idx + 1] = 51;
    this.bitmap.data[idx + 2] = 102;
    this.bitmap.data[idx + 3] = 255;
  });
  
  imagen.scan(imagen.bitmap.width - 5, 0, 5, imagen.bitmap.height, function (x, y, idx) {
    this.bitmap.data[idx + 0] = 0;
    this.bitmap.data[idx + 1] = 51;
    this.bitmap.data[idx + 2] = 102;
    this.bitmap.data[idx + 3] = 255;
  });
};

app.get("/generar-ficha", async (req, res) => {
  const { dni } = req.query;
  if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

  try {
    const response = await axios.get(`https://poxy-production.up.railway.app/reniec?dni=${dni}`);
    const data = response.data?.result;
    if (!data) return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });

    // Crear imagen con fondo blanco y tamaño similar a documento oficial
    const imagen = new Jimp(900, 1300, "#ffffff");
    
    // Cargar fuentes
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontSubtitle = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK);
    const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_12_BLACK);

    // Crear marco oficial
    crearMarcoOficial(imagen);

    // Superponer la marca de agua
    const marcaAgua = await generarMarcaDeAgua(imagen);
    imagen.composite(marcaAgua, 0, 0);

    // Encabezado oficial
    imagen.print(fontTitle, 150, 25, {
      text: "REPÚBLICA DEL PERÚ",
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_TOP
    }, 600);

    imagen.print(fontSubtitle, 150, 55, {
      text: "REGISTRO NACIONAL DE IDENTIFICACIÓN",
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_TOP
    }, 600);

    imagen.print(fontSubtitle, 150, 75, {
      text: "Y ESTADO CIVIL - RENIEC",
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_TOP
    }, 600);

    // Logo de la RENIEC (lado izquierdo)
    if (fs.existsSync(LOGO_RENEC_PATH)) {
      const logoReniec = await Jimp.read(LOGO_RENEC_PATH);
      logoReniec.resize(80, 80);
      imagen.composite(logoReniec, 30, 25);
    }

    // Escudo del Perú (lado derecho) - si tienes la imagen
    const ESCUDO_PERU_PATH = path.join(__dirname, "escudo_peru.png");
    if (fs.existsSync(ESCUDO_PERU_PATH)) {
      const escudoPeru = await Jimp.read(ESCUDO_PERU_PATH);
      escudoPeru.resize(80, 80);
      imagen.composite(escudoPeru, 790, 25);
    }

    // Línea separadora
    imagen.scan(30, 120, 840, 2, function (x, y, idx) {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 51;
      this.bitmap.data[idx + 2] = 102;
      this.bitmap.data[idx + 3] = 255;
    });

    // Título de sección
    imagen.print(fontBold, 30, 140, "DATOS PERSONALES");

    // Marco para la foto
    const fotoX = 650;
    const fotoY = 160;
    const fotoWidth = 200;
    const fotoHeight = 240;

    // Crear marco para la foto
    imagen.scan(fotoX - 3, fotoY - 3, fotoWidth + 6, 3, function (x, y, idx) {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
      this.bitmap.data[idx + 3] = 255;
    });
    imagen.scan(fotoX - 3, fotoY + fotoHeight, fotoWidth + 6, 3, function (x, y, idx) {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
      this.bitmap.data[idx + 3] = 255;
    });
    imagen.scan(fotoX - 3, fotoY - 3, 3, fotoHeight + 6, function (x, y, idx) {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
      this.bitmap.data[idx + 3] = 255;
    });
    imagen.scan(fotoX + fotoWidth, fotoY - 3, 3, fotoHeight + 6, function (x, y, idx) {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
      this.bitmap.data[idx + 3] = 255;
    });

    // Foto del DNI
    if (data.imagenes?.foto) {
      try {
        const bufferFoto = Buffer.from(data.imagenes.foto, 'base64');
        const foto = await Jimp.read(bufferFoto);
        foto.resize(fotoWidth, fotoHeight);
        imagen.composite(foto, fotoX, fotoY);
      } catch (error) {
        console.log("Error al cargar la foto:", error.message);
      }
    }

    // Campos principales con formato oficial
    const campos = [
      { label: "DOCUMENTO NACIONAL DE IDENTIDAD", value: data.nuDni, destacado: true },
      { label: "APELLIDOS Y NOMBRES", value: `${data.apePaterno} ${data.apeMaterno}, ${data.preNombres}`, destacado: true },
      { label: "APELLIDO PATERNO", value: data.apePaterno },
      { label: "APELLIDO MATERNO", value: data.apeMaterno },
      { label: "NOMBRES", value: data.preNombres },
      { label: "SEXO", value: data.sexo },
      { label: "FECHA DE NACIMIENTO", value: data.feNacimiento },
      { label: "ESTADO CIVIL", value: data.estadoCivil },
      { label: "GRADO DE INSTRUCCIÓN", value: data.gradoInstruccion },
      { label: "ESTATURA", value: `${data.estatura} cm` },
      { label: "FECHA DE EMISIÓN", value: data.feEmision },
      { label: "FECHA DE INSCRIPCIÓN", value: data.feInscripcion },
      { label: "FECHA DE CADUCIDAD", value: data.feCaducidad },
      { label: "DONACIÓN DE ÓRGANOS", value: data.donaOrganos },
      { label: "RESTRICCIÓN", value: data.deRestriccion || "NINGUNA" }
    ];

    // Impresión de datos principales
    let y = 180;
    for (let i = 0; i < campos.length && y < 450; i++) {
      const campo = campos[i];
      if (campo.destacado) {
        // Fondo gris claro para campos destacados
        imagen.scan(30, y - 2, 600, 20, function (x, y, idx) {
          this.bitmap.data[idx + 0] = 240;
          this.bitmap.data[idx + 1] = 240;
          this.bitmap.data[idx + 2] = 240;
          this.bitmap.data[idx + 3] = 255;
        });
        imagen.print(fontBold, 35, y, `${campo.label}:`);
        imagen.print(fontBold, 35, y + 15, `${campo.value || "-"}`);
        y += 35;
      } else {
        imagen.print(fontBold, 35, y, `${campo.label}:`);
        imagen.print(font, 250, y, `${campo.value || "-"}`);
        y += 25;
      }
    }

    // Sección de datos familiares
    y += 20;
    imagen.print(fontBold, 30, y, "DATOS FAMILIARES");
    y += 25;

    const camposFamiliares = [
      { label: "NOMBRE DEL PADRE", value: data.nomPadre },
      { label: "NRO. DOC. DEL PADRE", value: data.nuDocPadre },
      { label: "NOMBRE DE LA MADRE", value: data.nomMadre },
      { label: "NRO. DOC. DE LA MADRE", value: data.nuDocMadre },
      { label: "NOMBRE DECLARANTE", value: data.nomDeclarante },
      { label: "VÍNCULO DECLARANTE", value: data.vinculoDeclarante }
    ];

    for (const campo of camposFamiliares) {
      if (y > 1100) break;
      imagen.print(fontBold, 35, y, `${campo.label}:`);
      imagen.print(font, 250, y, `${campo.value || "-"}`);
      y += 25;
    }

    // Sección de domicilio
    y += 20;
    imagen.print(fontBold, 30, y, "DOMICILIO");
    y += 25;

    const camposDomicilio = [
      { label: "DIRECCIÓN", value: data.desDireccion },
      { label: "DEPARTAMENTO", value: data.departamento },
      { label: "PROVINCIA", value: data.provincia },
      { label: "DISTRITO", value: data.distrito },
      { label: "CÓDIGO POSTAL", value: data.ubicacion?.codigo_postal },
      { label: "UBIGEO RENIEC", value: data.ubicacion?.ubigeo_reniec },
      { label: "UBIGEO SUNAT/INEI", value: data.ubicacion?.ubigeo_inei }
    ];

    for (const campo of camposDomicilio) {
      if (y > 1150) break;
      imagen.print(fontBold, 35, y, `${campo.label}:`);
      imagen.print(font, 200, y, `${campo.value || "-"}`);
      y += 25;
    }

    // Información técnica
    y += 20;
    imagen.print(fontBold, 30, y, "INFORMACIÓN TÉCNICA");
    y += 25;
    imagen.print(fontBold, 35, y, `DÍGITO DE VERIFICACIÓN:`);
    imagen.print(font, 250, y, `${data.digitoVerificacion || "-"}`);

    // Pie de página oficial
    y = 1220;
    imagen.scan(30, y, 840, 1, function (x, y, idx) {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 51;
      this.bitmap.data[idx + 2] = 102;
      this.bitmap.data[idx + 3] = 255;
    });

    imagen.print(fontSmall, 30, y + 10, "Este documento es una consulta informativa generada automáticamente");
    imagen.print(fontSmall, 30, y + 25, `Fecha de consulta: ${new Date().toLocaleDateString('es-PE')}`);
    imagen.print(fontSmall, 30, y + 40, "RENIEC - Registro Nacional de Identificación y Estado Civil");

    // Código QR simulado (puedes implementar uno real si lo necesitas)
    const qrSize = 60;
    imagen.scan(800, y + 10, qrSize, qrSize, function (x, y, idx) {
      const pattern = (Math.floor(x / 5) + Math.floor(y / 5)) % 2;
      const color = pattern ? 0 : 255;
      this.bitmap.data[idx + 0] = color;
      this.bitmap.data[idx + 1] = color;
      this.bitmap.data[idx + 2] = color;
      this.bitmap.data[idx + 3] = 255;
    });

    // Guardar imagen
    const nombreArchivo = `ficha_reniec_${dni}_${uuidv4()}.png`;
    const rutaImagen = path.join(PUBLIC_DIR, nombreArchivo);
    await imagen.writeAsync(rutaImagen);

    const url = `${req.protocol}://${req.get("host")}/public/${nombreArchivo}`;
    res.json({ 
      message: "Ficha RENIEC generada exitosamente", 
      url,
      dni: data.nuDni,
      nombre_completo: `${data.preNombres} ${data.apePaterno} ${data.apeMaterno}`
    });

  } catch (error) {
    console.error("Error al generar la ficha:", error);
    res.status(500).json({ 
      error: "Error al generar la ficha RENIEC", 
      detalle: error.message 
    });
  }
});

// Middleware para servir archivos estáticos
app.use("/public", express.static(PUBLIC_DIR));

// Ruta de prueba
app.get("/", (req, res) => {
  res.json({ 
    message: "Servidor de generación de fichas RENIEC activo",
    uso: "GET /generar-ficha?dni=XXXXXXXX"
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Para generar una ficha: http://localhost:${PORT}/generar-ficha?dni=XXXXXXXX`);
});


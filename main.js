const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const { createCanvas, loadImage } = require('canvas');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/generar-ficha/:dni', async (req, res) => {
  const dni = req.params.dni;
  try {
    const { data } = await axios.get(`https://poxy-production.up.railway.app/reniec?dni=${dni}`);
    if (!data.result) return res.status(404).send('DNI no encontrado');

    const d = data.result;

    // Crear imagen base
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fondo blanco
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // Bordes
    ctx.strokeStyle = '#000';
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Título
    ctx.fillStyle = '#003366';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('REPÚBLICA DEL PERÚ – RENIEC – FICHA REGISTRO C4', 50, 50);

    // Foto
    if (d.imagenes?.foto) {
      const imageBuffer = Buffer.from(d.imagenes.foto, 'base64');
      const img = await loadImage(imageBuffer);
      ctx.drawImage(img, 50, 80, 150, 190);
    }

    // Texto
    ctx.fillStyle = '#000';
    ctx.font = '16px Arial';

    const lines = [
      [`DNI:`, d.nuDni],
      [`Nombre completo:`, `${d.preNombres} ${d.apePaterno} ${d.apeMaterno}`],
      [`Fecha de Nacimiento:`, d.feNacimiento],
      [`Estatura:`, `${d.estatura} cm`],
      [`Sexo:`, d.sexo],
      [`Estado Civil:`, d.estadoCivil],
      [`Grado de Instrucción:`, d.gradoInstruccion],
      [`Dirección:`, `${d.desDireccion}, ${d.distDireccion}, ${d.provDireccion}, ${d.depaDireccion}`],
      [`Padre:`, d.nomPadre],
      [`Madre:`, d.nomMadre],
      [`Fecha de Emisión:`, d.feEmision],
      [`Fecha de Caducidad:`, d.feCaducidad],
      [`Declarante:`, d.nomDeclarante],
      [`Verificador:`, d.digitoVerificacion],
    ];

    let y = 80;
    lines.forEach(([label, value]) => {
      ctx.fillText(label, 220, y);
      ctx.fillText(value || '-', 400, y);
      y += 30;
    });

    // Guardar imagen
    const fileName = `ficha-${dni}.png`;
    const filePath = `./public/${fileName}`;
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on('finish', () => {
      res.json({ success: true, url: `/` + fileName });
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Error generando ficha');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

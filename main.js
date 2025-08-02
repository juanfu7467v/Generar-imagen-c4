const express = require('express');
const fs = require('fs');
const fetch = require('node-fetch');
const { createCanvas } = require('canvas');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/public', express.static('public'));

app.get('/generar-ficha', async (req, res) => {
  const dni = req.query.dni;
  if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

  try {
    const apiURL = `https://poxy-production.up.railway.app/reniec?dni=${dni}&source=database`;
    const response = await fetch(apiURL);
    const data = await response.json();

    if (!data || !data.dni || data.error) {
      return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });
    }

    // Crear imagen tipo ficha RENIEC
    const canvas = createCanvas(800, 1200);
    const ctx = canvas.getContext('2d');

    // Fondo blanco
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 800, 1200);

    // Título
    ctx.fillStyle = "#000";
    ctx.font = "bold 28px Arial";
    ctx.fillText("FICHA RENIEC - CONSULTA C4", 200, 50);

    ctx.font = "20px Arial";
    let y = 100;

    function agregarCampo(label, valor) {
      ctx.fillText(`${label}: ${valor || 'NO DISPONIBLE'}`, 50, y);
      y += 40;
    }

    agregarCampo("DNI", data.dni);
    agregarCampo("Nombres Completos", `${data.apellido_paterno} ${data.apellido_materno}, ${data.nombres}`);
    agregarCampo("Sexo", data.sexo);
    agregarCampo("Fecha de Nacimiento", data.fecha_nacimiento);
    agregarCampo("Estado Civil", data.estado_civil);
    agregarCampo("Grado de Instrucción", data.grado_instruccion);
    agregarCampo("Nombre del Padre", data.nombres_padre);
    agregarCampo("Nombre de la Madre", data.nombres_madre);
    agregarCampo("Departamento", data.departamento);
    agregarCampo("Provincia", data.provincia);
    agregarCampo("Distrito", data.distrito);
    agregarCampo("Dirección", data.direccion);
    agregarCampo("Fecha de Emisión", data.fecha_emision);
    agregarCampo("Fecha de Caducidad", data.fecha_caducidad);
    agregarCampo("Restricciones", data.restricciones);
    agregarCampo("Grupo de Votación", data.grupo_votacion);
    agregarCampo("Ubigeo", data.ubigeo);
    agregarCampo("Prefijo Ubigeo", data.prefijo_ubigeo);
    agregarCampo("Código Verificador", data.digito_verificador);

    // Guardar imagen en public/
    const fileName = `${dni}_ficha_reniec.png`;
    const filePath = path.join(__dirname, 'public', fileName);
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    out.on('finish', () => {
      const url = `${req.protocol}://${req.get('host')}/public/${fileName}`;
      res.json({ message: "Ficha RENIEC generada", url });
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Ocurrió un error al generar la ficha." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

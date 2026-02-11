// src/server.js
const express = require('express');
const app = express();
const path = require('path');
const mysql = require('mysql2');
const productoRoutes = require('./routes/productoRoutes');

// Configura la conexión a la base de datos
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'dulce_mocka' // Asegúrate de que este nombre coincida con tu base de datos
});

db.connect(err => {
  if (err) {
    console.error('Error al conectar con la base de datos: ' + err.stack);
    return;
  }
  console.log('Conectado a la base de datos MySQL');
});

app.use(express.json());

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, '..', 'public')));

// Ruta de inicio - enviar el archivo HTML de la página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use('/api', productoRoutes); // Usar rutas de productos

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});

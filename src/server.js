// src/server.js

const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const passport = require('./config/passport');
const productoRoutes = require('./routes/productoRoutes');
const authRoutes = require('./routes/authRoutes');
const perfilRoutes = require('./routes/perfilRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificacionRoutes = require('./routes/notificacionRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Seguridad HTTP headers
app.use(helmet());

// Rate limiting global (ajusta según necesidad)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500, // Máximo 500 requests por IP
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.NEXTAUTH_SECRET || 'algo_aleatorio_aqui',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, '..', 'public')));

// Ruta de inicio - enviar el archivo HTML de la página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Modularización de rutas por dominio
app.use('/api', productoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notificaciones', notificacionRoutes);

// Manejo centralizado de errores
app.use(errorHandler);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});

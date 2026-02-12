// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');

/* ── Google OAuth ── */
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html?error=google' }),
  (req, res) => res.redirect('/')
);

/* ── Email / password login ── */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });

  db.query('SELECT * FROM usuario WHERE correo = ? AND activo = 1 LIMIT 1', [email], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error interno' });
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = rows[0];
    if (!user.password) return res.status(401).json({ error: 'Esta cuenta usa Google. Inicia sesión con Google.' });

    bcrypt.compare(password, user.password, (err2, match) => {
      if (err2 || !match) return res.status(401).json({ error: 'Credenciales inválidas' });

      req.login(user, (loginErr) => {
        if (loginErr) return res.status(500).json({ error: 'Error al iniciar sesión' });
        // Check if admin
        db.query("SELECT r.nombre AS rol FROM rol r WHERE r.id = ?", [user.rolId], (errR, rowsR) => {
          const rol = (rowsR && rowsR[0]) ? rowsR[0].rol : null;
          res.json({ ok: true, user: { id: user.id, nombre: user.nombre, email: user.correo, rol } });
        });
      });
    });
  });
});

/* ── Register ── */
router.post('/register', (req, res) => {
  const { nombre, email, telefono, password } = req.body || {};
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  // check existing
  db.query('SELECT id FROM usuario WHERE correo = ? LIMIT 1', [email], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error interno' });
    if (rows && rows.length > 0) return res.status(409).json({ error: 'Ya existe una cuenta con este correo' });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);

    db.query(
      'INSERT INTO usuario (id, nombre, correo, telefono, password, activo) VALUES (?, ?, ?, ?, ?, 1)',
      [id, nombre, email, telefono || null, hash],
      (err2) => {
        if (err2) return res.status(500).json({ error: 'Error al crear cuenta: ' + err2.message });

        const user = { id, nombre, email };
        req.login(user, (loginErr) => {
          if (loginErr) return res.status(500).json({ error: 'Cuenta creada pero error al iniciar sesión' });
          res.json({ ok: true, user });
        });
      }
    );
  });
});

/* ── Current user ── */
router.get('/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    db.query("SELECT r.nombre AS rol FROM rol r WHERE r.id = ?", [req.user.rolId], (errR, rowsR) => {
      const rol = (rowsR && rowsR[0]) ? rowsR[0].rol : null;
      res.json({ user: { id: req.user.id, nombre: req.user.nombre, email: req.user.correo || req.user.email, rol } });
    });
    return;
  }
  res.json({ user: null });
});

/* ── Logout ── */
router.post('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

module.exports = router;

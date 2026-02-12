// src/controllers/perfilController.js
const db = require('../models/db');

const PerfilController = {

  /** GET /api/perfil — datos del usuario autenticado */
  getProfile(req, res) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    db.query(
      `SELECT id, nombre, telefono, correo, mockaPoints, fechaNacimiento, creadoEn
       FROM usuario WHERE id = ? AND activo = 1`,
      [req.user.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error interno' });
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ user: rows[0] });
      }
    );
  },

  /** PUT /api/perfil — actualizar datos del perfil */
  updateProfile(req, res) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { nombre, telefono, fechaNacimiento } = req.body || {};
    if (!nombre || nombre.trim().length === 0) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const fechaNac = fechaNacimiento || null;

    db.query(
      'UPDATE usuario SET nombre = ?, telefono = ?, fechaNacimiento = ? WHERE id = ?',
      [nombre.trim(), telefono || null, fechaNac, req.user.id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar perfil' });
        res.json({ ok: true, message: 'Perfil actualizado correctamente' });
      }
    );
  },

  /** PUT /api/perfil/password — cambiar contraseña */
  changePassword(req, res) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    db.query('SELECT password, googleId FROM usuario WHERE id = ?', [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error interno' });
      const user = rows[0];

      // Si tiene password, debe enviar el actual
      if (user.password) {
        if (!currentPassword) return res.status(400).json({ error: 'Debes ingresar tu contraseña actual' });
        const bcrypt = require('bcryptjs');
        if (!bcrypt.compareSync(currentPassword, user.password)) {
          return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }
      }

      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync(newPassword, 10);
      db.query('UPDATE usuario SET password = ? WHERE id = ?', [hash, req.user.id], (err2) => {
        if (err2) return res.status(500).json({ error: 'Error al cambiar contraseña' });
        res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
      });
    });
  }
};

module.exports = PerfilController;

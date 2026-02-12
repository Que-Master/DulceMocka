// src/middleware/authMiddleware.js

/** Requiere que el usuario esté autenticado */
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'No autenticado' });
}

/** Requiere que el usuario sea administrador */
function requireAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const db = require('../models/db');
  db.query(
    "SELECT r.nombre FROM usuario u JOIN rol r ON r.id = u.rolId WHERE u.id = ? AND r.nombre = 'admin'",
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error interno' });
      if (!rows || rows.length === 0) return res.status(403).json({ error: 'Acceso denegado: se requiere rol de administrador' });
      next();
    }
  );
}

module.exports = { requireAuth, requireAdmin };

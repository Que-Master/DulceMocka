// src/controllers/notificacionController.js
const db = require('../models/db');

// Promise wrapper
function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err); else resolve(results);
    });
  });
}

/**
 * Crear una notificación (uso interno desde adminController)
 */
async function crearNotificacion({ usuarioId, pedidoId, tipo, titulo, mensaje, motivoCancelacion }) {
  await q(
    `INSERT INTO notificacion (usuarioId, pedidoId, tipo, titulo, mensaje, motivoCancelacion) VALUES (?, ?, ?, ?, ?, ?)`,
    [usuarioId, pedidoId || null, tipo || 'estado_pedido', titulo, mensaje || '', motivoCancelacion || null]
  );
}

/**
 * GET /api/notificaciones — notificaciones del usuario autenticado
 */
async function obtenerNotificaciones(req, res) {
  try {
    const rows = await q(
      `SELECT n.*, p.numeroPedido
       FROM notificacion n
       LEFT JOIN pedido p ON p.id = n.pedidoId
       WHERE n.usuarioId = ?
       ORDER BY n.creadoEn DESC
       LIMIT 50`,
      [req.user.id]
    );
    const sinLeer = rows.filter(r => !r.leida).length;
    res.json({ notificaciones: rows, sinLeer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/notificaciones/:id/leer — marcar una como leída
 */
async function marcarLeida(req, res) {
  try {
    await q('UPDATE notificacion SET leida = 1 WHERE id = ? AND usuarioId = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/notificaciones/leer-todas — marcar todas como leídas
 */
async function marcarTodasLeidas(req, res) {
  try {
    await q('UPDATE notificacion SET leida = 1 WHERE usuarioId = ? AND leida = 0', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/notificaciones/:id — eliminar notificación
 */
async function eliminarNotificacion(req, res) {
  try {
    await q('DELETE FROM notificacion WHERE id = ? AND usuarioId = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  crearNotificacion,
  obtenerNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  eliminarNotificacion
};

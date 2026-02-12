// src/controllers/direccionController.js
const { v4: uuidv4 } = require('uuid');
const DireccionModel = require('../models/direccionModel');
const db = require('../models/db');

function ensureAuth(req, res) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: 'No autenticado' });
    return false;
  }
  return true;
}

const DireccionController = {

  /** GET /api/perfil/direcciones */
  getAll(req, res) {
    if (!ensureAuth(req, res)) return;
    DireccionModel.getByUsuario(req.user.id, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error interno' });
      res.json({ direcciones: rows });
    });
  },

  /** GET /api/perfil/direcciones/:id */
  getOne(req, res) {
    if (!ensureAuth(req, res)) return;
    DireccionModel.getById(req.params.id, req.user.id, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error interno' });
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Dirección no encontrada' });
      res.json({ direccion: rows[0] });
    });
  },

  /** POST /api/perfil/direcciones */
  create(req, res) {
    if (!ensureAuth(req, res)) return;
    const { calle, numeroCasa, nota, sectorId, esPrincipal } = req.body || {};
    if (!calle || calle.trim().length === 0) {
      return res.status(400).json({ error: 'La calle es obligatoria' });
    }

    const data = {
      id: uuidv4(),
      calle: calle.trim(),
      numeroCasa: numeroCasa || null,
      nota: nota || null,
      sectorId: sectorId || null,
      esPrincipal: !!esPrincipal
    };

    DireccionModel.create(req.user.id, data, (err) => {
      if (err) return res.status(500).json({ error: 'Error al crear dirección: ' + err.message });
      res.json({ ok: true, id: data.id, message: 'Dirección creada correctamente' });
    });
  },

  /** PUT /api/perfil/direcciones/:id */
  update(req, res) {
    if (!ensureAuth(req, res)) return;
    const { calle, numeroCasa, nota, sectorId, esPrincipal } = req.body || {};
    if (!calle || calle.trim().length === 0) {
      return res.status(400).json({ error: 'La calle es obligatoria' });
    }

    const data = {
      calle: calle.trim(),
      numeroCasa: numeroCasa || null,
      nota: nota || null,
      sectorId: sectorId || null,
      esPrincipal: !!esPrincipal
    };

    DireccionModel.update(req.params.id, req.user.id, data, (err) => {
      if (err) return res.status(500).json({ error: 'Error al actualizar dirección: ' + err.message });
      res.json({ ok: true, message: 'Dirección actualizada correctamente' });
    });
  },

  /** DELETE /api/perfil/direcciones/:id */
  delete(req, res) {
    if (!ensureAuth(req, res)) return;
    DireccionModel.delete(req.params.id, req.user.id, (err) => {
      if (err) return res.status(500).json({ error: 'Error al eliminar dirección: ' + err.message });
      res.json({ ok: true, message: 'Dirección eliminada correctamente' });
    });
  },

  /** PATCH /api/perfil/direcciones/:id/principal */
  setPrincipal(req, res) {
    if (!ensureAuth(req, res)) return;
    DireccionModel.setPrincipal(req.params.id, req.user.id, (err) => {
      if (err) return res.status(500).json({ error: 'Error al establecer dirección principal' });
      res.json({ ok: true, message: 'Dirección marcada como principal' });
    });
  },

  /** GET /api/sectores — lista de sectores activos (público) */
  getSectores(req, res) {
    db.query('SELECT id, nombre, descripcion, precioEnvio FROM sector WHERE activo = 1 ORDER BY nombre', (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error interno' });
      res.json({ sectores: rows });
    });
  }
};

module.exports = DireccionController;

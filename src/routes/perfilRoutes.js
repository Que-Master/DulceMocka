// src/routes/perfilRoutes.js
const express = require('express');
const router = express.Router();
const PerfilController = require('../controllers/perfilController');
const DireccionController = require('../controllers/direccionController');
const CuponController = require('../controllers/cuponController');

// ── Perfil ──
router.get('/',              PerfilController.getProfile);
router.put('/',              PerfilController.updateProfile);
router.put('/password',      PerfilController.changePassword);

// ── Direcciones ──
router.get('/direcciones',            DireccionController.getAll);
router.get('/direcciones/:id',        DireccionController.getOne);
router.post('/direcciones',           DireccionController.create);
router.put('/direcciones/:id',        DireccionController.update);
router.delete('/direcciones/:id',     DireccionController.delete);
router.patch('/direcciones/:id/principal', DireccionController.setPrincipal);

// ── Cupones ──
router.get('/cupones',              CuponController.misCupones);
router.post('/cupones/reclamar',    CuponController.reclamarCupon);
router.delete('/cupones/:id',       CuponController.eliminarCupon);

// ── Sectores (público) ──
router.get('/sectores', DireccionController.getSectores);

module.exports = router;

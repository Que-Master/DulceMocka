// src/routes/notificacionRoutes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/notificacionController');

// Todas las rutas requieren autenticación
router.use(requireAuth);

router.get('/', ctrl.obtenerNotificaciones);
router.put('/leer-todas', ctrl.marcarTodasLeidas);
router.put('/:id/leer', ctrl.marcarLeida);
router.delete('/:id', ctrl.eliminarNotificacion);

module.exports = router;

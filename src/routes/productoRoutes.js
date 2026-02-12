// src/routes/productoRoutes.js
const express = require('express');
const router = express.Router();
const productoController = require('../controllers/productoController');

router.get('/categorias', productoController.obtenerCategorias);
router.get('/productos', productoController.obtenerProductos);
router.get('/producto/:id', productoController.obtenerProducto);
router.get('/ingredientes', productoController.obtenerIngredientes);
router.get('/sectores', productoController.obtenerSectores);

module.exports = router;

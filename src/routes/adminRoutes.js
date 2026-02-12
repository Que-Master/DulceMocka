// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const admin = require('../controllers/adminController');

// Todas las rutas requieren rol admin
router.use(requireAdmin);

// Dashboard
router.get('/dashboard', admin.dashboard);

// Pedidos
router.get('/pedidos', admin.getOrders);
router.get('/pedidos/:id', admin.getOrderDetail);
router.patch('/pedidos/:id/estado', admin.updateOrderStatus);
router.get('/estados', admin.getEstados);

// Usuarios
router.get('/usuarios', admin.getUsers);
router.put('/usuarios/:id', admin.updateUser);
router.get('/roles', admin.getRoles);

// Productos
router.get('/productos', admin.getProducts);
router.post('/productos', admin.createProduct);
router.put('/productos/:id', admin.updateProduct);
router.delete('/productos/:id', admin.deleteProduct);

// Categorías
router.get('/categorias', admin.getCategories);
router.post('/categorias', admin.createCategory);
router.put('/categorias/:id', admin.updateCategory);

// Sectores
router.get('/sectores', admin.getSectors);
router.post('/sectores', admin.createSector);
router.put('/sectores/:id', admin.updateSector);
router.delete('/sectores/:id', admin.deleteSector);

// Cupones
router.get('/cupones', admin.getCoupons);
router.post('/cupones', admin.createCoupon);
router.put('/cupones/:id', admin.updateCoupon);
router.delete('/cupones/:id', admin.deleteCoupon);

// Ingredientes
router.get('/ingredientes', admin.getIngredients);
router.post('/ingredientes', admin.createIngredient);
router.put('/ingredientes/:id', admin.updateIngredient);

// Slider
router.get('/slider', admin.getSlides);
router.post('/slider', admin.createSlide);
router.put('/slider/:id', admin.updateSlide);
router.delete('/slider/:id', admin.deleteSlide);

// Canjes Mocka Points
router.get('/canjes', admin.getCanjes);
router.patch('/canjes/:id', admin.updateCanjeStatus);

module.exports = router;

// src/routes/productoRoutes.js
const express = require('express');
const router = express.Router();
const productoController = require('../controllers/productoController');
const pedidoController = require('../controllers/pedidoController');

router.get('/categorias', productoController.obtenerCategorias);
router.get('/productos', productoController.obtenerProductos);
router.get('/producto/:id', productoController.obtenerProducto);
router.get('/ingredientes', productoController.obtenerIngredientes);
router.get('/sectores', productoController.obtenerSectores);

// Slider público
router.get('/slider', (req, res) => {
  const db = require('../models/db');
  db.query('SELECT id, titulo, subtitulo, imagenUrl, linkUrl FROM slider WHERE activo=1 ORDER BY orden ASC, creadoEn DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ slides: rows });
  });
});

// Pedidos (público)
router.post('/pedidos', pedidoController.crearPedido);
router.get('/pedidos/:id', pedidoController.obtenerPedido);

// Mis pedidos (usuario autenticado)
router.get('/mis-pedidos', pedidoController.misPedidos);

// Cupones — validar para carrito
const CuponController = require('../controllers/cuponController');
router.post('/cupones/validar', CuponController.validarCupon);

/* ══════════════════════════════════════════════
   MOCKA POINTS — público / usuario autenticado
   ══════════════════════════════════════════════ */
const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');

// Productos canjeables con Mocka Points
router.get('/mockapoints/productos', (req, res) => {
  db.query(
    'SELECT id, nombre, slug, descripcion, precio, imagen, costoMockaPoints FROM producto WHERE costoMockaPoints IS NOT NULL AND costoMockaPoints > 0 AND activo = 1 ORDER BY costoMockaPoints ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ productos: rows });
    }
  );
});

// Canjear producto con puntos
router.post('/mockapoints/canjear', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión' });
  const { productoId } = req.body;
  if (!productoId) return res.status(400).json({ error: 'productoId es requerido' });

  db.query('SELECT id, nombre, costoMockaPoints FROM producto WHERE id=? AND costoMockaPoints IS NOT NULL AND costoMockaPoints > 0 AND activo=1', [productoId], (err, prods) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!prods.length) return res.status(404).json({ error: 'Producto no disponible para canje' });

    const prod = prods[0];
    db.query('SELECT mockaPoints FROM usuario WHERE id=?', [req.user.id], (err2, users) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (!users.length) return res.status(404).json({ error: 'Usuario no encontrado' });

      const userPoints = users[0].mockaPoints || 0;
      if (userPoints < prod.costoMockaPoints) {
        return res.status(400).json({ error: 'No tienes suficientes Mocka Points', tienes: userPoints, necesitas: prod.costoMockaPoints });
      }

      // Deduct points
      db.query('UPDATE usuario SET mockaPoints = mockaPoints - ? WHERE id=?', [prod.costoMockaPoints, req.user.id], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });

        // Create canje record
        const canjeId = uuidv4();
        db.query('INSERT INTO canjeomockapoints (id, usuarioId, productoId, costoPoints, estado) VALUES (?,?,?,?,?)',
          [canjeId, req.user.id, productoId, prod.costoMockaPoints, 'pendiente'], (err4) => {
            if (err4) return res.status(500).json({ error: err4.message });

            // Notification
            db.query('INSERT INTO notificacion (id, usuarioId, tipo, titulo, mensaje) VALUES (?,?,?,?,?)',
              [uuidv4(), req.user.id, 'canje', '🏆 Canje realizado',
               '¡Has canjeado "' + prod.nombre + '" por ' + prod.costoMockaPoints + ' Mocka Points! Pronto será entregado.'],
              () => {});

            res.json({ ok: true, canjeId, puntosRestantes: userPoints - prod.costoMockaPoints });
          });
      });
    });
  });
});

// Mis canjes
router.get('/mockapoints/mis-canjes', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión' });
  db.query(
    `SELECT c.id, c.costoPoints, c.estado, c.creadoEn, c.entregadoEn, p.nombre AS producto, p.imagen
     FROM canjeomockapoints c
     JOIN producto p ON p.id = c.productoId
     WHERE c.usuarioId = ?
     ORDER BY c.creadoEn DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ canjes: rows });
    }
  );
});

// Saldo de puntos
router.get('/mockapoints/saldo', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión' });
  db.query('SELECT mockaPoints FROM usuario WHERE id=?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ puntos: rows.length ? (rows[0].mockaPoints || 0) : 0 });
  });
});

module.exports = router;

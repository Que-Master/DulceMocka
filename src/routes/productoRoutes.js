// src/routes/productoRoutes.js
const express = require('express');
const router = express.Router();
const productoController = require('../controllers/productoController');
const pedidoController = require('../controllers/pedidoController');

const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');

function q(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params || [], (err, result) => {
      if (err) reject(err); else resolve(result);
    });
  });
}

/**
 * Verifica si el perfil del usuario está completo
 * Campos requeridos: nombre, telefono, y al menos una dirección
 */
async function perfilCompleto(userId) {
  const usuarios = await q('SELECT nombre, telefono FROM usuario WHERE id = ?', [userId]);
  if (!usuarios.length) return { completo: false, faltantes: ['usuario'] };
  
  const u = usuarios[0];
  const faltantes = [];
  if (!u.nombre || u.nombre.trim() === '') faltantes.push('nombre');
  if (!u.telefono || u.telefono.trim() === '') faltantes.push('teléfono');
  
  // Verificar si tiene al menos una dirección activa
  const direcciones = await q('SELECT 1 FROM usuariodireccion WHERE usuarioId = ? AND activo = 1 LIMIT 1', [userId]);
  if (!direcciones.length) faltantes.push('dirección de envío');
  
  return { completo: faltantes.length === 0, faltantes };
}

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

// Canjear producto con puntos (requiere perfil completo)
// Crea un pedido de tipo "Recogida" (retiro en tienda)
router.post('/mockapoints/canjear', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Debes iniciar sesión para canjear puntos', requiresLogin: true });
    }

    // Verificar perfil completo
    const { completo, faltantes } = await perfilCompleto(req.user.id);
    if (!completo) {
      return res.status(400).json({
        error: 'Completa tu perfil para canjear Mocka Points. Falta: ' + faltantes.join(', '),
        requiresProfile: true,
        faltantes
      });
    }

    const { productoId } = req.body;
    if (!productoId) return res.status(400).json({ error: 'productoId es requerido' });

    const prods = await q('SELECT id, nombre, precio, costoMockaPoints, imagen FROM producto WHERE id=? AND costoMockaPoints IS NOT NULL AND costoMockaPoints > 0 AND activo=1', [productoId]);
    if (!prods.length) return res.status(404).json({ error: 'Producto no disponible para canje' });

    const prod = prods[0];
    const users = await q('SELECT id, nombre, correo, telefono, mockaPoints FROM usuario WHERE id=?', [req.user.id]);
    if (!users.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = users[0];
    const userPoints = user.mockaPoints || 0;
    if (userPoints < prod.costoMockaPoints) {
      return res.status(400).json({ error: 'No tienes suficientes Mocka Points', tienes: userPoints, necesitas: prod.costoMockaPoints });
    }

    // Obtener tipo de entrega "Recogida"
    const tiposEntrega = await q('SELECT id FROM tipoentrega WHERE nombre LIKE "%Recog%" OR nombre LIKE "%retiro%" LIMIT 1');
    const tipoEntregaId = tiposEntrega.length ? tiposEntrega[0].id : null;

    // Obtener estado "Pendiente"
    const estados = await q('SELECT id FROM estadopedido WHERE nombre = "Pendiente" LIMIT 1');
    const estadoId = estados.length ? estados[0].id : null;

    // Generar número de pedido único (MP = Mocka Points)
    const numeroPedido = 'MP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();

    // Deducir puntos
    await q('UPDATE usuario SET mockaPoints = mockaPoints - ? WHERE id=?', [prod.costoMockaPoints, req.user.id]);

    // Crear pedido
    const pedidoId = uuidv4();
    await q(
      `INSERT INTO pedido (id, numeroPedido, usuarioId, nombreContacto, correoContacto, telefonoContacto,
       tipoEntregaId, direccionId, cuponId, codigoCuponSnapshot, subtotal, total, descuentoTotal, estadoId, creadoEn)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [pedidoId, numeroPedido, req.user.id, user.nombre, user.correo, user.telefono,
       tipoEntregaId, null, null, 'CANJE MOCKA POINTS', 0, 0, 0, estadoId]
    );

    // Crear item del pedido
    const itemId = uuidv4();
    await q(
      `INSERT INTO pedidoitem (id, pedidoId, productoId, nombreProducto, precioUnitario, cantidad, notasItem, totalLinea)
       VALUES (?,?,?,?,?,?,?,?)`,
      [itemId, pedidoId, prod.id, prod.nombre, 0, 1, '🏆 Canjeado con ' + prod.costoMockaPoints + ' Mocka Points', 0]
    );

    // Crear registro de canje vinculado al pedido
    const canjeId = uuidv4();
    await q('INSERT INTO canjeomockapoints (id, usuarioId, productoId, costoPoints, estado, pedidoId) VALUES (?,?,?,?,?,?)',
      [canjeId, req.user.id, productoId, prod.costoMockaPoints, 'pendiente', pedidoId]);

    // Notificación
    await q('INSERT INTO notificacion (id, usuarioId, tipo, titulo, mensaje) VALUES (?,?,?,?,?)',
      [uuidv4(), req.user.id, 'canje', '🏆 Canje realizado',
       '¡Has canjeado "' + prod.nombre + '" por ' + prod.costoMockaPoints + ' Mocka Points! Retira en tienda con tu boleta #' + numeroPedido]);

    res.json({
      ok: true,
      canjeId,
      pedidoId,
      numeroPedido,
      puntosRestantes: userPoints - prod.costoMockaPoints,
      producto: {
        nombre: prod.nombre,
        imagen: prod.imagen,
        costoMockaPoints: prod.costoMockaPoints
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

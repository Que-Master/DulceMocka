// src/models/productoModel.js
const db = require('./db');

// Obtener todos los productos o filtrar por categoría
const obtenerProductos = (categoriaId, callback) => {
  const attempts = [];

  if (categoriaId) {
    // Intento principal: tablas en minúscula y columna camelCase (ej. producto.categoriaId)
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM producto p LEFT JOIN categoria c ON p.categoriaId = c.id WHERE p.categoriaId = ?`, params: [categoriaId] });
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM Producto p LEFT JOIN Categoria c ON p.categoriaId = c.id WHERE p.categoriaId = ?`, params: [categoriaId] });
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM Producto p LEFT JOIN Categoria c ON p.categoria_id = c.id WHERE p.categoria_id = ?`, params: [categoriaId] });
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.categoria_id = ?`, params: [categoriaId] });
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM productos p LEFT JOIN categorias c ON p.categoria = c.id WHERE p.categoria = ?`, params: [categoriaId] });
  } else {
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM producto p LEFT JOIN categoria c ON p.categoriaId = c.id`, params: [] });
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM Producto p LEFT JOIN Categoria c ON p.categoriaId = c.id`, params: [] });
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM Producto p LEFT JOIN Categoria c ON p.categoria_id = c.id`, params: [] });
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id`, params: [] });
    attempts.push({ sql: `SELECT p.*, c.nombre AS categoria_nombre FROM productos p LEFT JOIN categorias c ON p.categoria = c.id`, params: [] });
  }

  // Ejecutar intentos secuencialmente hasta obtener resultados o agotar opciones
  const tryAttempt = (i) => {
    if (i >= attempts.length) return callback(null, []);
    const a = attempts[i];
    db.query(a.sql, a.params, (err, results) => {
      if (err) {
        console.warn('productoModel.obtenerProductos: intento', i, 'falló:', err.message);
        return tryAttempt(i + 1);
      }
      // Si la consulta fue exitosa, devolver resultados (aunque vacíos)
      return callback(null, results);
    });
  };

  tryAttempt(0);
};

// Obtener categorías que tengan al menos un producto (con total)
const obtenerCategorias = (callback) => {
  const attempts = [
    `SELECT c.id, c.nombre, COUNT(p.id) AS total FROM categoria c JOIN producto p ON p.categoriaId = c.id GROUP BY c.id, c.nombre HAVING COUNT(p.id) > 0 ORDER BY c.nombre`,
    `SELECT c.id, c.nombre, COUNT(p.id) AS total FROM Categoria c JOIN Producto p ON p.categoriaId = c.id GROUP BY c.id, c.nombre HAVING COUNT(p.id) > 0 ORDER BY c.nombre`,
    `SELECT c.id, c.nombre, COUNT(p.id) AS total FROM Categoria c JOIN Producto p ON p.categoria_id = c.id GROUP BY c.id, c.nombre HAVING COUNT(p.id) > 0 ORDER BY c.nombre`,
    `SELECT c.id, c.nombre, COUNT(p.id) AS total FROM categorias c JOIN productos p ON p.categoria_id = c.id GROUP BY c.id, c.nombre HAVING COUNT(p.id) > 0 ORDER BY c.nombre`,
    `SELECT c.id, c.nombre, COUNT(p.id) AS total FROM categorias c JOIN productos p ON p.categoria = c.id GROUP BY c.id, c.nombre HAVING COUNT(p.id) > 0 ORDER BY c.nombre`
  ];

  const tryAttempt = (i) => {
    if (i >= attempts.length) return callback(null, []);
    db.query(attempts[i], (err, results) => {
      if (err) {
        console.warn('productoModel.obtenerCategorias: intento', i, 'falló:', err.message);
        return tryAttempt(i + 1);
      }
      return callback(null, results);
    });
  };

  tryAttempt(0);
};

module.exports = { obtenerProductos, obtenerCategorias };

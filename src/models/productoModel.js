// src/models/productoModel.js
const db = require('./db');

// Obtener todos los productos o filtrar por categoría
const obtenerProductos = (categoriaId, callback) => {
  let sql, params;

  if (categoriaId) {
    sql = `SELECT p.*, c.nombre AS categoria_nombre FROM producto p LEFT JOIN categoria c ON p.categoriaId = c.id WHERE p.categoriaId = ? AND p.activo = 1`;
    params = [categoriaId];
  } else {
    sql = `SELECT p.*, c.nombre AS categoria_nombre FROM producto p LEFT JOIN categoria c ON p.categoriaId = c.id WHERE p.activo = 1`;
    params = [];
  }

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error('productoModel.obtenerProductos error:', err.message);
      return callback(err, []);
    }
    return callback(null, results);
  });
};

// Obtener categorías activas
const obtenerCategorias = (callback) => {
  const sql = `SELECT id, nombre, descripcion FROM categoria WHERE activo = 1 ORDER BY nombre`;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('productoModel.obtenerCategorias error:', err.message);
      return callback(err, []);
    }
    return callback(null, results);
  });
};

// Obtener un producto por ID con sus ingredientes
const obtenerProductoPorId = (id, callback) => {
  const sqlP = `SELECT p.*, c.nombre AS categoria_nombre
    FROM producto p
    LEFT JOIN categoria c ON p.categoriaId = c.id
    WHERE p.id = ? AND p.activo = 1`;

  db.query(sqlP, [id], (err, rows) => {
    if (err) return callback(err);
    if (!rows || rows.length === 0) return callback(null, null);

    const producto = rows[0];

    const sqlI = `SELECT i.id, i.nombre, i.descripcion,
      IFNULL(pi.incluidoPorDefecto, 0) AS incluidoPorDefecto,
      IFNULL(pi.sePuedeQuitar, 1) AS sePuedeQuitar
      FROM productoingrediente pi
      JOIN ingrediente i ON pi.ingredienteId = i.id
      WHERE pi.productoId = ?`;

    db.query(sqlI, [id], (err2, ingredientes) => {
      if (err2) {
        console.warn('ingredientes query falló:', err2.message);
        producto.ingredientes = [];
      } else {
        producto.ingredientes = ingredientes || [];
      }
      return callback(null, producto);
    });
  });
};

module.exports = { obtenerProductos, obtenerCategorias, obtenerProductoPorId };

// Obtener todos los ingredientes activos
const obtenerIngredientes = (callback) => {
  const sql = `SELECT id, nombre, descripcion FROM ingrediente WHERE activo = 1 ORDER BY nombre`;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('productoModel.obtenerIngredientes error:', err.message);
      return callback(err, []);
    }
    return callback(null, results);
  });
};

// Obtener sectores activos
const obtenerSectores = (callback) => {
  const sql = `SELECT id, nombre, precioEnvio FROM sector WHERE activo = 1 ORDER BY nombre`;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('productoModel.obtenerSectores error:', err.message);
      return callback(err, []);
    }
    return callback(null, results);
  });
};

module.exports = { obtenerProductos, obtenerCategorias, obtenerProductoPorId, obtenerIngredientes, obtenerSectores };

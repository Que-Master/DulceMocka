// src/controllers/productoController.js
const productoModel = require('../models/productoModel');

const obtenerProductos = (req, res) => {
  const categoriaId = req.query.categoria || null;
  productoModel.obtenerProductos(categoriaId, (err, productos) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener productos' });
    }
    console.log('API /api/productos -> categoria=', categoriaId, 'resultCount=', (productos || []).length);
    res.status(200).json(productos);
  });
};

const obtenerCategorias = (req, res) => {
  productoModel.obtenerCategorias((err, categorias) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener categorías' });
    }
    console.log('API /api/categorias -> count=', (categorias || []).length);
    res.status(200).json(categorias);
  });
};

module.exports = { obtenerProductos, obtenerCategorias };

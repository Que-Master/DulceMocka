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

const obtenerProducto = (req, res) => {
  const id = req.params.id;
  productoModel.obtenerProductoPorId(id, (err, producto) => {
    if (err) return res.status(500).json({ error: 'Error al obtener producto' });
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    res.status(200).json(producto);
  });
};

const obtenerIngredientes = (req, res) => {
  productoModel.obtenerIngredientes((err, ingredientes) => {
    if (err) return res.status(500).json({ error: 'Error al obtener ingredientes' });
    res.status(200).json(ingredientes);
  });
};

const obtenerSectores = (req, res) => {
  productoModel.obtenerSectores((err, sectores) => {
    if (err) return res.status(500).json({ error: 'Error al obtener sectores' });
    res.status(200).json(sectores);
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

module.exports = { obtenerProductos, obtenerCategorias, obtenerProducto, obtenerIngredientes, obtenerSectores };

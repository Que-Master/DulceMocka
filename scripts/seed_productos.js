// scripts/seed_productos.js — Insertar categorías e ingredientes y productos
const db = require('../src/models/db');
const { v4: uuidv4 } = require('uuid');

const steps = [
  // Categorías
  (next) => {
    const categorias = [
      { id: uuidv4(), nombre: 'Tortas', descripcion: 'Deliciosas tortas personalizadas' },
      { id: uuidv4(), nombre: 'Cupcakes', descripcion: 'Cupcakes esponjosos y decorados' },
      { id: uuidv4(), nombre: 'Galletas', descripcion: 'Galletas frescas y crujientes' },
      { id: uuidv4(), nombre: 'Brownies', descripcion: 'Brownies de chocolate' },
      { id: uuidv4(), nombre: 'Postres Especiales', descripcion: 'Postres gourmet' }
    ];
    
    db.query('SELECT id FROM categoria LIMIT 1', (err, rows) => {
      if (rows && rows.length > 0) { 
        console.log('Categorías ya existen'); 
        return next(null); 
      }
      
      let completed = 0;
      categorias.forEach(cat => {
        db.query("INSERT INTO categoria (id, nombre, descripcion, activo) VALUES (?, ?, ?, 1)", 
          [cat.id, cat.nombre, cat.descripcion], 
          (e) => {
            if (e) console.error('Error:', e.message);
            else console.log(`✓ Categoría creada: ${cat.nombre}`);
            completed++;
            if (completed === categorias.length) next(categorias);
          }
        );
      });
    });
  },
  
  // Ingredientes
  (next, categorias) => {
    const ingredientes = [
      { nombre: 'Chocolate', descripcion: 'Chocolate belga' },
      { nombre: 'Fresas', descripcion: 'Fresas frescas' },
      { nombre: 'Vainilla', descripcion: 'Extracto de vainilla' },
      { nombre: 'Almendras', descripcion: 'Almendras molidas' },
      { nombre: 'Caramelo', descripcion: 'Salsa de caramelo' },
      { nombre: 'Coco', descripcion: 'Coco rallado' }
    ];
    
    db.query('SELECT id FROM ingrediente LIMIT 1', (err, rows) => {
      if (rows && rows.length > 0) { 
        console.log('Ingredientes ya existen'); 
        return next(categorias); 
      }
      
      let completed = 0;
      ingredientes.forEach(ing => {
        const id = uuidv4();
        db.query("INSERT INTO ingrediente (id, nombre, descripcion, activo) VALUES (?, ?, ?, 1)", 
          [id, ing.nombre, ing.descripcion], 
          (e) => {
            if (e) console.error('Error:', e.message);
            else console.log(`✓ Ingrediente creado: ${ing.nombre}`);
            completed++;
            if (completed === ingredientes.length) next(categorias);
          }
        );
      });
    });
  },
  
  // Productos
  (next, categorias) => {
    const productos = [
      { nombre: 'Torta de Chocolate', slug: 'torta-chocolate', categoriaId: categorias[0].id, precio: 35.00, imagen: 'torta-chocolate.jpg' },
      { nombre: 'Torta de Fresas', slug: 'torta-fresas', categoriaId: categorias[0].id, precio: 40.00, imagen: 'torta-fresas.jpg' },
      { nombre: 'Cupcake de Vainilla', slug: 'cupcake-vainilla', categoriaId: categorias[1].id, precio: 5.00, imagen: 'cupcake-vainilla.jpg' },
      { nombre: 'Cupcake de Chocolate', slug: 'cupcake-chocolate', categoriaId: categorias[1].id, precio: 5.50, imagen: 'cupcake-chocolate.jpg' },
      { nombre: 'Galletas de Almendra', slug: 'galletas-almendra', categoriaId: categorias[2].id, precio: 12.00, imagen: 'galletas-almendra.jpg' },
      { nombre: 'Brownies Especiales', slug: 'brownies-especiales', categoriaId: categorias[3].id, precio: 8.00, imagen: 'brownies.jpg' },
      { nombre: 'Tiramisú Gourmet', slug: 'tiramisu', categoriaId: categorias[4].id, precio: 25.00, imagen: 'tiramisu.jpg' },
      { nombre: 'Cheesecake', slug: 'cheesecake', categoriaId: categorias[4].id, precio: 28.00, imagen: 'cheesecake.jpg' }
    ];
    
    db.query('SELECT id FROM producto LIMIT 1', (err, rows) => {
      if (rows && rows.length > 0) { 
        console.log('Productos ya existen'); 
        return next(); 
      }
      
      let completed = 0;
      productos.forEach(prod => {
        const id = uuidv4();
        db.query("INSERT INTO producto (id, categoriaId, nombre, slug, descripcion, precio, activo, imagen) VALUES (?, ?, ?, ?, ?, ?, 1, ?)", 
          [id, prod.categoriaId, prod.nombre, prod.slug, `${prod.nombre} delicioso`, prod.precio, prod.imagen], 
          (e) => {
            if (e) console.error('Error:', e.message);
            else console.log(`✓ Producto creado: ${prod.nombre}`);
            completed++;
            if (completed === productos.length) next();
          }
        );
      });
    });
  }
];

// Run steps sequentially
let i = 0;
function run(data) {
  if (i >= steps.length) { 
    console.log('\n✅ Seed de productos completado!'); 
    process.exit(); 
    return; 
  }
  const step = steps[i++];
  step(run, data);
}
run();

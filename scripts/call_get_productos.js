const pm = require('../src/models/productoModel');

pm.obtenerProductos(null, (err, prods) => {
  if (err) return console.error('ERR all:', err.message);
  console.log('ALL:', prods.map(p => ({id:p.id, nombre:p.nombre, categoriaId:p.categoriaId, categoria_nombre:p.categoria_nombre}))); 

  // probar con la primera categoría (si existe)
  pm.obtenerCategorias((err, cats) => {
    if (err) return console.error('ERR cats:', err.message);
    if (!cats || cats.length === 0) return process.exit(0);
    const catId = cats[0].id;
    pm.obtenerProductos(catId, (err2, prodsCat) => {
      if (err2) return console.error('ERR cat:', err2.message);
      console.log('BY CAT', catId, prodsCat.map(p=>p.nombre));
      process.exit(0);
    });
  });
});

const pm = require('../src/models/productoModel');

pm.obtenerCategorias((err, cats) => {
  if (err) return console.error('ERR:', err.message);
  console.log('CATS:', cats);
  process.exit(0);
});

const db = require('../src/models/db');

const sql = `SELECT c.id, c.nombre, COUNT(p.id) AS total FROM categoria c JOIN producto p ON p.categoriaId = c.id GROUP BY c.id, c.nombre HAVING COUNT(p.id) > 0 ORDER BY c.nombre`;

db.query(sql, (err, res) => {
  if (err) return console.error('Error:', err.message);
  console.log('RESULT:', res);
  process.exit(0);
});

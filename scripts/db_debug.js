const db = require('../src/models/db');

function q(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

(async () => {
  try {
    console.log('--- SHOW TABLES ---');
    let rows = await q('SHOW TABLES');
    console.log(rows);

    const tests = [
      'SELECT COUNT(*) as c FROM Producto',
      'SELECT COUNT(*) as c FROM productos',
      'SELECT * FROM Producto LIMIT 5',
      'SELECT * FROM productos LIMIT 5',
      'SELECT * FROM Categoria LIMIT 5',
      'SELECT * FROM categorias LIMIT 5'
    ];

    for (const t of tests) {
      try {
        console.log(`--- ${t} ---`);
        const r = await q(t);
        console.log(r);
      } catch (e) {
        console.log(`Error en: ${t} =>`, e.message);
      }
    }
  } catch (e) {
    console.error('Error diagnóstico:', e.message);
  } finally {
    process.exit(0);
  }
})();

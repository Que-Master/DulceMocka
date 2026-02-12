const db = require('../src/models/db');
db.query('SHOW COLUMNS FROM producto', (e, r) => {
  console.log('=== PRODUCTO COLUMNS ===');
  if (e) { console.error(e.message); } else { r.forEach(c => console.log(c.Field, c.Type)); }
  db.query('SHOW TABLES', (e2, r2) => {
    console.log('\n=== TABLES ===');
    r2.forEach(t => console.log(Object.values(t)[0]));
    process.exit();
  });
});

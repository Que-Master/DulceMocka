const db = require('../src/models/db');
const sql = "SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,IS_NULLABLE,COLUMN_KEY,COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dulce_mocka' ORDER BY TABLE_NAME,ORDINAL_POSITION";
db.query(sql, (err, rows) => {
  if (err) { console.error(err); process.exit(1); }
  let current = '';
  rows.forEach(c => {
    if (c.TABLE_NAME !== current) { current = c.TABLE_NAME; console.log('\n=== ' + current + ' ==='); }
    console.log('  ' + c.COLUMN_NAME + ' | ' + c.DATA_TYPE + ' | ' + c.COLUMN_KEY + ' | ' + (c.COLUMN_DEFAULT || ''));
  });
  process.exit();
});

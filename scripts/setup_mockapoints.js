// scripts/setup_mockapoints.js — Add costoMockaPoints to producto & create canjeo table
const db = require('../src/models/db');

const sqls = [
  // Add costoMockaPoints column to producto (nullable, if set = can be redeemed with points)
  `ALTER TABLE producto ADD COLUMN IF NOT EXISTS costoMockaPoints INT DEFAULT NULL`,

  // Table to track point redemptions
  `CREATE TABLE IF NOT EXISTS canjeomockapoints (
    id VARCHAR(36) PRIMARY KEY,
    usuarioId VARCHAR(36) NOT NULL,
    productoId VARCHAR(36) NOT NULL,
    costoPoints INT NOT NULL,
    estado ENUM('pendiente','entregado','cancelado') DEFAULT 'pendiente',
    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
    entregadoEn DATETIME DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

(async function run() {
  for (const sql of sqls) {
    try {
      await new Promise((resolve, reject) => {
        db.query(sql, (err) => err ? reject(err) : resolve());
      });
      console.log('✅', sql.substring(0, 60) + '...');
    } catch (e) {
      // ignore "duplicate column" errors
      if (e.code === 'ER_DUP_FIELDNAME' || e.message.includes('Duplicate column')) {
        console.log('⏭️  Column already exists, skipping');
      } else {
        console.error('❌', e.message);
      }
    }
  }
  console.log('✅ Mocka Points setup complete');
  process.exit(0);
})();

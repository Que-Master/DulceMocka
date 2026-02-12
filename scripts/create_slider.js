// scripts/create_slider.js — Create slider table
const db = require('../src/models/db');

const sql = `
CREATE TABLE IF NOT EXISTS slider (
  id VARCHAR(36) PRIMARY KEY,
  titulo VARCHAR(150) DEFAULT NULL,
  subtitulo VARCHAR(255) DEFAULT NULL,
  imagenUrl TEXT NOT NULL,
  linkUrl VARCHAR(500) DEFAULT NULL,
  orden INT DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

db.query(sql, (err) => {
  if (err) { console.error('Error creando tabla slider:', err.message); process.exit(1); }
  console.log('✅ Tabla slider creada correctamente');
  process.exit(0);
});

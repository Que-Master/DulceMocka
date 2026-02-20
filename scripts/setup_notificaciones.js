// scripts/setup_notificaciones.js
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dulce_mocka'
  });

  // Crear tabla de notificaciones globales (broadcast del admin)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS notificacion_global (
      id INT AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(200) NOT NULL,
      cuerpo TEXT NOT NULL,
      link VARCHAR(500) DEFAULT NULL,
      activa BOOLEAN DEFAULT TRUE,
      creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('✅ Tabla notificacion_global creada');
  await conn.end();
})();

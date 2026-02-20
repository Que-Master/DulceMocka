// Script para crear tabla de configuración del local
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dulce_mocka'
  });

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS configuracion_local (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      horaApertura TIME DEFAULT '08:00:00',
      horaCierre TIME DEFAULT '20:00:00',
      abierto TINYINT(1) DEFAULT 1,
      forzarEstado TINYINT(1) DEFAULT 0,
      mensaje VARCHAR(255) DEFAULT NULL,
      actualizadoEn DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await conn.execute(`INSERT IGNORE INTO configuracion_local (id) VALUES ('config')`);

  console.log('✅ Tabla configuracion_local creada');
  await conn.end();
})();

const db = require('../src/models/db');

const sql = `CREATE TABLE IF NOT EXISTS notificacion (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  usuarioId VARCHAR(36) NOT NULL,
  pedidoId VARCHAR(36),
  tipo VARCHAR(50) NOT NULL DEFAULT 'estado_pedido',
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT,
  motivoCancelacion TEXT,
  leida TINYINT(1) DEFAULT 0,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuarioId) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (pedidoId) REFERENCES pedido(id) ON DELETE SET NULL
)`;

db.query(sql, (err) => {
  if (err) { console.error('Error:', err.message); }
  else { console.log('Tabla notificacion creada correctamente'); }
  process.exit();
});

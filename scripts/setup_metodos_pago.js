// scripts/setup_metodos_pago.js — crear tabla de metodos de pago y relacionarla con pedido
const db = require('../src/models/db');
const { v4: uuidv4 } = require('uuid');

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

async function ensureTableMetodosPago() {
  await q(`
    CREATE TABLE IF NOT EXISTS metodopago (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL UNIQUE,
      descripcion TEXT,
      activo TINYINT(1) DEFAULT 1,
      creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✓ Tabla metodopago lista');
}

async function ensureDefaultMethods() {
  const defaults = [
    { nombre: 'efectivo', descripcion: 'Pago en efectivo' },
    { nombre: 'transferencia', descripcion: 'Pago por transferencia bancaria' },
    { nombre: 'debito', descripcion: 'Pago con tarjeta de débito' },
    { nombre: 'credito', descripcion: 'Pago con tarjeta de crédito' }
  ];

  // Compatibilidad: si existe "tarjeta" antigua, migrar su nombre a "debito"
  const tarjetaLegacy = await q('SELECT id FROM metodopago WHERE LOWER(nombre) = ? LIMIT 1', ['tarjeta']);
  if (tarjetaLegacy.length > 0) {
    const debitoExists = await q('SELECT id FROM metodopago WHERE LOWER(nombre) = ? LIMIT 1', ['debito']);
    if (debitoExists.length === 0) {
      await q('UPDATE metodopago SET nombre = ?, descripcion = ?, activo = 1 WHERE id = ?', ['debito', 'Pago con tarjeta de débito', tarjetaLegacy[0].id]);
      console.log('✓ Metodo legacy "tarjeta" migrado a: debito');
    } else {
      await q('UPDATE metodopago SET activo = 0 WHERE id = ?', [tarjetaLegacy[0].id]);
      console.log('✓ Metodo legacy "tarjeta" desactivado (debito ya existe)');
    }
  }

  for (const m of defaults) {
    const existing = await q('SELECT id FROM metodopago WHERE LOWER(nombre) = ? LIMIT 1', [m.nombre]);
    if (existing.length === 0) {
      await q('INSERT INTO metodopago (id, nombre, descripcion, activo) VALUES (?,?,?,1)', [uuidv4(), m.nombre, m.descripcion]);
      console.log('✓ Metodo insertado:', m.nombre);
    } else {
      await q('UPDATE metodopago SET nombre = ?, descripcion = ?, activo = 1 WHERE id = ?', [m.nombre, m.descripcion, existing[0].id]);
      console.log('⏭ Metodo ya existe y fue actualizado:', m.nombre);
    }
  }

  const permitidos = defaults.map(d => d.nombre);
  await q(
    `UPDATE metodopago
     SET activo = 0
     WHERE LOWER(nombre) NOT IN (${permitidos.map(() => '?').join(',')})`,
    permitidos
  );
  console.log('✓ Metodos fuera de la lista oficial desactivados');
}

async function ensurePedidoColumn() {
  const cols = await q(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pedido'
      AND COLUMN_NAME = 'metodoPagoId'
  `);

  if (cols.length === 0) {
    await q('ALTER TABLE pedido ADD COLUMN metodoPagoId VARCHAR(36) NULL AFTER tipoEntregaId');
    console.log('✓ Columna pedido.metodoPagoId creada');
  } else {
    console.log('⏭ Columna pedido.metodoPagoId ya existe');
  }
}

async function ensurePedidoFk() {
  const fk = await q(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pedido'
      AND COLUMN_NAME = 'metodoPagoId'
      AND REFERENCED_TABLE_NAME = 'metodopago'
  `);

  if (fk.length === 0) {
    await q('ALTER TABLE pedido ADD CONSTRAINT fk_pedido_metodoPago FOREIGN KEY (metodoPagoId) REFERENCES metodopago(id) ON DELETE SET NULL');
    console.log('✓ FK pedido.metodoPagoId -> metodopago.id creada');
  } else {
    console.log('⏭ FK de metodoPago ya existe');
  }
}

async function ensurePedidoIndex() {
  const idx = await q(`
    SELECT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pedido'
      AND INDEX_NAME = 'idx_pedido_metodoPagoId'
  `);

  if (idx.length === 0) {
    await q('CREATE INDEX idx_pedido_metodoPagoId ON pedido(metodoPagoId)');
    console.log('✓ Indice idx_pedido_metodoPagoId creado');
  } else {
    console.log('⏭ Indice idx_pedido_metodoPagoId ya existe');
  }
}

async function run() {
  try {
    await ensureTableMetodosPago();
    await ensureDefaultMethods();
    await ensurePedidoColumn();
    await ensurePedidoFk();
    await ensurePedidoIndex();

    console.log('\n✅ Migracion de metodos de pago completada');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en migracion:', err.message);
    process.exit(1);
  }
}

run();

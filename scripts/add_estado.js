const db = require('../src/models/db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  const q = (sql, params) => new Promise((res, rej) => db.query(sql, params || [], (e, r) => e ? rej(e) : res(r)));

  // Reorder existing
  await q("UPDATE estadopedido SET orden=4 WHERE nombre='En Camino'");
  await q("UPDATE estadopedido SET orden=5 WHERE nombre='Entregado'");
  await q("UPDATE estadopedido SET orden=6 WHERE nombre='Cancelado'");

  // Insert new
  const id = uuidv4();
  await q('INSERT INTO estadopedido (id, nombre, descripcion, orden) VALUES (?,?,?,?)',
    [id, 'Listo para retirar', 'El pedido está listo para ser retirado en tienda', 3]);

  console.log('Estado insertado:', id);

  const rows = await q('SELECT * FROM estadopedido ORDER BY orden');
  console.log(JSON.stringify(rows, null, 2));
  process.exit();
}
run().catch(e => { console.error(e); process.exit(1); });

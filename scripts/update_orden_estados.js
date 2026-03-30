// scripts/update_orden_estados.js — Actualizar estados de pedidos existentes para probar filtros
const db = require('../src/models/db');
const { v4: uuidv4 } = require('uuid');

async function q(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params || [], (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}

async function run() {
  try {
    console.log('\n🔄 ACTUALIZANDO ESTADOS DE PEDIDOS PARA PRUEBA...\n');

    // Obtener todos los pedidos
    const pedidos = await q('SELECT id FROM pedido ORDER BY creadoEn');
    
    // Obtener los IDs de los estados
    const estados = await q('SELECT id, nombre FROM estadopedido ORDER BY orden');
    
    if (pedidos.length === 0) {
      console.log('No hay pedidos para actualizar');
      process.exit(0);
      return;
    }

    // Distribuir los pedidos entre diferentes estados
    const estadosMap = {};
    estados.forEach(e => {
      estadosMap[e.nombre] = e.id;
    });

    // Actualizar cada pedido con un estado diferente (rotando entre los disponibles)
    for (let i = 0; i < pedidos.length; i++) {
      const estadoIndex = i % estados.length;
      const estadoId = estados[estadoIndex].id;
      const estadoNombre = estados[estadoIndex].nombre;

      await q('UPDATE pedido SET estadoId = ? WHERE id = ?', [estadoId, pedidos[i].id]);
      console.log(`✓ Pedido ${i + 1}: ${estadoNombre}`);
    }

    console.log('\n✅ Estados actualizados correctamente\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();

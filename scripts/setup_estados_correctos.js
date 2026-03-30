// scripts/setup_estados_correctos.js — Configurar los 6 estados de pedido correctamente
const db = require('../src/models/db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  try {
    // Limpiar estados existentes
    await new Promise((resolve, reject) => {
      db.query('DELETE FROM estadopedido', (err) => {
        if (err) {
          console.log('⏭️  No había estados que limpiar');
        } else {
          console.log('✓ Estados anteriores eliminados');
        }
        resolve();
      });
    });

    // Estados correctos en orden
    const estados = [
      { nombre: 'Pendiente', descripcion: 'Pedido pendiente de procesamiento', orden: 1 },
      { nombre: 'En Preparación', descripcion: 'La tienda está preparando tu pedido', orden: 2 },
      { nombre: 'Listo para Retiro', descripcion: 'El pedido está listo para ser retirado', orden: 3 },
      { nombre: 'En Camino', descripcion: 'Tu pedido está en camino', orden: 4 },
      { nombre: 'Entregado', descripcion: 'Pedido entregado con éxito', orden: 5 },
      { nombre: 'Cancelado', descripcion: 'Pedido cancelado', orden: 6 }
    ];

    let idPendiente = null;

    for (const estado of estados) {
      const id = uuidv4();
      if (estado.nombre === 'Pendiente') idPendiente = id;

      await new Promise((resolve, reject) => {
        db.query(
          'INSERT INTO estadopedido (id, nombre, descripcion, orden) VALUES (?, ?, ?, ?)',
          [id, estado.nombre, estado.descripcion, estado.orden],
          (err) => {
            if (err) {
              console.error(`✗ Error insertando ${estado.nombre}:`, err.message);
              reject(err);
            } else {
              console.log(`✓ Estado: ${estado.nombre}`);
              resolve();
            }
          }
        );
      });
    }

    console.log('\n✅ Estados configurados correctamente');
    console.log('ID del estado "Pendiente":', idPendiente);

    // Ver todos los estados
    const todos = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM estadopedido ORDER BY orden', (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });

    console.log('\nEstados en BD:');
    todos.forEach((e, i) => {
      console.log(`${i + 1}. ${e.nombre} (${e.descripcion})`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();

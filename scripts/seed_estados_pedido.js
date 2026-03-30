// scripts/seed_estados_pedido.js — Insertar estados de pedido
const db = require('../src/models/db');
const { v4: uuidv4 } = require('uuid');

const estados = [
  { nombre: 'Aceptado', descripcion: 'Pedido aceptado por la tienda', orden: 1 },
  { nombre: 'En Preparación', descripcion: 'La tienda está preparando tu pedido', orden: 2 },
  { nombre: 'Listo para retirar', descripcion: 'El pedido está listo para ser retirado', orden: 3 },
  { nombre: 'En Camino', descripcion: 'Tu pedido está en camino', orden: 4 },
  { nombre: 'Entregado', descripcion: 'Pedido entregado con éxito', orden: 5 },
  { nombre: 'Cancelado', descripcion: 'Pedido cancelado', orden: 6 }
];

async function run() {
  try {
    // Check if any estado exists
    const existentes = await new Promise((resolve, reject) => {
      db.query('SELECT COUNT(*) as count FROM estadopedido', (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });

    if (existentes[0].count > 0) {
      console.log('Estados de pedido ya existen');
      process.exit(0);
      return;
    }

    // Insert all estados
    let inserted = 0;
    for (const estado of estados) {
      await new Promise((resolve, reject) => {
        db.query(
          'INSERT INTO estadopedido (id, nombre, descripcion, orden) VALUES (?, ?, ?, ?)',
          [uuidv4(), estado.nombre, estado.descripcion, estado.orden],
          (err) => {
            if (err) {
              console.error(`✗ Error insertando ${estado.nombre}:`, err.message);
              reject(err);
            } else {
              console.log(`✓ Estado insertado: ${estado.nombre}`);
              inserted++;
              resolve();
            }
          }
        );
      });
    }

    console.log(`\n✅ ${inserted} estados de pedido inserados`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();

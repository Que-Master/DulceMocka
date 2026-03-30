// scripts/seed_direcciones_pedidos.js — Insertar direcciones y pedidos de ejemplo
const db = require('../src/models/db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  try {
    // Get first client user (not admin)
    const cliente = await new Promise((resolve, reject) => {
      db.query('SELECT u.id FROM usuario u JOIN rol r ON u.rolId = r.id WHERE r.nombre = "cliente" LIMIT 1', (err, rows) => {
        err ? reject(err) : resolve(rows[0]);
      });
    });

    if (!cliente) {
      console.log('No hay clientes. Ejecuta seed_clientes.js primero');
      process.exit(0);
      return;
    }

    // Get a sector
    const sector = await new Promise((resolve, reject) => {
      db.query('SELECT id FROM sector LIMIT 1', (err, rows) => {
        err ? reject(err) : resolve(rows[0]);
      });
    });

    if (!sector) {
      console.log('No hay sectores. Ejecuta seed_sectores.js primero');
      process.exit(0);
      return;
    }

    // Check if direcciones exist
    const dirExistentes = await new Promise((resolve, reject) => {
      db.query('SELECT COUNT(*) as count FROM direccion', (err, rows) => {
        err ? reject(err) : resolve(rows[0].count);
      });
    });

    if (dirExistentes === 0) {
      // Create 3 example addresses
      const direcciones = [
        { calle: 'Calle Principal', numero: '123', nota: 'A mano izquierda' },
        { calle: 'Avenida Central', numero: '456', nota: 'Al lado de la tienda' },
        { calle: 'Calle Secundaria', numero: '789', nota: '' }
      ];

      for (const dir of direcciones) {
        const dirId = uuidv4();
        await new Promise((resolve, reject) => {
          db.query(
            'INSERT INTO direccion (id, calle, numeroCasa, nota, sectorId, activo) VALUES (?, ?, ?, ?, ?, 1)',
            [dirId, dir.calle, dir.numero, dir.nota, sector.id],
            (err) => {
              if (err) {
                console.error('Error insertando dirección:', err.message);
                reject(err);
              } else {
                // Link direccion to client
                db.query(
                  'INSERT INTO usuariodireccion (usuarioId, direccionId, esPrincipal, activo) VALUES (?, ?, ?, 1)',
                  [cliente.id, dirId, dirExistentes === 0 ? 1 : 0],
                  (e2) => {
                    if (e2) console.error('Error:', e2.message);
                    else console.log(`✓ Dirección creada: ${dir.calle} #${dir.numero}`);
                    resolve();
                  }
                );
              }
            }
          );
        });
      }
    } else {
      console.log('Direcciones ya existen');
    }

    // Get delivery type
    const tipoEntrega = await new Promise((resolve, reject) => {
      db.query('SELECT id FROM tipoentrega LIMIT 1', (err, rows) => {
        err ? reject(err) : resolve(rows[0]);
      });
    });

    // Get a product
    const producto = await new Promise((resolve, reject) => {
      db.query('SELECT id, nombre, precio FROM producto LIMIT 1', (err, rows) => {
        err ? reject(err) : resolve(rows[0]);
      });
    });

    // Get first estado
    const estado = await new Promise((resolve, reject) => {
      db.query('SELECT id FROM estadopedido ORDER BY orden LIMIT 1', (err, rows) => {
        err ? reject(err) : resolve(rows[0]);
      });
    });

    // Get first direccion for this user
    const direccion = await new Promise((resolve, reject) => {
      db.query('SELECT d.id FROM direccion d JOIN usuariodireccion ud ON d.id = ud.direccionId WHERE ud.usuarioId = ? LIMIT 1', 
        [cliente.id], (err, rows) => {
        err ? reject(err) : resolve(rows[0]);
      });
    });

    // Check if pedidos exist
    const pedidosExistentes = await new Promise((resolve, reject) => {
      db.query('SELECT COUNT(*) as count FROM pedido', (err, rows) => {
        err ? reject(err) : resolve(rows[0].count);
      });
    });

    if (pedidosExistentes === 0 && producto && tipoEntrega && estado) {
      // Create 2 sample orders
      for (let i = 0; i < 2; i++) {
        const pedidoId = uuidv4();
        const total = producto.precio;
        
        await new Promise((resolve, reject) => {
          db.query(
            `INSERT INTO pedido (id, numeroPedido, usuarioId, nombreContacto, correoContacto, telefonoContacto, 
             tipoEntregaId, direccionId, subtotal, total, estadoId, creadoEn)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [pedidoId, `PED-${Date.now()}-${i}`, cliente.id, 'Cliente Prueba', 'cliente@example.com', '502-1234567',
             tipoEntrega.id, direccion.id, total, total, estado.id],
            (err) => {
              if (err) {
                console.error('Error insertando pedido:', err.message);
                reject(err);
              } else {
                // Add item to order
                db.query(
                  'INSERT INTO pedidoitem (id, pedidoId, productoId, nombreProducto, precioUnitario, cantidad, totalLinea) VALUES (?, ?, ?, ?, ?, 1, ?)',
                  [uuidv4(), pedidoId, producto.id, producto.nombre, producto.precio, total],
                  (e2) => {
                    if (e2) console.error('Error:', e2.message);
                    else console.log(`✓ Pedido creado: ${pedidoId}`);
                    resolve();
                  }
                );
              }
            }
          );
        });
      }
    } else {
      console.log('Pedidos ya existen o faltan datos para crearlos');
    }

    console.log('\n✅ Seed de direcciones y pedidos completado!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();

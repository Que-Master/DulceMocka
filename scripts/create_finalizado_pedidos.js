// scripts/create_finalizado_pedidos.js — Crear pedidos con estados Entregado y Cancelado
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
    console.log('\n📦 CREANDO PEDIDOS CON ESTADOS FINALIZADOS...\n');

    // Obtener cliente
    const clientes = await q('SELECT u.id FROM usuario u JOIN rol r ON u.rolId = r.id WHERE r.nombre = "cliente" LIMIT 1');
    if (clientes.length === 0) {
      console.log('No hay clientes');
      process.exit(0);
      return;
    }
    const clienteId = clientes[0].id;

    // Obtener tipo entrega
    const tiposEntrega = await q('SELECT id FROM tipoentrega LIMIT 1');
    if (tiposEntrega.length === 0) {
      console.log('No hay tipos de entrega');
      process.exit(0);
      return;
    }
    const tipoEntregaId = tiposEntrega[0].id;

    // Obtener producto
    const productos = await q('SELECT id, precio FROM producto LIMIT 1');
    if (productos.length === 0) {
      console.log('No hay productos');
      process.exit(0);
      return;
    }
    const productoId = productos[0].id;
    const precio = productos[0].precio;

    // Obtener estados Entregado y Cancelado
    const estadoEntregado = await q('SELECT id FROM estadopedido WHERE nombre = "Entregado"');
    const estadoCancelado = await q('SELECT id FROM estadopedido WHERE nombre = "Cancelado"');

    if (estadoEntregado.length === 0 || estadoCancelado.length === 0) {
      console.log('No hay estados Entregado o Cancelado');
      process.exit(0);
      return;
    }

    // Crear pedido Entregado
    const pedido1Id = uuidv4();
    const numeroPedido1 = 'DSM-' + (Math.floor(Math.random() * 900000) + 100000);
    
    await q(
      `INSERT INTO pedido (id, numeroPedido, usuarioId, nombreContacto, correoContacto, telefonoContacto,
       tipoEntregaId, subtotal, total, estadoId, creadoEn, entregadoEn)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [pedido1Id, numeroPedido1, clienteId, 'Cliente Entregado', 'entregado@test.com', '502-1111111',
       tipoEntregaId, precio, precio, estadoEntregado[0].id]
    );

    await q(
      'INSERT INTO pedidoitem (id, pedidoId, productoId, nombreProducto, precioUnitario, cantidad, totalLinea) VALUES (?,?,?,?,?,1,?)',
      [uuidv4(), pedido1Id, productoId, 'Producto', precio, precio]
    );

    console.log(`✓ Pedido Entregado: ${numeroPedido1}`);

    // Crear pedido Cancelado
    const pedido2Id = uuidv4();
    const numeroPedido2 = 'DSM-' + (Math.floor(Math.random() * 900000) + 100000);
    
    await q(
      `INSERT INTO pedido (id, numeroPedido, usuarioId, nombreContacto, correoContacto, telefonoContacto,
       tipoEntregaId, subtotal, total, estadoId, creadoEn)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
      [pedido2Id, numeroPedido2, clienteId, 'Cliente Cancelado', 'cancelado@test.com', '502-2222222',
       tipoEntregaId, precio, precio, estadoCancelado[0].id]
    );

    await q(
      'INSERT INTO pedidoitem (id, pedidoId, productoId, nombreProducto, precioUnitario, cantidad, totalLinea) VALUES (?,?,?,?,?,1,?)',
      [uuidv4(), pedido2Id, productoId, 'Producto', precio, precio]
    );

    console.log(`✓ Pedido Cancelado: ${numeroPedido2}`);

    console.log('\n✅ Pedidos finalizados creados correctamente\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();

// scripts/data_summary.js — Mostrar resumen de datos en BD
const db = require('../src/models/db');

async function query(sql) {
  return new Promise((resolve, reject) => {
    db.query(sql, (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}

async function run() {
  try {
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMEN DE DATOS EN DULCEMOCKA');
    console.log('='.repeat(50) + '\n');

    const usuarios = await query('SELECT COUNT(*) as count FROM usuario');
    const roles = await query('SELECT COUNT(*) as count FROM rol');
    const categorias = await query('SELECT COUNT(*) as count FROM categoria');
    const productos = await query('SELECT COUNT(*) as count FROM producto');
    const ingredientes = await query('SELECT COUNT(*) as count FROM ingrediente');
    const sectores = await query('SELECT COUNT(*) as count FROM sector');
    const direcciones = await query('SELECT COUNT(*) as count FROM direccion');
    const pedidos = await query('SELECT COUNT(*) as count FROM pedido');
    const cupones = await query('SELECT COUNT(*) as count FROM cupon');
    const estados = await query('SELECT COUNT(*) as count FROM estadopedido');

    console.log('👥 USUARIOS:', usuarios[0].count);
    console.log('🔐 ROLES:', roles[0].count);
    console.log('🎂 CATEGORÍAS:', categorias[0].count);
    console.log('📦 PRODUCTOS:', productos[0].count);
    console.log('🥄 INGREDIENTES:', ingredientes[0].count);
    console.log('📍 SECTORES:', sectores[0].count);
    console.log('🏠 DIRECCIONES:', direcciones[0].count);
    console.log('📋 PEDIDOS:', pedidos[0].count);
    console.log('🎟️  CUPONES:', cupones[0].count);
    console.log('📊 ESTADOS PEDIDO:', estados[0].count);

    console.log('\n' + '='.repeat(50));
    console.log('🔐 ADMIN CREDENTIALS');
    console.log('='.repeat(50));
    console.log('Email: admin@dulcemocka.com');
    console.log('Pass:  123');

    console.log('\n' + '='.repeat(50));
    console.log('👤 CLIENTES DE PRUEBA');
    console.log('='.repeat(50));
    const clientes = await query(`
      SELECT u.nombre, u.correo, u.telefono, u.mockaPoints 
      FROM usuario u 
      JOIN rol r ON u.rolId = r.id 
      WHERE r.nombre = 'cliente' 
      LIMIT 5
    `);
    clientes.forEach(c => {
      console.log(`- ${c.nombre}`);
      console.log(`  Email: ${c.correo} | Pass: 123`);
      console.log(`  Puntos: ${c.mockaPoints}`);
    });

    console.log('\n' + '='.repeat(50));
    console.log('🎟️  CUPONES DISPONIBLES');
    console.log('='.repeat(50));
    const cuponesList = await query(`
      SELECT c.codigo, c.nombre, c.porcentajeDescuento, cs.disponibles 
      FROM cupon c 
      LEFT JOIN cuponstock cs ON c.id = cs.cuponId 
      WHERE c.activo = 1
      LIMIT 5
    `);
    cuponesList.forEach(c => {
      console.log(`- ${c.codigo}: ${c.nombre} (${c.porcentajeDescuento}% desc) - ${c.disponibles} disponibles`);
    });

    console.log('\n' + '='.repeat(50) + '\n');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();

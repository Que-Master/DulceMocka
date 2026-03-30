// scripts/seed_clientes.js — Insertar clientes y cupones de ejemplo
const db = require('../src/models/db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function run() {
  try {
    // Get cliente role
    const clientRole = await new Promise((resolve, reject) => {
      db.query('SELECT id FROM rol WHERE nombre = "cliente" LIMIT 1', (err, rows) => {
        err ? reject(err) : resolve(rows[0]);
      });
    });

    if (!clientRole) {
      console.error('Rol cliente no encontrado. Ejecuta seed_admin.js primero');
      process.exit(1);
      return;
    }

    // Clientes de ejemplo
    const clientes = [
      { nombre: 'Juan Pérez', correo: 'juan@example.com', telefono: '502-1234567', password: '123' },
      { nombre: 'María García', correo: 'maria@example.com', telefono: '502-9876543', password: '123' },
      { nombre: 'Carlos López', correo: 'carlos@example.com', telefono: '502-5555555', password: '123' },
      { nombre: 'Ana Rodríguez', correo: 'ana@example.com', telefono: '502-4444444', password: '123' }
    ];

    // Check if clients exist
    const existentes = await new Promise((resolve, reject) => {
      db.query('SELECT COUNT(*) as count FROM usuario WHERE rolId = ?', [clientRole.id], (err, rows) => {
        err ? reject(err) : resolve(rows[0].count);
      });
    });

    if (existentes > 0) {
      console.log('Clientes ya existen');
    } else {
      for (const cliente of clientes) {
        try {
          const hash = bcrypt.hashSync(cliente.password, 10);
          await new Promise((resolve, reject) => {
            db.query(
              'INSERT INTO usuario (id, nombre, correo, telefono, password, rolId, activo, mockaPoints) VALUES (?, ?, ?, ?, ?, ?, 1, 100)',
              [uuidv4(), cliente.nombre, cliente.correo, cliente.telefono, hash, clientRole.id],
              (err) => {
                if (err) reject(err);
                else {
                  console.log(`✓ Cliente creado: ${cliente.nombre}`);
                  resolve();
                }
              }
            );
          });
        } catch (e) {
          if (!e.message.includes('Duplicate entry')) {
            console.error(`✗ Error con ${cliente.nombre}:`, e.message);
          } else {
            console.log(`⏭️  Cliente ya existe: ${cliente.nombre}`);
          }
        }
      }
    }

    // Agregar cupones
    const cupones = [
      { nombre: 'Descuento 10%', codigo: 'DESC10', porcentaje: 10, limiteDescuento: 100, minimoCompra: 50, dias: 30 },
      { nombre: 'Descuento 20%', codigo: 'DESC20', porcentaje: 20, limiteDescuento: 150, minimoCompra: 100, dias: 30 },
      { nombre: 'Envío Gratis', codigo: 'ENVIOGRATIS', porcentaje: 0, limiteDescuento: 0, minimoCompra: 75, dias: 60 }
    ];

    const cuponesExistentes = await new Promise((resolve, reject) => {
      db.query('SELECT COUNT(*) as count FROM cupon', (err, rows) => {
        err ? reject(err) : resolve(rows[0].count);
      });
    });

    if (cuponesExistentes > 0) {
      console.log('Cupones ya existen');
    } else {
      for (const cupon of cupones) {
        try {
          const id = uuidv4();
          const venceEn = new Date();
          venceEn.setDate(venceEn.getDate() + cupon.dias);

          await new Promise((resolve, reject) => {
            db.query(
              'INSERT INTO cupon (id, nombre, codigo, porcentajeDescuento, limiteDescuento, minimoCompra, activo, venceEn) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
              [id, cupon.nombre, cupon.codigo, cupon.porcentaje, cupon.limiteDescuento, cupon.minimoCompra, venceEn],
              (err) => {
                if (err) reject(err);
                else {
                  // Add stock
                  db.query('INSERT INTO cuponstock (cuponId, disponibles) VALUES (?, 50)', [id], (e2) => {
                    if (e2) console.error('Error con stock:', e2.message);
                    else console.log(`✓ Cupón creado: ${cupon.nombre} (${cupon.codigo})`);
                    resolve();
                  });
                }
              }
            );
          });
        } catch (e) {
          console.error(`✗ Error con cupón:`, e.message);
        }
      }
    }

    console.log('\n✅ Seed de clientes y cupones completado!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();

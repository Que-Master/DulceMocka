// scripts/seed_admin.js — Crear rol admin y usuario admin
const db = require('../src/models/db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const ADMIN_ROLE_ID = uuidv4();
const CLIENT_ROLE_ID = uuidv4();
const ADMIN_USER_ID = uuidv4();

const steps = [
  // Roles
  (next) => {
    db.query("SELECT id FROM rol WHERE nombre = 'admin' LIMIT 1", (err, rows) => {
      if (rows && rows.length > 0) { console.log('Rol admin ya existe'); return next(rows[0].id); }
      db.query("INSERT INTO rol (id, nombre, descripcion) VALUES (?, 'admin', 'Administrador del sistema')", [ADMIN_ROLE_ID], (e) => {
        if (e) console.error('Error creando rol admin:', e.message);
        else console.log('Rol admin creado');
        next(ADMIN_ROLE_ID);
      });
    });
  },
  // Rol cliente
  (next, adminRoleId) => {
    db.query("SELECT id FROM rol WHERE nombre = 'cliente' LIMIT 1", (err, rows) => {
      if (rows && rows.length > 0) { console.log('Rol cliente ya existe'); return next(adminRoleId); }
      db.query("INSERT INTO rol (id, nombre, descripcion) VALUES (?, 'cliente', 'Cliente de la tienda')", [CLIENT_ROLE_ID], (e) => {
        if (e) console.error('Error creando rol cliente:', e.message);
        else console.log('Rol cliente creado');
        next(adminRoleId);
      });
    });
  },
  // Tipos de entrega
  (next, adminRoleId) => {
    db.query("SELECT id FROM tipoentrega LIMIT 1", (err, rows) => {
      if (rows && rows.length > 0) { console.log('Tipos de entrega ya existen'); return next(adminRoleId); }
      const id1 = uuidv4(), id2 = uuidv4();
      db.query("INSERT INTO tipoentrega (id, nombre, descripcion) VALUES (?, 'Delivery', 'Entrega a domicilio'), (?, 'Recogida', 'Recoger en tienda')", [id1, id2], (e) => {
        if (e) console.error('Error:', e.message);
        else console.log('Tipos de entrega creados');
        next(adminRoleId);
      });
    });
  },
  // Usuario admin
  (next, adminRoleId) => {
    db.query("SELECT id FROM usuario WHERE correo = 'admin@dulcemocka.com' LIMIT 1", (err, rows) => {
      if (rows && rows.length > 0) { console.log('Usuario admin ya existe'); return next(); }
      const hash = bcrypt.hashSync('123', 10);
      db.query(
        "INSERT INTO usuario (id, nombre, correo, password, rolId, activo) VALUES (?, 'Administrador', 'admin@dulcemocka.com', ?, ?, 1)",
        [ADMIN_USER_ID, hash, adminRoleId],
        (e) => {
          if (e) console.error('Error creando admin:', e.message);
          else console.log('Usuario admin creado — correo: admin@dulcemocka.com / pass: 123');
          next();
        }
      );
    });
  }
];

// Run steps sequentially passing adminRoleId
let i = 0;
function run(adminRoleId) {
  if (i >= steps.length) { console.log('\nSeed completado!'); process.exit(); return; }
  const step = steps[i++];
  step(run, adminRoleId);
}
run();

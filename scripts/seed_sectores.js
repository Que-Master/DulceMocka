// scripts/seed_sectores.js
// Inserta datos de prueba en la tabla `sector`.

const db = require('../src/models/db');
const { randomUUID } = require('crypto');

async function run(){
  const sectores = [
    { nombre: 'Centro', descripcion: 'Zona céntrica y comercial', precioEnvio: 1200 },
    { nombre: 'Norte', descripcion: 'Sector norte de la ciudad', precioEnvio: 1500 },
    { nombre: 'Sur', descripcion: 'Sector sur de la ciudad', precioEnvio: 1800 },
    { nombre: 'Oriente', descripcion: 'Sector oriente', precioEnvio: 2000 },
    { nombre: 'Poniente', descripcion: 'Sector poniente', precioEnvio: 1600 }
  ];

  for(const s of sectores){
    const id = randomUUID();
    const sql = `INSERT INTO sector (id, nombre, descripcion, precioEnvio, activo) VALUES (?, ?, ?, ?, 1)`;
    try{
      await new Promise((res,rej)=> db.query(sql, [id, s.nombre, s.descripcion, s.precioEnvio], (err)=> err? rej(err): res()));
      console.log('Inserted sector', s.nombre);
    }catch(e){
      console.error('Failed inserting', s.nombre, e.message);
    }
  }

  db.end();
}

run().catch(e=>{ console.error(e); db.end(); process.exit(1); });

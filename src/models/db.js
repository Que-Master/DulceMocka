// src/models/db.js
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost', 
  user: 'root', 
  password: '', 
  database: 'dulce_mocka' 
});

module.exports = db;

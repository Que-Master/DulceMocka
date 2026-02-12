// src/models/direccionModel.js
const db = require('./db');

const DireccionModel = {

  /** Obtener todas las direcciones activas de un usuario */
  getByUsuario(usuarioId, callback) {
    const sql = `
      SELECT d.id, d.calle, d.numeroCasa, d.nota, d.sectorId,
             s.nombre AS sectorNombre, s.precioEnvio,
             ud.esPrincipal
      FROM usuariodireccion ud
      JOIN direccion d ON d.id = ud.direccionId AND d.activo = 1
      LEFT JOIN sector s ON s.id = d.sectorId AND s.activo = 1
      WHERE ud.usuarioId = ? AND ud.activo = 1
      ORDER BY ud.esPrincipal DESC, d.creadaEn DESC`;
    db.query(sql, [usuarioId], callback);
  },

  /** Obtener una dirección por id (verificando que pertenezca al usuario) */
  getById(direccionId, usuarioId, callback) {
    const sql = `
      SELECT d.id, d.calle, d.numeroCasa, d.nota, d.sectorId,
             s.nombre AS sectorNombre, s.precioEnvio,
             ud.esPrincipal
      FROM usuariodireccion ud
      JOIN direccion d ON d.id = ud.direccionId AND d.activo = 1
      LEFT JOIN sector s ON s.id = d.sectorId AND s.activo = 1
      WHERE ud.direccionId = ? AND ud.usuarioId = ? AND ud.activo = 1
      LIMIT 1`;
    db.query(sql, [direccionId, usuarioId], callback);
  },

  /** Crear una dirección y asociarla al usuario */
  create(usuarioId, data, callback) {
    const { id, calle, numeroCasa, nota, sectorId, esPrincipal } = data;

    // Si esPrincipal, quitar principal de las demás
    const chain = (next) => {
      if (esPrincipal) {
        db.query('UPDATE usuariodireccion SET esPrincipal = 0 WHERE usuarioId = ?', [usuarioId], () => next());
      } else {
        next();
      }
    };

    chain(() => {
      db.query(
        'INSERT INTO direccion (id, calle, numeroCasa, nota, sectorId) VALUES (?, ?, ?, ?, ?)',
        [id, calle, numeroCasa || null, nota || null, sectorId || null],
        (err) => {
          if (err) return callback(err);
          db.query(
            'INSERT INTO usuariodireccion (usuarioId, direccionId, esPrincipal) VALUES (?, ?, ?)',
            [usuarioId, id, esPrincipal ? 1 : 0],
            callback
          );
        }
      );
    });
  },

  /** Actualizar una dirección existente */
  update(direccionId, usuarioId, data, callback) {
    const { calle, numeroCasa, nota, sectorId, esPrincipal } = data;

    // Verificar que la dirección pertenece al usuario
    db.query(
      'SELECT 1 FROM usuariodireccion WHERE usuarioId = ? AND direccionId = ? AND activo = 1',
      [usuarioId, direccionId],
      (err, rows) => {
        if (err) return callback(err);
        if (!rows || rows.length === 0) return callback(new Error('Dirección no encontrada'));

        const chain = (next) => {
          if (esPrincipal) {
            db.query('UPDATE usuariodireccion SET esPrincipal = 0 WHERE usuarioId = ?', [usuarioId], () => next());
          } else {
            next();
          }
        };

        chain(() => {
          db.query(
            'UPDATE direccion SET calle = ?, numeroCasa = ?, nota = ?, sectorId = ? WHERE id = ?',
            [calle, numeroCasa || null, nota || null, sectorId || null, direccionId],
            (err2) => {
              if (err2) return callback(err2);
              db.query(
                'UPDATE usuariodireccion SET esPrincipal = ? WHERE usuarioId = ? AND direccionId = ?',
                [esPrincipal ? 1 : 0, usuarioId, direccionId],
                callback
              );
            }
          );
        });
      }
    );
  },

  /** Soft-delete de dirección */
  delete(direccionId, usuarioId, callback) {
    db.query(
      'SELECT 1 FROM usuariodireccion WHERE usuarioId = ? AND direccionId = ? AND activo = 1',
      [usuarioId, direccionId],
      (err, rows) => {
        if (err) return callback(err);
        if (!rows || rows.length === 0) return callback(new Error('Dirección no encontrada'));

        db.query('UPDATE direccion SET activo = 0, eliminadoEn = NOW() WHERE id = ?', [direccionId], (err2) => {
          if (err2) return callback(err2);
          db.query(
            'UPDATE usuariodireccion SET activo = 0 WHERE usuarioId = ? AND direccionId = ?',
            [usuarioId, direccionId],
            callback
          );
        });
      }
    );
  },

  /** Marcar una dirección como principal */
  setPrincipal(direccionId, usuarioId, callback) {
    db.query('UPDATE usuariodireccion SET esPrincipal = 0 WHERE usuarioId = ?', [usuarioId], (err) => {
      if (err) return callback(err);
      db.query(
        'UPDATE usuariodireccion SET esPrincipal = 1 WHERE usuarioId = ? AND direccionId = ? AND activo = 1',
        [usuarioId, direccionId],
        callback
      );
    });
  }
};

module.exports = DireccionModel;

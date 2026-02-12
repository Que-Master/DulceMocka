// src/controllers/cuponController.js
const db = require('../models/db');

function q(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params || [], (err, result) => {
      if (err) reject(err); else resolve(result);
    });
  });
}

const CuponController = {

  /**
   * GET /api/perfil/cupones — cupones del usuario autenticado
   */
  async misCupones(req, res) {
    try {
      const rows = await q(`
        SELECT c.id, c.nombre, c.codigo, c.porcentajeDescuento, c.limiteDescuento,
               c.minimoCompra, c.venceEn, c.activo,
               uc.asignadoEn, uc.usadoEn
        FROM usuariocupon uc
        JOIN cupon c ON c.id = uc.cuponId
        WHERE uc.usuarioId = ? AND uc.eliminadoEn IS NULL
        ORDER BY uc.usadoEn IS NULL DESC, uc.asignadoEn DESC`, [req.user.id]);

      // Clasificar
      const ahora = new Date();
      const cupones = rows.map(c => {
        const vencido = c.venceEn && new Date(c.venceEn) < ahora;
        const usado = !!c.usadoEn;
        const inactivo = !c.activo;
        let estado = 'disponible';
        if (usado) estado = 'usado';
        else if (vencido) estado = 'vencido';
        else if (inactivo) estado = 'inactivo';
        return { ...c, estado };
      });

      res.json({ cupones });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /**
   * POST /api/perfil/cupones/reclamar — reclamar cupón con código
   */
  async reclamarCupon(req, res) {
    try {
      const { codigo } = req.body;
      if (!codigo || !codigo.trim()) {
        return res.status(400).json({ error: 'Debes ingresar un código de cupón' });
      }

      // Buscar cupón activo
      const cupones = await q('SELECT * FROM cupon WHERE codigo = ? AND activo = 1', [codigo.trim().toUpperCase()]);
      if (!cupones || cupones.length === 0) {
        return res.status(404).json({ error: 'Código de cupón no válido o inactivo' });
      }
      const cupon = cupones[0];

      // Verificar vencimiento
      if (cupon.venceEn && new Date(cupon.venceEn) < new Date()) {
        return res.status(400).json({ error: 'Este cupón ya ha vencido' });
      }

      // Verificar stock
      const stocks = await q('SELECT disponibles FROM cuponstock WHERE cuponId = ?', [cupon.id]);
      if (stocks.length > 0 && stocks[0].disponibles <= 0) {
        return res.status(400).json({ error: 'Este cupón ya no tiene disponibilidad' });
      }

      // Verificar que el usuario no lo tenga ya
      const existing = await q(
        'SELECT * FROM usuariocupon WHERE usuarioId = ? AND cuponId = ? AND eliminadoEn IS NULL',
        [req.user.id, cupon.id]
      );
      if (existing.length > 0) {
        if (existing[0].usadoEn) {
          return res.status(400).json({ error: 'Ya utilizaste este cupón anteriormente' });
        }
        return res.status(400).json({ error: 'Ya tienes este cupón en tu cuenta' });
      }

      // Asignar cupón al usuario
      await q('INSERT INTO usuariocupon (usuarioId, cuponId) VALUES (?, ?)', [req.user.id, cupon.id]);

      // Decrementar stock si aplica
      if (stocks.length > 0) {
        await q('UPDATE cuponstock SET disponibles = disponibles - 1 WHERE cuponId = ?', [cupon.id]);
      }

      res.json({
        ok: true,
        message: '¡Cupón reclamado exitosamente!',
        cupon: {
          id: cupon.id,
          nombre: cupon.nombre,
          codigo: cupon.codigo,
          porcentajeDescuento: cupon.porcentajeDescuento,
          limiteDescuento: cupon.limiteDescuento,
          minimoCompra: cupon.minimoCompra,
          venceEn: cupon.venceEn
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /**
   * DELETE /api/perfil/cupones/:id — eliminar cupón de mi cuenta
   */
  async eliminarCupon(req, res) {
    try {
      await q('UPDATE usuariocupon SET eliminadoEn = NOW() WHERE usuarioId = ? AND cuponId = ?',
        [req.user.id, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /**
   * POST /api/cupones/validar — validar cupón para aplicar en carrito
   * Body: { codigo, subtotal }
   */
  async validarCupon(req, res) {
    try {
      const { codigo, subtotal } = req.body;
      if (!codigo) return res.status(400).json({ error: 'Código requerido' });

      const userId = (req.isAuthenticated && req.isAuthenticated()) ? req.user.id : null;

      // Buscar cupón
      const cupones = await q('SELECT * FROM cupon WHERE codigo = ? AND activo = 1', [codigo.trim().toUpperCase()]);
      if (!cupones.length) {
        return res.status(404).json({ error: 'Código de cupón no válido' });
      }
      const cupon = cupones[0];

      // Vencimiento
      if (cupon.venceEn && new Date(cupon.venceEn) < new Date()) {
        return res.status(400).json({ error: 'Este cupón ha vencido' });
      }

      // Mínimo de compra
      const sub = Number(subtotal) || 0;
      const minCompra = Number(cupon.minimoCompra) || 0;
      if (minCompra > 0 && sub < minCompra) {
        return res.status(400).json({
          error: 'El mínimo de compra para este cupón es $' + minCompra.toLocaleString('es-CL')
        });
      }

      // Si el usuario está autenticado, verificar que tenga el cupón asignado y no usado
      if (userId) {
        const uc = await q(
          'SELECT * FROM usuariocupon WHERE usuarioId = ? AND cuponId = ? AND eliminadoEn IS NULL',
          [userId, cupon.id]
        );
        if (!uc.length) {
          return res.status(400).json({ error: 'No tienes este cupón. Reclámalo primero en tu perfil.' });
        }
        if (uc[0].usadoEn) {
          return res.status(400).json({ error: 'Ya utilizaste este cupón' });
        }
      }

      // Calcular descuento
      const porciento = Number(cupon.porcentajeDescuento) || 0;
      const limite = Number(cupon.limiteDescuento) || Infinity;
      let descuento = (sub * porciento) / 100;
      if (descuento > limite) descuento = limite;
      descuento = Math.round(descuento);

      res.json({
        ok: true,
        cupon: {
          id: cupon.id,
          nombre: cupon.nombre,
          codigo: cupon.codigo,
          porcentajeDescuento: porciento,
          limiteDescuento: Number(cupon.limiteDescuento) || null,
          minimoCompra: minCompra
        },
        descuento
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = CuponController;

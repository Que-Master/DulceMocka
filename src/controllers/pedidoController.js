// src/controllers/pedidoController.js
const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');

function q(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params || [], (err, result) => {
      if (err) reject(err); else resolve(result);
    });
  });
}

const PedidoController = {

  /* ── Crear pedido ── */
  async crearPedido(req, res) {
    try {
      const {
        nombre, email, telefono,
        delivery,          // 'domicilio' | 'recogida'
        direccion,         // { calle, numero, sectorId, notas }
        items,             // [{ productoId, nombre, precio, cantidad, notas, ingredientesQuitados }]
        subtotal, total,
        cuponCodigo        // código del cupón aplicado (opcional)
      } = req.body;

      if (!nombre || !email || !telefono) {
        return res.status(400).json({ error: 'Nombre, correo y teléfono son obligatorios' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'El pedido debe tener al menos un item' });
      }

      const pedidoId = uuidv4();
      const numeroPedido = 'DSM-' + (Math.floor(Math.random() * 900000) + 100000);

      // Resolver tipoEntregaId
      let tipoEntregaId = null;
      if (delivery === 'domicilio') {
        const [te] = await q("SELECT id FROM tipoentrega WHERE nombre='Delivery' LIMIT 1");
        if (te) tipoEntregaId = te.id;
      } else {
        const [te] = await q("SELECT id FROM tipoentrega WHERE nombre='Recogida' LIMIT 1");
        if (te) tipoEntregaId = te.id;
      }

      // Crear dirección si es domicilio
      let direccionId = null;
      if (delivery === 'domicilio' && direccion) {
        direccionId = uuidv4();
        await q(
          'INSERT INTO direccion (id, calle, numeroCasa, sectorId, nota) VALUES (?,?,?,?,?)',
          [direccionId, direccion.calle || '', direccion.numero || '', direccion.sectorId || null, direccion.notas || null]
        );
      }

      // Estado inicial: Pendiente
      const [estadoPendiente] = await q("SELECT id FROM estadopedido WHERE nombre='Pendiente' LIMIT 1");
      const estadoId = estadoPendiente ? estadoPendiente.id : null;

      // Calcular subtotal y total desde items
      let computedSubtotal = 0;
      items.forEach(it => {
        computedSubtotal += (Number(it.precio) || 0) * (Number(it.cantidad) || 1);
      });
      const finalSubtotal = subtotal != null ? Number(subtotal) : computedSubtotal;
      const finalTotal = total != null ? Number(total) : computedSubtotal;

      // Usuario autenticado?
      const usuarioId = (req.isAuthenticated && req.isAuthenticated()) ? req.user.id : null;

      // Cupón aplicado?
      let cuponId = null;
      let codigoCuponSnapshot = null;
      let descuentoTotal = 0;

      if (cuponCodigo && cuponCodigo.trim()) {
        const cupones = await q('SELECT * FROM cupon WHERE codigo = ? AND activo = 1', [cuponCodigo.trim().toUpperCase()]);
        if (cupones.length > 0) {
          const cupon = cupones[0];
          const vencido = cupon.venceEn && new Date(cupon.venceEn) < new Date();
          const minCompra = Number(cupon.minimoCompra) || 0;

          if (!vencido && finalSubtotal >= minCompra) {
            cuponId = cupon.id;
            codigoCuponSnapshot = cupon.codigo;

            const porciento = Number(cupon.porcentajeDescuento) || 0;
            const limite = Number(cupon.limiteDescuento) || Infinity;
            descuentoTotal = Math.round((finalSubtotal * porciento) / 100);
            if (descuentoTotal > limite) descuentoTotal = limite;

            // Marcar como usado si el usuario está autenticado
            if (usuarioId) {
              await q('UPDATE usuariocupon SET usadoEn = NOW() WHERE usuarioId = ? AND cuponId = ? AND usadoEn IS NULL',
                [usuarioId, cupon.id]);
            }
          }
        }
      }

      const finalTotalConDescuento = Math.max(0, finalTotal - descuentoTotal);

      // Insertar pedido
      await q(
        `INSERT INTO pedido (id, numeroPedido, usuarioId, nombreContacto, correoContacto, telefonoContacto,
         tipoEntregaId, direccionId, cuponId, codigoCuponSnapshot, subtotal, total, descuentoTotal, estadoId, creadoEn)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
        [pedidoId, numeroPedido, usuarioId, nombre, email, telefono, tipoEntregaId, direccionId,
         cuponId, codigoCuponSnapshot, finalSubtotal, finalTotalConDescuento, descuentoTotal, estadoId]
      );

      // Insertar items
      for (const it of items) {
        const itemId = uuidv4();
        const qty = Number(it.cantidad) || 1;
        const precio = Number(it.precio) || 0;
        const totalLinea = precio * qty;

        // Construir notas con ingredientes quitados
        let notasItem = it.notas || '';
        if (Array.isArray(it.ingredientesQuitados) && it.ingredientesQuitados.length > 0) {
          const sinList = it.ingredientesQuitados.map(ig => ig.nombre || ig).join(', ');
          notasItem = (notasItem ? notasItem + ' | ' : '') + 'Sin: ' + sinList;
        }

        await q(
          `INSERT INTO pedidoitem (id, pedidoId, productoId, nombreProducto, precioUnitario, cantidad, notasItem, totalLinea)
           VALUES (?,?,?,?,?,?,?,?)`,
          [itemId, pedidoId, it.productoId || null, it.nombre || 'Producto', precio, qty, notasItem || null, totalLinea]
        );
      }

      res.json({
        ok: true,
        pedido: {
          id: pedidoId,
          numeroPedido,
          estado: 'Pendiente',
          total: finalTotalConDescuento,
          descuento: descuentoTotal,
          cuponAplicado: codigoCuponSnapshot
        }
      });
    } catch (err) {
      console.error('Error creando pedido:', err);
      res.status(500).json({ error: 'Error al crear pedido: ' + err.message });
    }
  },

  /* ── Obtener pedido por ID ── */
  async obtenerPedido(req, res) {
    try {
      const [pedido] = await q(`
        SELECT p.*, ep.nombre AS estado, te.nombre AS tipoEntrega,
               d.calle, d.numeroCasa, d.nota AS notaDireccion, s.nombre AS sector,
               s.precioEnvio AS precioEnvio
        FROM pedido p
        LEFT JOIN estadopedido ep ON ep.id = p.estadoId
        LEFT JOIN tipoentrega te ON te.id = p.tipoEntregaId
        LEFT JOIN direccion d ON d.id = p.direccionId
        LEFT JOIN sector s ON s.id = d.sectorId
        WHERE p.id = ?`, [req.params.id]);

      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      const items = await q(
        'SELECT * FROM pedidoitem WHERE pedidoId = ? AND eliminadoEn IS NULL',
        [req.params.id]
      );

      res.json({ pedido, items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ── Mis pedidos (usuario autenticado) ── */
  async misPedidos(req, res) {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      const pedidos = await q(`
        SELECT p.id, p.numeroPedido, p.subtotal, p.descuentoTotal, p.total,
               p.creadoEn, p.entregadoEn,
               ep.nombre AS estado,
               te.nombre AS tipoEntrega
        FROM pedido p
        LEFT JOIN estadopedido ep ON ep.id = p.estadoId
        LEFT JOIN tipoentrega te ON te.id = p.tipoEntregaId
        WHERE p.usuarioId = ?
        ORDER BY p.creadoEn DESC`, [req.user.id]);

      // Traer items de cada pedido
      for (const p of pedidos) {
        p.items = await q(
          'SELECT nombreProducto, cantidad, precioUnitario, totalLinea, notasItem FROM pedidoitem WHERE pedidoId = ? AND eliminadoEn IS NULL',
          [p.id]
        );
      }

      res.json({ pedidos });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = PedidoController;

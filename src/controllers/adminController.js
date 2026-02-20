// src/controllers/adminController.js
const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { crearNotificacion } = require('./notificacionController');

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
function q(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params || [], (err, result) => {
      if (err) reject(err); else resolve(result);
    });
  });
}

const AdminController = {

  /* ══════════════════════════════════════════
     DASHBOARD
     ══════════════════════════════════════════ */
  async dashboard(req, res) {
    try {
      const [users] = await q('SELECT COUNT(*) AS c FROM usuario WHERE activo=1');
      const [products] = await q('SELECT COUNT(*) AS c FROM producto WHERE activo=1');
      const [orders] = await q('SELECT COUNT(*) AS c FROM pedido');
      const [revenue] = await q('SELECT COALESCE(SUM(total),0) AS c FROM pedido');

      // Pedidos por estado
      const ordersByStatus = await q(`
        SELECT ep.nombre AS estado, COUNT(p.id) AS cantidad
        FROM estadopedido ep LEFT JOIN pedido p ON p.estadoId = ep.id
        GROUP BY ep.id, ep.nombre ORDER BY ep.orden`);

      // Últimos 5 pedidos
      const recentOrders = await q(`
        SELECT p.id, p.numeroPedido, p.nombreContacto, p.total, p.creadoEn,
               ep.nombre AS estado
        FROM pedido p
        LEFT JOIN estadopedido ep ON ep.id = p.estadoId
        ORDER BY p.creadoEn DESC LIMIT 5`);

      // Ventas últimos 7 días
      const salesWeek = await q(`
        SELECT DATE(creadoEn) AS dia, COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS ventas
        FROM pedido
        WHERE creadoEn >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(creadoEn) ORDER BY dia`);

      // Top 5 productos más vendidos
      const topProducts = await q(`
        SELECT pi.nombreProducto, SUM(pi.cantidad) AS vendidos, SUM(pi.totalLinea) AS ingresos
        FROM pedidoitem pi
        GROUP BY pi.nombreProducto ORDER BY vendidos DESC LIMIT 5`);

      res.json({
        stats: {
          totalUsers: users.c,
          totalProducts: products.c,
          totalOrders: orders.c,
          totalRevenue: revenue.c
        },
        ordersByStatus,
        recentOrders,
        salesWeek,
        topProducts
      });
    } catch (err) {
      res.status(500).json({ error: 'Error cargando dashboard: ' + err.message });
    }
  },

  /* ══════════════════════════════════════════
     PEDIDOS
     ══════════════════════════════════════════ */
  async getOrders(req, res) {
    try {
      const rows = await q(`
        SELECT p.id, p.numeroPedido, p.nombreContacto, p.correoContacto, p.telefonoContacto,
               p.subtotal, p.descuentoTotal, p.total, p.creadoEn, p.entregadoEn,
               ep.nombre AS estado, ep.id AS estadoId,
               te.nombre AS tipoEntrega,
               d.calle, d.numeroCasa, s.nombre AS sector
        FROM pedido p
        LEFT JOIN estadopedido ep ON ep.id = p.estadoId
        LEFT JOIN tipoentrega te ON te.id = p.tipoEntregaId
        LEFT JOIN direccion d ON d.id = p.direccionId
        LEFT JOIN sector s ON s.id = d.sectorId
        ORDER BY p.creadoEn DESC`);
      res.json({ pedidos: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getOrderDetail(req, res) {
    try {
      const [order] = await q(`
        SELECT p.*, ep.nombre AS estado, te.nombre AS tipoEntrega,
               d.calle, d.numeroCasa, d.nota AS notaDireccion, sec.nombre AS sector,
               u.nombre AS usuarioNombre, u.correo AS usuarioCorreo
        FROM pedido p
        LEFT JOIN estadopedido ep ON ep.id = p.estadoId
        LEFT JOIN tipoentrega te ON te.id = p.tipoEntregaId
        LEFT JOIN direccion d ON d.id = p.direccionId
        LEFT JOIN sector sec ON sec.id = d.sectorId
        LEFT JOIN usuario u ON u.id = p.usuarioId
        WHERE p.id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

      const items = await q(`
        SELECT pi.*, pr.imagen FROM pedidoitem pi
        LEFT JOIN producto pr ON pr.id = pi.productoId
        WHERE pi.pedidoId = ?`, [req.params.id]);

      res.json({ pedido: order, items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateOrderStatus(req, res) {
    try {
      const { estadoId, motivoCancelacion } = req.body;
      if (!estadoId) return res.status(400).json({ error: 'Estado requerido' });

      // Obtener info del estado nuevo
      const [estado] = await q('SELECT nombre FROM estadopedido WHERE id=?', [estadoId]);
      const extra = estado && estado.nombre === 'Entregado' ? ', entregadoEn=NOW()' : '';

      // Obtener info del pedido para la notificación
      const [pedido] = await q('SELECT p.numeroPedido, p.usuarioId, p.total, ep.nombre AS estadoAnterior FROM pedido p LEFT JOIN estadopedido ep ON ep.id = p.estadoId WHERE p.id=?', [req.params.id]);

      await q(`UPDATE pedido SET estadoId=?, actualizadoEn=NOW()${extra} WHERE id=?`, [estadoId, req.params.id]);

      // Sincronizar estado con canje asociado (si es un pedido de canje MP)
      const [canjeAsociado] = await q('SELECT id, estado, costoPoints, usuarioId FROM canjeomockapoints WHERE pedidoId = ?', [req.params.id]);
      if (canjeAsociado) {
        const estadoNuevo = estado ? estado.nombre : null;
        let nuevoEstadoCanje = null;
        if (estadoNuevo === 'Entregado') nuevoEstadoCanje = 'entregado';
        else if (estadoNuevo === 'Cancelado') nuevoEstadoCanje = 'cancelado';
        else nuevoEstadoCanje = 'pendiente';

        if (nuevoEstadoCanje !== canjeAsociado.estado) {
          // Si se cancela y antes no estaba cancelado, devolver puntos
          if (nuevoEstadoCanje === 'cancelado' && canjeAsociado.estado !== 'cancelado') {
            await q('UPDATE usuario SET mockaPoints = mockaPoints + ? WHERE id = ?', [canjeAsociado.costoPoints, canjeAsociado.usuarioId]);
          }
          const extraCanje = nuevoEstadoCanje === 'entregado' ? ', entregadoEn=NOW()' : '';
          await q('UPDATE canjeomockapoints SET estado=?' + extraCanje + ' WHERE id=?', [nuevoEstadoCanje, canjeAsociado.id]);
        }
      }

      // Award Mocka Points only when order is delivered
      if (pedido && pedido.usuarioId && estado &&
          estado.nombre === 'Entregado' && pedido.estadoAnterior !== 'Entregado') {
        const total = Number(pedido.total) || 0;
        const pointsEarned = Math.floor(total / 5000) * 50;
        if (pointsEarned > 0) {
          await q('UPDATE usuario SET mockaPoints = mockaPoints + ? WHERE id = ?', [pointsEarned, pedido.usuarioId]);
        }
      }

      // Crear notificación para el usuario si tiene cuenta
      if (pedido && pedido.usuarioId) {
        const nuevoEstado = estado ? estado.nombre : 'Desconocido';
        const esCancelado = nuevoEstado === 'Cancelado';

        let titulo, mensaje;
        if (esCancelado) {
          titulo = '❌ Pedido #' + pedido.numeroPedido + ' cancelado';
          mensaje = 'Tu pedido #' + pedido.numeroPedido + ' ha sido cancelado.';
          if (motivoCancelacion) {
            mensaje += ' Motivo: ' + motivoCancelacion;
          }
        } else {
          const iconos = {
            'Pendiente': '🕐',
            'Preparando': '👨‍🍳',
            'Listo para retirar': '✅',
            'En Camino': '🚗',
            'Entregado': '📦'
          };
          const icono = iconos[nuevoEstado] || '📋';
          titulo = icono + ' Pedido #' + pedido.numeroPedido + ' — ' + nuevoEstado;
          mensaje = 'Tu pedido #' + pedido.numeroPedido + ' cambió de "' + (pedido.estadoAnterior || 'Sin estado') + '" a "' + nuevoEstado + '".';

          // Add points info to notification only when delivered
          if (nuevoEstado === 'Entregado' && pedido.estadoAnterior !== 'Entregado') {
            const total = Number(pedido.total) || 0;
            const pointsEarned = Math.floor(total / 5000) * 50;
            if (pointsEarned > 0) {
              mensaje += ' 🎉 ¡Ganaste ' + pointsEarned + ' Mocka Points!';
            }
          }
        }

        await crearNotificacion({
          usuarioId: pedido.usuarioId,
          pedidoId: req.params.id,
          tipo: esCancelado ? 'pedido_cancelado' : 'estado_pedido',
          titulo,
          mensaje,
          motivoCancelacion: esCancelado ? (motivoCancelacion || null) : null
        });
      }

      res.json({ ok: true, message: 'Estado actualizado' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getEstados(req, res) {
    try {
      const rows = await q('SELECT * FROM estadopedido ORDER BY orden');
      res.json({ estados: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ══════════════════════════════════════════
     USUARIOS
     ══════════════════════════════════════════ */
  async getUsers(req, res) {
    try {
      const rows = await q(`
        SELECT u.id, u.nombre, u.correo, u.telefono, u.mockaPoints, u.fechaNacimiento,
               u.creadoEn, u.activo, u.googleId, r.nombre AS rol, u.rolId
        FROM usuario u LEFT JOIN rol r ON r.id = u.rolId
        ORDER BY u.creadoEn DESC`);
      res.json({ usuarios: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateUser(req, res) {
    try {
      const { nombre, telefono, rolId, activo, mockaPoints } = req.body;
      await q('UPDATE usuario SET nombre=?, telefono=?, rolId=?, activo=?, mockaPoints=? WHERE id=?',
        [nombre, telefono || null, rolId || null, activo ? 1 : 0, mockaPoints || 0, req.params.id]);
      res.json({ ok: true, message: 'Usuario actualizado' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getRoles(req, res) {
    try {
      const rows = await q('SELECT * FROM rol WHERE activo=1 ORDER BY nombre');
      res.json({ roles: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ══════════════════════════════════════════
     PRODUCTOS
     ══════════════════════════════════════════ */
  async getProducts(req, res) {
    try {
      const rows = await q(`
        SELECT p.*, c.nombre AS categoriaNombre
        FROM producto p LEFT JOIN categoria c ON c.id = p.categoriaId
        ORDER BY p.creadoEn DESC`);

      // Traer ingredientes de cada producto
      for (const p of rows) {
        p.ingredientes = await q(
          `SELECT pi.ingredienteId, i.nombre, pi.incluidoPorDefecto, pi.sePuedeQuitar
           FROM productoingrediente pi
           JOIN ingrediente i ON i.id = pi.ingredienteId
           WHERE pi.productoId = ?`, [p.id]);
      }

      res.json({ productos: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createProduct(req, res) {
    try {
      const { nombre, descripcion, precio, categoriaId, imagen, activo, ingredientes, costoMockaPoints } = req.body;
      if (!nombre || !precio) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
      const id = uuidv4();
      const slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await q('INSERT INTO producto (id, nombre, slug, descripcion, precio, categoriaId, imagen, activo, costoMockaPoints) VALUES (?,?,?,?,?,?,?,?,?)',
        [id, nombre, slug, descripcion || null, precio, categoriaId || null, imagen || null, activo !== false ? 1 : 0, costoMockaPoints || null]);

      // Insertar ingredientes
      if (Array.isArray(ingredientes)) {
        for (const ing of ingredientes) {
          await q('INSERT INTO productoingrediente (productoId, ingredienteId, incluidoPorDefecto, sePuedeQuitar) VALUES (?,?,?,?)',
            [id, ing.ingredienteId, ing.incluidoPorDefecto ? 1 : 0, ing.sePuedeQuitar ? 1 : 0]);
        }
      }

      res.json({ ok: true, id, message: 'Producto creado' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateProduct(req, res) {
    try {
      const { nombre, descripcion, precio, categoriaId, imagen, activo, ingredientes, costoMockaPoints } = req.body;
      if (!nombre || !precio) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
      const slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await q('UPDATE producto SET nombre=?, slug=?, descripcion=?, precio=?, categoriaId=?, imagen=?, activo=?, costoMockaPoints=? WHERE id=?',
        [nombre, slug, descripcion || null, precio, categoriaId || null, imagen || null, activo ? 1 : 0, costoMockaPoints || null, req.params.id]);

      // Reemplazar ingredientes: borrar todos y re-insertar
      if (Array.isArray(ingredientes)) {
        await q('DELETE FROM productoingrediente WHERE productoId = ?', [req.params.id]);
        for (const ing of ingredientes) {
          await q('INSERT INTO productoingrediente (productoId, ingredienteId, incluidoPorDefecto, sePuedeQuitar) VALUES (?,?,?,?)',
            [req.params.id, ing.ingredienteId, ing.incluidoPorDefecto ? 1 : 0, ing.sePuedeQuitar ? 1 : 0]);
        }
      }

      res.json({ ok: true, message: 'Producto actualizado' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async deleteProduct(req, res) {
    try {
      await q('UPDATE producto SET activo=0 WHERE id=?', [req.params.id]);
      res.json({ ok: true, message: 'Producto desactivado' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getCategories(req, res) {
    try {
      const rows = await q('SELECT * FROM categoria ORDER BY activo DESC, nombre');
      res.json({ categorias: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async toggleCategory(req, res) {
    try {
      const { activo } = req.body;
      await q('UPDATE categoria SET activo=? WHERE id=?', [activo ? 1 : 0, req.params.id]);
      res.json({ ok: true, message: activo ? 'Categoría activada' : 'Categoría desactivada' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async toggleUser(req, res) {
    try {
      const { activo } = req.body;
      await q('UPDATE usuario SET activo=? WHERE id=?', [activo ? 1 : 0, req.params.id]);
      res.json({ ok: true, message: activo ? 'Usuario activado' : 'Usuario desactivado' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createCategory(req, res) {
    try {
      const { nombre, descripcion } = req.body;
      if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
      const id = uuidv4();
      await q('INSERT INTO categoria (id, nombre, descripcion) VALUES (?,?,?)', [id, nombre, descripcion || null]);
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateCategory(req, res) {
    try {
      const { nombre, descripcion, activo } = req.body;
      await q('UPDATE categoria SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre, descripcion || null, activo ? 1 : 0, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ══════════════════════════════════════════
     SECTORES
     ══════════════════════════════════════════ */
  async getSectors(req, res) {
    try {
      const rows = await q('SELECT * FROM sector ORDER BY nombre');
      res.json({ sectores: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createSector(req, res) {
    try {
      const { nombre, descripcion, precioEnvio } = req.body;
      if (!nombre || precioEnvio == null) return res.status(400).json({ error: 'Nombre y precio de envío requeridos' });
      const id = uuidv4();
      await q('INSERT INTO sector (id, nombre, descripcion, precioEnvio) VALUES (?,?,?,?)',
        [id, nombre, descripcion || null, precioEnvio]);
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateSector(req, res) {
    try {
      const { nombre, descripcion, precioEnvio, activo } = req.body;
      await q('UPDATE sector SET nombre=?, descripcion=?, precioEnvio=?, activo=? WHERE id=?',
        [nombre, descripcion || null, precioEnvio, activo ? 1 : 0, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async deleteSector(req, res) {
    try {
      await q('UPDATE sector SET activo=0 WHERE id=?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ══════════════════════════════════════════
     CUPONES
     ══════════════════════════════════════════ */
  async getCoupons(req, res) {
    try {
      const rows = await q(`
        SELECT c.*, cs.disponibles
        FROM cupon c LEFT JOIN cuponstock cs ON cs.cuponId = c.id
        ORDER BY c.creadoEn DESC`);
      res.json({ cupones: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createCoupon(req, res) {
    try {
      const { nombre, codigo, porcentajeDescuento, limiteDescuento, minimoCompra, venceEn, disponibles } = req.body;
      if (!nombre || !codigo) return res.status(400).json({ error: 'Nombre y código requeridos' });
      const id = uuidv4();
      await q('INSERT INTO cupon (id, nombre, codigo, porcentajeDescuento, limiteDescuento, minimoCompra, venceEn) VALUES (?,?,?,?,?,?,?)',
        [id, nombre, codigo.toUpperCase(), porcentajeDescuento || null, limiteDescuento || null, minimoCompra || null, venceEn || null]);
      if (disponibles != null) {
        await q('INSERT INTO cuponstock (cuponId, disponibles) VALUES (?,?)', [id, disponibles]);
      }
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateCoupon(req, res) {
    try {
      const { nombre, codigo, porcentajeDescuento, limiteDescuento, minimoCompra, venceEn, activo, disponibles } = req.body;
      await q('UPDATE cupon SET nombre=?, codigo=?, porcentajeDescuento=?, limiteDescuento=?, minimoCompra=?, venceEn=?, activo=? WHERE id=?',
        [nombre, codigo.toUpperCase(), porcentajeDescuento || null, limiteDescuento || null, minimoCompra || null, venceEn || null, activo ? 1 : 0, req.params.id]);
      // Upsert stock
      if (disponibles != null) {
        await q('INSERT INTO cuponstock (cuponId, disponibles) VALUES (?,?) ON DUPLICATE KEY UPDATE disponibles=?',
          [req.params.id, disponibles, disponibles]);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async deleteCoupon(req, res) {
    try {
      await q('UPDATE cupon SET activo=0 WHERE id=?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ══════════════════════════════════════════
     INGREDIENTES
     ══════════════════════════════════════════ */
  async getIngredients(req, res) {
    try {
      const rows = await q('SELECT * FROM ingrediente ORDER BY nombre');
      res.json({ ingredientes: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createIngredient(req, res) {
    try {
      const { nombre, descripcion } = req.body;
      if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
      const id = uuidv4();
      await q('INSERT INTO ingrediente (id, nombre, descripcion) VALUES (?,?,?)', [id, nombre, descripcion || null]);
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateIngredient(req, res) {
    try {
      const { nombre, descripcion, activo } = req.body;
      await q('UPDATE ingrediente SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre, descripcion || null, activo ? 1 : 0, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ══════════════════════════════════════════
     CANJES MOCKA POINTS
     ══════════════════════════════════════════ */
  async getCanjes(req, res) {
    try {
      const rows = await q(`
        SELECT c.*, u.nombre AS usuario, u.correo, p.nombre AS producto
        FROM canjeomockapoints c
        JOIN usuario u ON u.id COLLATE utf8mb4_unicode_ci = c.usuarioId COLLATE utf8mb4_unicode_ci
        JOIN producto p ON p.id COLLATE utf8mb4_unicode_ci = c.productoId COLLATE utf8mb4_unicode_ci
        ORDER BY c.creadoEn DESC`);
      res.json({ canjes: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateCanjeStatus(req, res) {
    try {
      const { estado } = req.body;
      if (!['pendiente', 'entregado', 'cancelado'].includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
      }

      const [canje] = await q('SELECT * FROM canjeomockapoints WHERE id=?', [req.params.id]);
      if (!canje) return res.status(404).json({ error: 'Canje no encontrado' });

      // If cancelling, refund points
      if (estado === 'cancelado' && canje.estado !== 'cancelado') {
        await q('UPDATE usuario SET mockaPoints = mockaPoints + ? WHERE id = ?', [canje.costoPoints, canje.usuarioId]);
      }

      const extra = estado === 'entregado' ? ', entregadoEn=NOW()' : '';
      await q('UPDATE canjeomockapoints SET estado=?' + extra + ' WHERE id=?', [estado, req.params.id]);

      // Sincronizar estado con el pedido asociado
      if (canje.pedidoId) {
        const estadoMap = {
          'pendiente': 'Pendiente',
          'entregado': 'Entregado',
          'cancelado': 'Cancelado'
        };
        const [estadoPedido] = await q('SELECT id FROM estadopedido WHERE nombre = ?', [estadoMap[estado]]);
        if (estadoPedido) {
          const extraPedido = estado === 'entregado' ? ', entregadoEn=NOW()' : '';
          await q('UPDATE pedido SET estadoId=?, actualizadoEn=NOW()' + extraPedido + ' WHERE id=?', [estadoPedido.id, canje.pedidoId]);
        }
      }

      // Send notification
      if (canje.usuarioId) {
        const [prod] = await q('SELECT nombre FROM producto WHERE id=?', [canje.productoId]);
        const prodName = prod ? prod.nombre : 'Producto';
        if (estado === 'entregado') {
          await crearNotificacion({ usuarioId: canje.usuarioId, tipo: 'canje', titulo: '✅ Canje entregado', mensaje: 'Tu canje de "' + prodName + '" ha sido entregado. ¡Disfruta!' });
        } else if (estado === 'cancelado') {
          await crearNotificacion({ usuarioId: canje.usuarioId, tipo: 'canje', titulo: '❌ Canje cancelado', mensaje: 'Tu canje de "' + prodName + '" fue cancelado. Se han devuelto ' + canje.costoPoints + ' Mocka Points a tu cuenta.' });
        }
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ══════════════════════════════════════════
     SLIDER
     ══════════════════════════════════════════ */
  async getSlides(req, res) {
    try {
      const rows = await q('SELECT * FROM slider ORDER BY orden ASC, creadoEn DESC');
      res.json({ slides: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createSlide(req, res) {
    try {
      const { titulo, subtitulo, imagenUrl, linkUrl, orden } = req.body;
      if (!imagenUrl) return res.status(400).json({ error: 'La URL de imagen es obligatoria' });
      const id = uuidv4();
      await q('INSERT INTO slider (id, titulo, subtitulo, imagenUrl, linkUrl, orden) VALUES (?,?,?,?,?,?)',
        [id, titulo || null, subtitulo || null, imagenUrl, linkUrl || null, orden || 0]);
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateSlide(req, res) {
    try {
      const { titulo, subtitulo, imagenUrl, linkUrl, orden, activo } = req.body;
      await q('UPDATE slider SET titulo=?, subtitulo=?, imagenUrl=?, linkUrl=?, orden=?, activo=? WHERE id=?',
        [titulo || null, subtitulo || null, imagenUrl, linkUrl || null, orden || 0, activo ? 1 : 0, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async deleteSlide(req, res) {
    try {
      await q('DELETE FROM slider WHERE id=?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /* ══════════════════════════════════════════
     CONFIGURACIÓN DEL LOCAL (HORARIOS)
     ══════════════════════════════════════════ */
  async getConfiguracionLocal(req, res) {
    try {
      const [config] = await q('SELECT * FROM configuracion_local WHERE id = "config"');
      if (!config) {
        return res.json({
          horaApertura: '08:00',
          horaCierre: '20:00',
          abierto: true,
          forzarEstado: false,
          mensaje: null
        });
      }
      res.json({
        horaApertura: config.horaApertura ? config.horaApertura.substring(0, 5) : '08:00',
        horaCierre: config.horaCierre ? config.horaCierre.substring(0, 5) : '20:00',
        abierto: config.abierto === 1,
        forzarEstado: config.forzarEstado === 1,
        mensaje: config.mensaje
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateConfiguracionLocal(req, res) {
    try {
      const { horaApertura, horaCierre, abierto, forzarEstado, mensaje } = req.body;
      await q(`
        UPDATE configuracion_local SET
          horaApertura = ?,
          horaCierre = ?,
          abierto = ?,
          forzarEstado = ?,
          mensaje = ?
        WHERE id = "config"
      `, [horaApertura || '08:00', horaCierre || '20:00', abierto ? 1 : 0, forzarEstado ? 1 : 0, mensaje || null]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async toggleLocalAbierto(req, res) {
    try {
      const { abierto, mensaje } = req.body;
      await q('UPDATE configuracion_local SET abierto = ?, forzarEstado = 1, mensaje = ? WHERE id = "config"', 
        [abierto ? 1 : 0, mensaje || null]);
      res.json({ ok: true, abierto: !!abierto });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // ═══════════════════════════════════════════════════════════
  // NOTIFICACIONES GLOBALES
  // ═══════════════════════════════════════════════════════════
  async getNotificaciones(req, res) {
    try {
      const notifs = await q('SELECT * FROM notificacion_global ORDER BY creadoEn DESC');
      res.json(notifs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createNotificacion(req, res) {
    try {
      const { titulo, cuerpo, link } = req.body;
      if (!titulo || !cuerpo) {
        return res.status(400).json({ error: 'Título y cuerpo son requeridos' });
      }
      const result = await q(
        'INSERT INTO notificacion_global (titulo, cuerpo, link) VALUES (?, ?, ?)',
        [titulo.trim(), cuerpo.trim(), link ? link.trim() : null]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async deleteNotificacion(req, res) {
    try {
      const { id } = req.params;
      await q('DELETE FROM notificacion_global WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async toggleNotificacion(req, res) {
    try {
      const { id } = req.params;
      await q('UPDATE notificacion_global SET activa = NOT activa WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = AdminController;

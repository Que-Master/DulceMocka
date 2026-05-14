// src/controllers/adminController.js
const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { crearNotificacion } = require('./notificacionController');
const { getIngresosReport, buildIngresosWorkbook } = require('../services/ingresosService');

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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getDeliveryKind(tipoEntrega) {
  const tipo = normalizeText(tipoEntrega);
  if (!tipo) return null;
  if (tipo.includes('retiro') || tipo.includes('recogida')) return 'retiro';
  if (tipo.includes('delivery') || tipo.includes('despacho')) return 'delivery';
  return null;
}

function isEstadoAllowedForDelivery(estadoNombre, tipoEntrega) {
  const estado = normalizeText(estadoNombre);
  const kind = getDeliveryKind(tipoEntrega);
  if (kind === 'retiro' && estado === 'en camino') return false;
  if (kind === 'delivery' && (estado === 'listo para retiro' || estado === 'listo para retirar')) return false;
  return true;
}

function toYmd(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function ensureCajaTable() {
  await q(`
    CREATE TABLE IF NOT EXISTS cajacierre (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      abierto TINYINT(1) NOT NULL DEFAULT 1,
      montoApertura DECIMAL(12,2) NOT NULL DEFAULT 0,
      aperturaAt DATETIME NOT NULL,
      cierreAt DATETIME NULL,
      ingresosTurno DECIMAL(12,2) NOT NULL DEFAULT 0,
      montoCierre DECIMAL(12,2) NOT NULL DEFAULT 0,
      desglosePago JSON NULL,
      abiertoPorUsuarioId VARCHAR(36) NULL,
      cerradoPorUsuarioId VARCHAR(36) NULL,
      creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizadoEn DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_caja_abierto (abierto),
      INDEX idx_caja_cierreAt (cierreAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const hasDesglosePago = await q(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'cajacierre'
      AND COLUMN_NAME = 'desglosePago'
    LIMIT 1
  `);

  if (!hasDesglosePago.length) {
    await q('ALTER TABLE cajacierre ADD COLUMN desglosePago JSON NULL AFTER montoCierre');
  }
}

const AdminController = {

  /* ══════════════════════════════════════════
     DASHBOARD
     ══════════════════════════════════════════ */
  async dashboard(req, res) {
    try {
      const [users] = await q('SELECT COUNT(*) AS c FROM usuario WHERE activo=1');
      const [products] = await q('SELECT COUNT(*) AS c FROM producto WHERE activo=1');
      const [orders] = await q('SELECT COUNT(*) AS c FROM pedido WHERE DATE(creadoEn) = CURDATE()');
      const [revenue] = await q('SELECT COALESCE(SUM(total),0) AS c FROM pedido WHERE DATE(creadoEn) = CURDATE()');

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

  async getIngresosReport(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const report = await getIngresosReport(q, startDate, endDate);
      res.json(report);
    } catch (err) {
      const msg = err && err.message ? err.message : 'Error generando reporte de ingresos';
      const status = msg.includes('Rango de fechas inválido') || msg.includes('fecha de inicio') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  },

  async exportIngresosExcel(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const report = await getIngresosReport(q, startDate, endDate);
      const workbook = await buildIngresosWorkbook(report);
      const buffer = await workbook.xlsx.writeBuffer();

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="ingresos_${stamp}.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      const msg = err && err.message ? err.message : 'Error exportando Excel de ingresos';
      const status = msg.includes('Rango de fechas inválido') || msg.includes('fecha de inicio') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  },

  async getCajaEstado(req, res) {
    try {
      await ensureCajaTable();

      const [abierta] = await q('SELECT * FROM cajacierre WHERE abierto = 1 ORDER BY aperturaAt DESC LIMIT 1');
      const [ultimoCierre] = await q('SELECT * FROM cajacierre WHERE abierto = 0 AND cierreAt IS NOT NULL ORDER BY cierreAt DESC LIMIT 1');

      if (abierta) {
        const report = await getIngresosReport(q, abierta.aperturaAt, new Date());
        const ingresosTurno = Number((report.totals && report.totals.totalIngresos) || 0);
        const montoApertura = Number(abierta.montoApertura || 0);
        const montoCierre = montoApertura + ingresosTurno;

        const defaultDate = ultimoCierre
          ? toYmd(ultimoCierre.cierreAt)
          : toYmd(new Date(Date.now() - 24 * 60 * 60 * 1000));

        return res.json({
          abierta: true,
          aperturaAt: abierta.aperturaAt,
          montoApertura,
          ingresosTurno,
          montoCierre,
          ultimoCierreAt: ultimoCierre ? ultimoCierre.cierreAt : null,
          defaultDate
        });
      }

      const defaultDate = ultimoCierre ? toYmd(ultimoCierre.cierreAt) : toYmd(new Date());
      return res.json({
        abierta: false,
        aperturaAt: null,
        montoApertura: 0,
        ingresosTurno: Number((ultimoCierre && ultimoCierre.ingresosTurno) || 0),
        montoCierre: Number((ultimoCierre && ultimoCierre.montoCierre) || 0),
        ultimoCierreAt: ultimoCierre ? ultimoCierre.cierreAt : null,
        defaultDate
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async abrirCaja(req, res) {
    try {
      await ensureCajaTable();
      const montoApertura = Number(req.body && req.body.montoApertura);
      if (!Number.isFinite(montoApertura) || montoApertura < 0) {
        return res.status(400).json({ error: 'Monto de apertura inválido' });
      }

      const [abierta] = await q('SELECT id FROM cajacierre WHERE abierto = 1 LIMIT 1');
      if (abierta) {
        return res.status(400).json({ error: 'Ya existe una caja abierta' });
      }

      const id = uuidv4();
      await q(
        'INSERT INTO cajacierre (id, abierto, montoApertura, aperturaAt, abiertoPorUsuarioId) VALUES (?,1,?,NOW(),?)',
        [id, montoApertura, req.user ? req.user.id : null]
      );

      res.json({ ok: true, id, montoApertura });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async cerrarCaja(req, res) {
    try {
      await ensureCajaTable();
      const [abierta] = await q('SELECT * FROM cajacierre WHERE abierto = 1 ORDER BY aperturaAt DESC LIMIT 1');
      if (!abierta) {
        return res.status(400).json({ error: 'No hay caja abierta' });
      }

      const report = await getIngresosReport(q, abierta.aperturaAt, new Date());
      const ingresosTurno = Number((report.totals && report.totals.totalIngresos) || 0);
      const montoApertura = Number(abierta.montoApertura || 0);
      const montoCierre = montoApertura + ingresosTurno;
      
      // Preparar desglose por método de pago
      const desglosePago = (report.byPaymentMethod || []).map(method => ({
        metodoPago: method.metodoPago,
        totalPedidos: method.totalPedidos,
        totalIngresos: Number(method.totalIngresos || 0)
      }));

      await q(
        'UPDATE cajacierre SET abierto = 0, cierreAt = NOW(), ingresosTurno = ?, montoCierre = ?, desglosePago = ?, cerradoPorUsuarioId = ? WHERE id = ?',
        [ingresosTurno, montoCierre, JSON.stringify(desglosePago), req.user ? req.user.id : null, abierta.id]
      );

      const [cierre] = await q('SELECT * FROM cajacierre WHERE id = ? LIMIT 1', [abierta.id]);
      res.json({
        ok: true,
        cierre: {
          id: cierre.id,
          aperturaAt: cierre.aperturaAt,
          cierreAt: cierre.cierreAt,
          montoApertura: Number(cierre.montoApertura || 0),
          ingresosTurno: Number(cierre.ingresosTurno || 0),
          montoCierre: Number(cierre.montoCierre || 0),
          desglosePago: desglosePago
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getCierresByFecha(req, res) {
    try {
      await ensureCajaTable();
      const fecha = String(req.query.fecha || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ error: 'Fecha inválida' });
      }

      const rows = await q(
        'SELECT * FROM cajacierre WHERE abierto = 0 AND cierreAt IS NOT NULL AND DATE(cierreAt) = ? ORDER BY cierreAt DESC',
        [fecha]
      );

      const cierres = await Promise.all((rows || []).map(async (r) => {
        let desglosePago = [];
        try {
          if (r.desglosePago) {
            desglosePago = typeof r.desglosePago === 'string' ? JSON.parse(r.desglosePago) : r.desglosePago;
          }
        } catch (e) {
          // Si hay error parseando, dejamos array vacío
        }
        
        // Si no hay desglose guardado, calcular desde los pedidos
        if (desglosePago.length === 0 && r.aperturaAt && r.cierreAt) {
          const report = await getIngresosReport(q, r.aperturaAt, r.cierreAt);
          desglosePago = (report.byPaymentMethod || []).map(method => ({
            metodoPago: method.metodoPago,
            totalPedidos: method.totalPedidos,
            totalIngresos: Number(method.totalIngresos || 0)
          }));
        }
        
        return {
          id: r.id,
          aperturaAt: r.aperturaAt,
          cierreAt: r.cierreAt,
          montoApertura: Number(r.montoApertura || 0),
          ingresosTurno: Number(r.ingresosTurno || 0),
          montoCierre: Number(r.montoCierre || 0),
          desglosePago: desglosePago
        };
      }));

      res.json({ cierres });
    } catch (err) {
      res.status(500).json({ error: err.message });
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
               mp.nombre AS metodoPago,
               te.nombre AS tipoEntrega,
               d.calle, d.numeroCasa, s.nombre AS sector
        FROM pedido p
        LEFT JOIN estadopedido ep ON ep.id = p.estadoId
        LEFT JOIN metodopago mp ON mp.id = p.metodoPagoId
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
               mp.nombre AS metodoPago,
               d.calle, d.numeroCasa, d.nota AS notaDireccion, sec.nombre AS sector,
               u.nombre AS usuarioNombre, u.correo AS usuarioCorreo
        FROM pedido p
        LEFT JOIN estadopedido ep ON ep.id = p.estadoId
        LEFT JOIN metodopago mp ON mp.id = p.metodoPagoId
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
      const { estadoId, motivoCancelacion, metodoPagoId } = req.body;
      if (!estadoId) return res.status(400).json({ error: 'Estado requerido' });

      // Obtener info del estado nuevo
      const [estado] = await q('SELECT nombre FROM estadopedido WHERE id=?', [estadoId]);
      const esEntregado = estado && estado.nombre === 'Entregado';

      // Obtener info del pedido para validaciones y notificación
      const [pedido] = await q(
        'SELECT p.numeroPedido, p.usuarioId, p.total, p.metodoPagoId, te.nombre AS tipoEntrega, ep.nombre AS estadoAnterior FROM pedido p LEFT JOIN tipoentrega te ON te.id = p.tipoEntregaId LEFT JOIN estadopedido ep ON ep.id = p.estadoId WHERE p.id=?',
        [req.params.id]
      );
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      if (estado && !isEstadoAllowedForDelivery(estado.nombre, pedido.tipoEntrega)) {
        return res.status(400).json({
          error: 'Estado no válido para este tipo de entrega'
        });
      }

      let metodoPago = null;
      if (esEntregado) {
        const metodoIdFinal = metodoPagoId || pedido.metodoPagoId;
        if (!metodoIdFinal) {
          return res.status(400).json({ error: 'Método de pago requerido para marcar como entregado' });
        }
        // Si llega uno nuevo desde UI, exigir que esté activo.
        // Si ya estaba guardado en pedido, permitirlo aunque esté inactivo para no bloquear historial.
        const [mp] = await q(
          metodoPagoId
            ? 'SELECT id, nombre FROM metodopago WHERE id = ? AND activo = 1 LIMIT 1'
            : 'SELECT id, nombre FROM metodopago WHERE id = ? LIMIT 1',
          [metodoIdFinal]
        );
        if (!mp) {
          return res.status(400).json({ error: 'Método de pago inválido' });
        }
        metodoPago = mp;
      }

      let extra = '';
      const paramsUpdate = [estadoId];
      if (esEntregado) {
        extra += ', entregadoEn=NOW(), metodoPagoId=?';
        paramsUpdate.push(metodoPago.id);
      }
      paramsUpdate.push(req.params.id);
      await q(`UPDATE pedido SET estadoId=?, actualizadoEn=NOW()${extra} WHERE id=?`, paramsUpdate);

      // Si se marca como Entregado, sumar el monto a la caja abierta (ya sea retiro o despacho)
      if (esEntregado) {
        await ensureCajaTable();
        const [cajaAbierta] = await q('SELECT id, ingresosTurno FROM cajacierre WHERE abierto = 1 ORDER BY aperturaAt DESC LIMIT 1');
        if (cajaAbierta) {
          const montoActual = Number(cajaAbierta.ingresosTurno || 0);
          const montoNuevo = montoActual + Number(pedido.total || 0);
          await q('UPDATE cajacierre SET ingresosTurno = ?, actualizadoEn = NOW() WHERE id = ?', [montoNuevo, cajaAbierta.id]);
        }
      }

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

          if (esEntregado && metodoPago) {
            mensaje += ' Método de pago: ' + metodoPago.nombre + '.';
          }

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

  async getMetodosPago(req, res) {
    try {
      const rows = await q('SELECT id, nombre, descripcion FROM metodopago WHERE activo = 1 ORDER BY nombre');
      res.json({ metodosPago: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createVentaLocal(req, res) {
    try {
      const [configLocal] = await q('SELECT abierto FROM configuracion_local WHERE id = "config" LIMIT 1');
      const localAbierto = !configLocal || Number(configLocal.abierto) === 1;
      if (!localAbierto) {
        return res.status(400).json({ error: 'El local está cerrado. No se pueden registrar ventas en local.' });
      }

      await ensureCajaTable();
      const [cajaAbierta] = await q('SELECT id FROM cajacierre WHERE abierto = 1 ORDER BY aperturaAt DESC LIMIT 1');
      if (!cajaAbierta) {
        return res.status(400).json({ error: 'La caja está cerrada. Debes abrir caja antes de finalizar una venta en local.' });
      }

      const {
        clienteNombre,
        tipoEntrega,
        metodoPago,
        notas,
        items,
        despacho
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'La venta debe tener al menos un item' });
      }

      const entrega = (tipoEntrega === 'despacho') ? 'despacho' : 'retiro';
      const nombreContacto = (clienteNombre || '').trim() || 'Cliente en local';
      const correoContacto = 'venta-local@dulcemocka.local';
      let telefonoContacto = '000000000';

      let direccionId = null;
      let shipping = 0;

      if (entrega === 'despacho') {
        const tel = (despacho && despacho.telefono ? String(despacho.telefono).trim() : '');
        const dirTxt = (despacho && despacho.direccion ? String(despacho.direccion).trim() : '');
        const sectorId = (despacho && despacho.sectorId ? String(despacho.sectorId) : '');
        const referencia = (despacho && despacho.referencia ? String(despacho.referencia).trim() : null);

        if (!tel || !dirTxt || !sectorId) {
          return res.status(400).json({ error: 'Para despacho debes ingresar teléfono, dirección y sector' });
        }

        const [sector] = await q('SELECT id, precioEnvio FROM sector WHERE id = ? AND activo = 1 LIMIT 1', [sectorId]);
        if (!sector) {
          return res.status(400).json({ error: 'El sector seleccionado no es válido' });
        }

        telefonoContacto = tel;
        shipping = Number(sector.precioEnvio) || 0;

        let calle = dirTxt;
        let numeroCasa = 'S/N';
        const m = dirTxt.match(/^(.*)\s+(\d+[A-Za-z0-9\-]*)$/);
        if (m) {
          calle = m[1].trim();
          numeroCasa = m[2].trim();
        }

        direccionId = uuidv4();
        await q(
          'INSERT INTO direccion (id, calle, numeroCasa, sectorId, nota) VALUES (?,?,?,?,?)',
          [direccionId, calle, numeroCasa, sector.id, referencia]
        );
      }

      const [te] = await q(
        entrega === 'despacho'
          ? "SELECT id FROM tipoentrega WHERE nombre='Delivery' LIMIT 1"
          : "SELECT id FROM tipoentrega WHERE nombre='Recogida' LIMIT 1"
      );
      const tipoEntregaId = te ? te.id : null;

      const [estadoPendiente] = await q("SELECT id FROM estadopedido WHERE nombre='Pendiente' LIMIT 1");
      const estadoId = estadoPendiente ? estadoPendiente.id : null;

      const metodoPagoNombreRaw = (metodoPago || 'efectivo').toString().trim().toLowerCase();
      const aliasMetodoPago = {
        efectivo: 'efectivo',
        transferencia: 'transferencia',
        debito: 'debito',
        débito: 'debito',
        credito: 'credito',
        crédito: 'credito',
        tarjeta: 'debito'
      };
      const metodoPagoNombre = aliasMetodoPago[metodoPagoNombreRaw] || metodoPagoNombreRaw;
      const [metodoPagoRow] = await q('SELECT id, nombre FROM metodopago WHERE LOWER(nombre) = ? AND activo = 1 LIMIT 1', [metodoPagoNombre]);
      if (!metodoPagoRow) {
        return res.status(400).json({ error: 'Método de pago inválido para venta local' });
      }

      let subtotal = 0;
      items.forEach(it => {
        subtotal += (Number(it.precio) || 0) * (Number(it.cantidad) || 1);
      });
      const total = subtotal + shipping;

      const pedidoId = uuidv4();
      const numeroPedido = 'DSM-' + (Math.floor(Math.random() * 900000) + 100000);

      await q(
        `INSERT INTO pedido (id, numeroPedido, usuarioId, nombreContacto, correoContacto, telefonoContacto,
         tipoEntregaId, direccionId, metodoPagoId, cuponId, codigoCuponSnapshot, subtotal, total, descuentoTotal, estadoId, creadoEn)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
        [
          pedidoId,
          numeroPedido,
          null,
          nombreContacto,
          correoContacto,
          telefonoContacto,
          tipoEntregaId,
          direccionId,
          metodoPagoRow.id,
          null,
          'VENTA LOCAL ADMIN',
          subtotal,
          total,
          0,
          estadoId
        ]
      );

      for (const it of items) {
        const itemId = uuidv4();
        const qty = Number(it.cantidad) || 1;
        const precio = Number(it.precio) || 0;
        const totalLinea = precio * qty;

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
          subtotal,
          envio: shipping,
          total
        }
      });
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

const ExcelJS = require('exceljs');

const DAY_MS = 24 * 60 * 60 * 1000;

function toLocalDateTimeInput(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function parseDateRange(startDate, endDate) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * DAY_MS);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Rango de fechas inválido');
  }
  if (start > end) {
    throw new Error('La fecha de inicio no puede ser mayor a la fecha de fin');
  }

  return { start, end };
}

function getGroupingStrategy(start, end) {
  const spanMs = end.getTime() - start.getTime();
  const spanDays = Math.max(1, Math.ceil(spanMs / DAY_MS));

  if (spanDays <= 1) return 'hour';
  if (spanDays <= 31) return 'day';
  if (spanDays <= 120) return 'week';
  return 'month';
}

function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getBucketLabel(date, strategy) {
  const d = new Date(date);
  if (strategy === 'hour') {
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  }
  if (strategy === 'day') {
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (strategy === 'week') {
    const ws = getWeekStart(d);
    return `Semana ${ws.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}`;
  }
  return d.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' });
}

function groupTransactions(transactions, strategy) {
  const acc = new Map();

  for (const t of transactions) {
    const key = getBucketLabel(t.fechaOperacion, strategy);
    const prev = acc.get(key) || { bucket: key, totalIngresos: 0, totalPedidos: 0, mockaCanjes: 0 };
    prev.totalIngresos += Number(t.montoReal || 0);
    prev.totalPedidos += 1;
    prev.mockaCanjes += t.esCanjeMocka ? 1 : 0;
    acc.set(key, prev);
  }

  return Array.from(acc.values());
}

async function getIngresosReport(dbQuery, startDate, endDate) {
  const { start, end } = parseDateRange(startDate, endDate);
  const grouping = getGroupingStrategy(start, end);

  const transactions = await dbQuery(
    `SELECT p.id, p.numeroPedido, p.nombreContacto, p.total,
            COALESCE(p.entregadoEn, p.actualizadoEn, p.creadoEn) AS fechaOperacion,
            ep.nombre AS estado,
            COALESCE(mp.nombre, 'sin_metodo') AS metodoPago,
            p.codigoCuponSnapshot
     FROM pedido p
     INNER JOIN estadopedido ep ON ep.id = p.estadoId
     LEFT JOIN metodopago mp ON mp.id = p.metodoPagoId
     WHERE UPPER(TRIM(ep.nombre)) IN ('ENTREGADO', 'PAGADO')
       AND COALESCE(p.entregadoEn, p.actualizadoEn, p.creadoEn) BETWEEN ? AND ?
     ORDER BY fechaOperacion ASC`,
    [start, end]
  );

  const tx = (transactions || []).map((row) => {
    const esCanjeMocka = String(row.codigoCuponSnapshot || '').toUpperCase().includes('CANJE MOCKA POINTS');
    const montoReal = esCanjeMocka ? 0 : Number(row.total || 0);
    return {
      id: row.id,
      numeroPedido: row.numeroPedido,
      cliente: row.nombreContacto || 'Cliente',
      fechaOperacion: row.fechaOperacion,
      estado: row.estado,
      metodoPago: row.metodoPago || 'sin_metodo',
      esCanjeMocka,
      montoReal
    };
  });

  const byPaymentMap = new Map();
  for (const t of tx) {
    const key = t.metodoPago;
    const prev = byPaymentMap.get(key) || { metodoPago: key, totalIngresos: 0, totalPedidos: 0 };
    prev.totalIngresos += Number(t.montoReal || 0);
    prev.totalPedidos += 1;
    byPaymentMap.set(key, prev);
  }

  const byPaymentMethod = Array.from(byPaymentMap.values()).sort((a, b) => b.totalIngresos - a.totalIngresos);

  const [mockaInfo] = await dbQuery(
    `SELECT COALESCE(SUM(c.costoPoints), 0) AS totalMockaPointsCanjeados,
            COUNT(*) AS totalCanjes
     FROM canjeomockapoints c
     WHERE c.estado = 'entregado'
       AND COALESCE(c.entregadoEn, c.creadoEn) BETWEEN ? AND ?`,
    [start, end]
  );

  const breakdown = groupTransactions(tx, grouping);

  const totals = {
    totalIngresos: tx.reduce((acc, t) => acc + Number(t.montoReal || 0), 0),
    totalPedidos: tx.length,
    totalMockaPointsCanjeados: Number((mockaInfo && mockaInfo.totalMockaPointsCanjeados) || 0),
    totalCanjesMocka: Number((mockaInfo && mockaInfo.totalCanjes) || 0)
  };

  return {
    range: {
      start,
      end,
      startLabel: toLocalDateTimeInput(start),
      endLabel: toLocalDateTimeInput(end)
    },
    grouping,
    totals,
    byPaymentMethod,
    breakdown,
    transactions: tx
  };
}

async function buildIngresosWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dulce Mocka Admin';
  workbook.created = new Date();

  const wsResumen = workbook.addWorksheet('Resumen');
  const title = `Reporte del ${new Date(report.range.start).toLocaleDateString('es-CL')} al ${new Date(report.range.end).toLocaleDateString('es-CL')}`;

  wsResumen.addRow([title]);
  wsResumen.addRow([]);
  wsResumen.addRow(['Total ingresos', report.totals.totalIngresos]);
  wsResumen.addRow(['Total pedidos', report.totals.totalPedidos]);
  wsResumen.addRow(['MockaPoints canjeados', report.totals.totalMockaPointsCanjeados]);
  wsResumen.addRow(['Canjes entregados', report.totals.totalCanjesMocka]);
  wsResumen.addRow([]);
  wsResumen.addRow(['Totales por método de pago']);
  wsResumen.addRow(['Método', 'Pedidos', 'Ingresos']);

  report.byPaymentMethod.forEach((row) => {
    wsResumen.addRow([row.metodoPago, row.totalPedidos, row.totalIngresos]);
  });

  wsResumen.columns = [{ width: 28 }, { width: 14 }, { width: 18 }];

  const wsDetalle = workbook.addWorksheet('Detalle');
  wsDetalle.columns = [
    { header: 'ID', key: 'id', width: 38 },
    { header: 'Pedido', key: 'numeroPedido', width: 16 },
    { header: 'Fecha', key: 'fecha', width: 22 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    { header: 'Medio de Pago', key: 'metodoPago', width: 18 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Monto', key: 'montoReal', width: 14 }
  ];

  report.transactions.forEach((t) => {
    wsDetalle.addRow({
      id: t.id,
      numeroPedido: t.numeroPedido,
      fecha: new Date(t.fechaOperacion).toLocaleString('es-CL'),
      cliente: t.cliente,
      metodoPago: t.metodoPago,
      estado: t.estado,
      montoReal: t.montoReal
    });
  });

  const monthMap = new Map();
  for (const t of report.transactions) {
    const key = getMonthKey(t.fechaOperacion);
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key).push(t);
  }

  if (monthMap.size > 1) {
    for (const [monthKey, tx] of monthMap.entries()) {
      const [year, month] = monthKey.split('-');
      const sheetName = `${month}-${year}`;
      const ws = workbook.addWorksheet(sheetName);
      ws.columns = [
        { header: 'Pedido', key: 'numeroPedido', width: 16 },
        { header: 'Fecha', key: 'fecha', width: 22 },
        { header: 'Cliente', key: 'cliente', width: 28 },
        { header: 'Método', key: 'metodoPago', width: 16 },
        { header: 'Monto', key: 'montoReal', width: 14 }
      ];

      let subtotal = 0;
      tx.forEach((t) => {
        subtotal += Number(t.montoReal || 0);
        ws.addRow({
          numeroPedido: t.numeroPedido,
          fecha: new Date(t.fechaOperacion).toLocaleString('es-CL'),
          cliente: t.cliente,
          metodoPago: t.metodoPago,
          montoReal: t.montoReal
        });
      });
      ws.addRow({});
      ws.addRow({ cliente: 'Subtotal mensual', montoReal: subtotal });
    }
  }

  return workbook;
}

module.exports = {
  parseDateRange,
  getIngresosReport,
  buildIngresosWorkbook
};

// Servicio de impresión centralizado
// Aquí puedes poner la lógica de impresión (USB, spooler, etc)

async function printOrder(order) {
  // TODO: Implementar lógica real de impresión
  // Por ahora solo loguea
  console.log('[PRINT] Pedido a imprimir:', order);
  return { ok: true };
}

module.exports = { printOrder };

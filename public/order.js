// public/order.js — renders the order receipt ("boleta")
const fmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

function qs(name){ return new URL(window.location.href).searchParams.get(name); }

async function loadOrderById(id){
  try {
    const res = await fetch('/api/pedidos/' + encodeURIComponent(id));
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch { return null; }
}

function renderOrder(data){
  if(!data || !data.pedido){
    document.getElementById('msg').textContent = 'Pedido no encontrado.';
    return;
  }

  const order = data.pedido;
  const items = data.items || [];

  /* ── 1. Información del pedido ── */
  const date = new Date(order.creadoEn || Date.now());
  document.getElementById('orderInfo').innerHTML = `
    <h3>Información del pedido</h3>
    <div>Número: <strong>${order.numeroPedido || order.id}</strong></div>
    <div>Estado: <strong>${order.estado || 'Pendiente'}</strong></div>
    <div>Fecha: ${date.toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'})}</div>`;

  /* ── 2. Datos del cliente ── */
  document.getElementById('clientInfo').innerHTML = `
    <h3>Datos del cliente</h3>
    <div>Nombre: ${order.nombreContacto || '-'}</div>
    <div>Correo: ${order.correoContacto || '-'}</div>
    <div>Teléfono: ${order.telefonoContacto || '-'}</div>`;

  /* ── 3. Tipo de entrega ── */
  const isDomicilio = order.tipoEntrega === 'Delivery';
  let delHtml = `<h3>Tipo de entrega</h3>
    <div>${isDomicilio ? 'Despacho a domicilio' : 'Retiro en tienda'}</div>`;
  if(isDomicilio){
    delHtml += `<div style="margin-top:8px">
      <div><strong>Calle:</strong> ${order.calle || '-'}</div>
      <div><strong>Número:</strong> ${order.numeroCasa || '-'}</div>
      <div><strong>Notas:</strong> ${order.notaDireccion || '-'}</div>
      <div><strong>Sector:</strong> ${order.sector || '-'}</div>
    </div>`;
  }
  document.getElementById('deliveryInfo').innerHTML = delHtml;

  /* ── 4. Items del pedido ── */
  let itemsHtml = '<h3>Items del pedido</h3>';
  let computedSubtotal = 0;

  if(items.length === 0){
    itemsHtml += '<p style="color:#888">No se encontraron items en este pedido.</p>';
  } else {
    items.forEach(it => {
      const precio = Number(it.precioUnitario) || 0;
      const qty    = Number(it.cantidad) || 1;
      const line   = Number(it.totalLinea) || (precio * qty);
      computedSubtotal += line;

      const notesHtml = it.notasItem ? `<div class="note" style="margin-top:4px">${it.notasItem}</div>` : '';

      itemsHtml += `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f3f3f3">
          <div style="flex:1">
            <div style="font-weight:700">${it.nombreProducto} x${qty}</div>
            ${notesHtml}
          </div>
          <div style="text-align:right;white-space:nowrap;color:#3b82f6;font-weight:700">
            ${fmt.format(precio)} x${qty} = ${fmt.format(line)}
          </div>
        </div>`;
    });
  }
  document.getElementById('itemsInfo').innerHTML = itemsHtml;

  /* ── 5. Resumen: subtotal + envío + descuento + total ── */
  const subtotal = Number(order.subtotal) || computedSubtotal;
  const total = Number(order.total) || subtotal;
  const descuento = Number(order.descuentoTotal) || 0;
  const envio = Number(order.precioEnvio) || 0;

  document.getElementById('ordSubtotal').textContent  = fmt.format(subtotal);
  document.getElementById('ordShipping').textContent  = fmt.format(envio);

  // Show/hide discount row
  const discountRow = document.getElementById('ordDiscountRow');
  if (descuento > 0) {
    discountRow.style.display = '';
    document.getElementById('ordDiscount').textContent = '-' + fmt.format(descuento);
  } else {
    discountRow.style.display = 'none';
  }

  document.getElementById('ordTotal').textContent     = fmt.format(total);
}

// ── init ──
(async function(){
  const orderId = qs('id');
  if(!orderId){ document.getElementById('msg').textContent = 'No se especificó un ID de pedido.'; return; }
  const data = await loadOrderById(orderId);
  renderOrder(data);
})();

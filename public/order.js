// public/order.js — renders the order receipt ("boleta")
const fmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

function qs(name){ return new URL(window.location.href).searchParams.get(name); }

function loadOrderById(id){
  try{
    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    return orders.find(o => o.id === id) || null;
  }catch{ return null; }
}

function renderOrder(order){
  if(!order){
    document.getElementById('msg').textContent = 'Pedido no encontrado.';
    return;
  }

  console.log('[order] rendering:', order);

  /* ── 1. Información del pedido ── */
  const date = new Date(order.createdAt || Date.now());
  document.getElementById('orderInfo').innerHTML = `
    <h3>Información del pedido</h3>
    <div>Número: <strong>${order.numero || order.id}</strong></div>
    <div>Estado: <strong>pendiente</strong></div>
    <div>Fecha: ${date.toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'})}</div>`;

  /* ── 2. Datos del cliente ── */
  document.getElementById('clientInfo').innerHTML = `
    <h3>Datos del cliente</h3>
    <div>Nombre: ${order.nombre || '-'}</div>
    <div>Correo: ${order.email || '-'}</div>
    <div>Teléfono: ${order.telefono || '-'}</div>`;

  /* ── 3. Tipo de entrega ── */
  const isDomicilio = order.delivery === 'domicilio';
  const addr = order.deliveryAddress || {};
  let delHtml = `<h3>Tipo de entrega</h3>
    <div>${isDomicilio ? 'Despacho a domicilio' : 'Retiro en tienda'}</div>`;
  if(isDomicilio){
    delHtml += `<div style="margin-top:8px">
      <div><strong>Calle:</strong> ${addr.calle || '-'}</div>
      <div><strong>Número:</strong> ${addr.numero || '-'}</div>
      <div><strong>Notas:</strong> ${addr.notas || '-'}</div>
      <div><strong>Sector:</strong> ${addr.sectorNombre || addr.sectorId || '-'}</div>
    </div>`;
  }
  document.getElementById('deliveryInfo').innerHTML = delHtml;

  /* ── 4. Items del pedido ── */
  let items = order.items;
  if(!Array.isArray(items)){
    try{ items = JSON.parse(items); }catch{ items = []; }
  }
  if(!Array.isArray(items)) items = [];

  let itemsHtml = '<h3>Items del pedido</h3>';
  let computedSubtotal = 0;

  if(items.length === 0){
    itemsHtml += '<p style="color:#888">No se encontraron items en este pedido.</p>';
  } else {
    items.forEach(it => {
      const precio = Number(it.precio) || 0;
      const qty    = Number(it.cantidad) || 1;
      const line   = precio * qty;
      computedSubtotal += line;

      const removedBadges = (it.ingredientesQuitados || [])
        .map(r => `<div class="badge removed" style="display:inline-block;margin-right:6px;margin-bottom:4px">Sin: ${r.nombre}</div>`)
        .join('');
      const notesHtml = it.notas ? `<div class="note" style="margin-top:4px">Nota: ${it.notas}</div>` : '';

      itemsHtml += `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f3f3f3">
          <div style="flex:1">
            <div style="font-weight:700">${it.nombre} x${qty}</div>
            ${removedBadges}
            ${notesHtml}
          </div>
          <div style="text-align:right;white-space:nowrap;color:#3b82f6;font-weight:700">
            ${fmt.format(precio)} x${qty} = ${fmt.format(line)}
          </div>
        </div>`;
    });
  }
  document.getElementById('itemsInfo').innerHTML = itemsHtml;

  /* ── 5. Resumen: subtotal + envío + total ── */
  // Use stored numeric values; fallback to computed
  const subtotal = (typeof order.subtotalValue === 'number' && order.subtotalValue > 0)
    ? order.subtotalValue : computedSubtotal;

  const shipping = Number(order.shippingValue) || (addr.precioEnvio ? Number(addr.precioEnvio) : 0);

  const total = subtotal + shipping;

  document.getElementById('ordSubtotal').textContent  = fmt.format(subtotal);
  document.getElementById('ordShipping').textContent  = fmt.format(shipping);
  document.getElementById('ordTotal').textContent     = fmt.format(total);
}

// ── init ──
const orderId = qs('id');
const order   = orderId ? loadOrderById(orderId) : null;
renderOrder(order);

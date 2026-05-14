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

function normalizeEstado(estado) {
  if (!estado) return 'Pendiente';
  const e = String(estado).toLowerCase().trim();
  if (e.includes('pendiente')) return 'Pendiente';
  if (e.includes('preparaci') || e.includes('preparando')) return 'Preparación';
  if (e.includes('listo') || e.includes('retiro')) return 'Listo para retiro';
  if (e.includes('camino')) return 'En camino';
  if (e.includes('entregado')) return 'Entregado';
  if (e.includes('cancelado')) return 'Cancelado';
  return estado;
}

function renderStatusTimeline(estado, tipoEntrega) {
  const estadoNormalized = normalizeEstado(estado);
  const isDomicilio = tipoEntrega === 'Delivery';
  const isCancelado = estadoNormalized === 'Cancelado';

  // Define the journey based on delivery type
  const journey = isDomicilio
    ? ['Pendiente', 'Preparación', 'En camino', 'Entregado']
    : ['Pendiente', 'Preparación', 'Listo para retiro', 'Entregado'];

  if (isCancelado) {
    return `
      <div class="order-status-timeline">
        <h4>Estado del Pedido</h4>
        <div class="timeline-container">
          <div class="timeline-step cancelled">
            <div class="timeline-dot">✕</div>
            <div class="timeline-label">Cancelado</div>
          </div>
        </div>
        <div class="timeline-cancelled-msg">Este pedido ha sido cancelado</div>
      </div>`;
  }

  let currentIndex = journey.indexOf(estadoNormalized);
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  let html = '<div class="order-status-timeline"><h4>Estado del Pedido</h4><div class="timeline-container">';

  journey.forEach((step, idx) => {
    let stepClass = 'timeline-step';
    if (idx < currentIndex) {
      stepClass += ' completed';
    } else if (idx === currentIndex) {
      stepClass += ' active';
    }

    const stepLabel = step;
    const stepNumber = idx + 1;
    let dotContent = stepNumber;
    if (idx <= currentIndex) {
      dotContent = '✓';
    }

    html += `
      <div class="${stepClass}">
        <div class="timeline-dot">${dotContent}</div>
        <div class="timeline-label">${stepLabel}</div>
      </div>`;

    if (idx < journey.length - 1) {
      let connectorClass = 'timeline-connector';
      if (idx <= currentIndex) {
        connectorClass += ' completed';
      }
      html += `<div class="${connectorClass}"></div>`;
    }
  });

  html += '</div></div>';
  return html;
}

function renderOrder(data){
  if(!data || !data.pedido){
    document.getElementById('msg').textContent = 'Pedido no encontrado.';
    return;
  }

  const order = data.pedido;
  const items = data.items || [];
  const isMockaPointsRedemption = order.codigoCuponSnapshot === 'CANJE MOCKA POINTS';

  /* ── Timeline de estado ── */
  const statusTimelineHtml = renderStatusTimeline(order.estado, order.tipoEntrega);
  document.getElementById('orderInfo').insertAdjacentHTML('beforebegin', statusTimelineHtml);

  /* ── 1. Información del pedido ── */
  const date = new Date(order.creadoEn || Date.now());
  let orderInfoHtml = `
    <h3>Información del pedido</h3>
    <div>Número: <strong>${order.numeroPedido || order.id}</strong></div>
    <div>Estado: <strong>${order.estado || 'Pendiente'}</strong></div>
    <div>Fecha: ${date.toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'})}</div>`;
  
  if (isMockaPointsRedemption) {
    orderInfoHtml += `<div style="margin-top:10px;padding:10px;background:linear-gradient(135deg,#fff8e1,#ffe082);border-radius:8px;font-weight:600;color:#4e2a00">🏆 CANJE MOCKA POINTS</div>`;
  }
  document.getElementById('orderInfo').innerHTML = orderInfoHtml;

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

      const notesHtml = it.notasItem ? `<div class="note" style="margin-top:4px;font-size:0.85rem;color:#666">${it.notasItem}</div>` : '';

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

  if (isMockaPointsRedemption) {
    // Orden de canje con Mocka Points - mostrar mensaje especial
    document.getElementById('ordSubtotal').textContent = 'Canje';
    document.getElementById('ordShipping').textContent = '$0';
    document.getElementById('ordDiscountRow').style.display = 'none';
    document.getElementById('ordTotal').innerHTML = '<span style="color:#f57f17;font-weight:700">🏆 GRATIS</span>';
  } else {
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
}

// ── init ──
(async function(){
  const orderId = qs('id');
  if(!orderId){ document.getElementById('msg').textContent = 'No se especificó un ID de pedido.'; return; }
  const data = await loadOrderById(orderId);
  renderOrder(data);
})();

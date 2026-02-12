// public/mis-pedidos.js — Historial de pedidos del usuario
(async function () {
  const fmt = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' });
  const content = document.getElementById('ordersContent');

  /* ── Auth check ── */
  const authRes = await fetch('/api/auth/me');
  const authData = await authRes.json();
  if (!authData.user) {
    window.location.href = '/login.html';
    return;
  }

  /* ── Load orders ── */
  let allPedidos = [];
  try {
    const res = await fetch('/api/mis-pedidos');
    if (!res.ok) throw new Error('Error cargando pedidos');
    const data = await res.json();
    allPedidos = data.pedidos || [];
  } catch (e) {
    content.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error al cargar tus pedidos</p></div>';
    return;
  }

  /* ── Classify ── */
  const estadosActivos = ['Pendiente', 'Preparando', 'Listo para retirar', 'En Camino'];
  const estadosFinal = ['Entregado', 'Cancelado'];

  const activos = allPedidos.filter(p => estadosActivos.includes(p.estado));
  const completados = allPedidos.filter(p => estadosFinal.includes(p.estado));

  /* ── Update counts ── */
  document.getElementById('countActivos').textContent = activos.length;
  document.getElementById('countCompletados').textContent = completados.length;
  document.getElementById('countTodos').textContent = allPedidos.length;

  /* ── Helpers ── */
  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  function statusBadge(estado) {
    const map = {
      'Pendiente': 'warning', 'Preparando': 'info', 'Listo para retirar': 'primary',
      'En Camino': 'primary', 'Entregado': 'success', 'Cancelado': 'danger'
    };
    return '<span class="badge badge-' + (map[estado] || 'default') + '">' + esc(estado || 'Sin estado') + '</span>';
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderOrders(list) {
    if (list.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No tienes pedidos aquí</p><a href="/">Ir a la tienda</a></div>';
      return;
    }

    let html = '';
    list.forEach(p => {
      html += '<div class="order-card">';

      // Header
      html += '<div class="order-header">' +
        '<div><span class="order-number">' + esc(p.numeroPedido) + '</span> ' + statusBadge(p.estado) + '</div>' +
        '<span class="order-date">' + fmtDate(p.creadoEn) + '</span>' +
      '</div>';

      // Items
      html += '<div class="order-items">';
      (p.items || []).forEach(it => {
        html += '<div class="order-item-row">' +
          '<div>' +
            '<span class="order-item-name">' + esc(it.nombreProducto) + '</span>' +
            ' <span class="order-item-qty">x' + it.cantidad + '</span>' +
            (it.notasItem ? '<div class="order-item-notes">' + esc(it.notasItem) + '</div>' : '') +
          '</div>' +
          '<span class="order-item-price">' + fmt.format(Number(it.totalLinea) || 0) + '</span>' +
        '</div>';
      });
      html += '</div>';

      // Footer
      html += '<div class="order-footer">' +
        '<span class="order-type">' + (p.tipoEntrega || 'Sin especificar') + '</span>' +
        '<span class="order-total">Total: ' + fmt.format(Number(p.total) || 0) + '</span>' +
      '</div>';

      html += '</div>';
    });

    content.innerHTML = html;
  }

  /* ── Tabs ── */
  const tabs = document.querySelectorAll('.orders-tab');
  const datasets = { activos, completados, todos: allPedidos };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderOrders(datasets[tab.dataset.tab] || allPedidos);
    });
  });

  // Initial render
  renderOrders(activos.length > 0 ? activos : allPedidos);
  if (activos.length === 0 && allPedidos.length > 0) {
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="todos"]').classList.add('active');
  }
})();

// public/admin.js — Panel de administración completo
(async function () {
  /* ── Auth check ── */
  const authRes = await fetch('/api/auth/me');
  const authData = await authRes.json();
  if (!authData.user) { window.location.href = '/login.html'; return; }

  // Check admin role
  try {
    const dashRes = await fetch('/api/admin/dashboard');
    if (dashRes.status === 403 || dashRes.status === 401) {
      alert('Acceso denegado: No tienes permisos de administrador');
      window.location.href = '/';
      return;
    }
  } catch (e) { window.location.href = '/'; return; }

  document.getElementById('adminName').textContent = authData.user.nombre || 'Admin';
  document.getElementById('adminAvatar').textContent = (authData.user.nombre || 'A')[0].toUpperCase();

  /* ══════════════════════════════════════════
     NAVIGATION
     ══════════════════════════════════════════ */
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const sections = document.querySelectorAll('.section');
  const sectionTitle = document.getElementById('sectionTitle');
  const sidebar = document.getElementById('sidebar');

  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section;
      navItems.forEach(n => n.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('sec-' + sec).classList.add('active');
      sectionTitle.textContent = btn.textContent.trim();
      sidebar.classList.remove('open');
      // Load data
      loaders[sec] && loaders[sec]();
    });
  });

  document.getElementById('menuToggle').addEventListener('click', () => sidebar.classList.toggle('open'));
  document.getElementById('adminLogout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  // Close modals
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      document.getElementById(modalId).classList.remove('open');
      // If closing cancel modal without confirming, revert select
      if (modalId === 'cancelModal' && pendingCancelSelect) {
        loadOrders(); // reload to restore original select value
        pendingCancelOrderId = null;
        pendingCancelSelect = null;
      }
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) {
        m.classList.remove('open');
        if (m.id === 'cancelModal' && pendingCancelSelect) {
          loadOrders();
          pendingCancelOrderId = null;
          pendingCancelSelect = null;
        }
      }
    });
  });

  /* ══════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════ */
  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function fmt(n) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(n || 0)); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function badge(text, type) { return '<span class="badge badge-' + type + '">' + esc(text) + '</span>'; }

  function statusBadge(estado) {
    const map = { 'Pendiente': 'warning', 'Preparando': 'info', 'Listo para retirar': 'primary', 'En Camino': 'primary', 'Entregado': 'success', 'Cancelado': 'danger' };
    return badge(estado || 'Sin estado', map[estado] || 'default');
  }

  async function api(url, method, body) {
    const opts = { method: method || 'GET', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    return res.json();
  }

  /* ══════════════════════════════════════════
     DASHBOARD
     ══════════════════════════════════════════ */
  async function loadDashboard() {
    const data = await api('/api/admin/dashboard');
    if (!data.stats) return;

    const s = data.stats;
    document.getElementById('statsGrid').innerHTML =
      statCard('👥', 'Usuarios', s.totalUsers, 'purple') +
      statCard('🧃', 'Productos', s.totalProducts, 'blue') +
      statCard('📦', 'Pedidos', s.totalOrders, 'orange') +
      statCard('💰', 'Ingresos', fmt(s.totalRevenue), 'green');

    // Orders by status
    let html = '<div class="status-pills">';
    (data.ordersByStatus || []).forEach(o => {
      html += '<div class="status-pill">' + statusBadge(o.estado) + ' <strong>' + o.cantidad + '</strong></div>';
    });
    html += '</div>';
    document.getElementById('ordersByStatus').innerHTML = html;

    // Top products
    html = '<table class="admin-table compact"><thead><tr><th>Producto</th><th>Vendidos</th><th>Ingresos</th></tr></thead><tbody>';
    (data.topProducts || []).forEach(p => {
      html += '<tr><td>' + esc(p.nombreProducto) + '</td><td>' + p.vendidos + '</td><td>' + fmt(p.ingresos) + '</td></tr>';
    });
    html += '</tbody></table>';
    if (!data.topProducts || data.topProducts.length === 0) html = '<p class="empty">No hay ventas aún</p>';
    document.getElementById('topProducts').innerHTML = html;

    // Sales week
    html = '<div class="sales-bars">';
    (data.salesWeek || []).forEach(d => {
      const label = new Date(d.dia).toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric' });
      html += '<div class="sales-bar-item"><div class="sales-label">' + label + '</div><div class="sales-value">' + d.pedidos + ' pedidos — ' + fmt(d.ventas) + '</div></div>';
    });
    if (!data.salesWeek || data.salesWeek.length === 0) html = '<p class="empty">No hay ventas en los últimos 7 días</p>';
    html += '</div>';
    document.getElementById('salesWeek').innerHTML = html;

    // Recent orders
    html = '<table class="admin-table compact"><thead><tr><th>#</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>';
    (data.recentOrders || []).forEach(o => {
      html += '<tr><td>' + esc(o.numeroPedido) + '</td><td>' + esc(o.nombreContacto) + '</td><td>' + fmt(o.total) + '</td><td>' + statusBadge(o.estado) + '</td><td>' + fmtDate(o.creadoEn) + '</td></tr>';
    });
    html += '</tbody></table>';
    if (!data.recentOrders || data.recentOrders.length === 0) html = '<p class="empty">No hay pedidos aún</p>';
    document.getElementById('recentOrders').innerHTML = html;
  }

  function statCard(icon, label, value, color) {
    return '<div class="stat-card stat-' + color + '"><div class="stat-icon">' + icon + '</div><div class="stat-info"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div></div>';
  }

  /* ══════════════════════════════════════════
     PEDIDOS
     ══════════════════════════════════════════ */
  let estados = [];
  async function loadEstados() {
    if (estados.length > 0) return;
    const data = await api('/api/admin/estados');
    estados = data.estados || [];
  }

  async function loadOrders() {
    await loadEstados();
    const data = await api('/api/admin/pedidos');
    const tbody = document.querySelector('#ordersTable tbody');
    tbody.innerHTML = '';
    (data.pedidos || []).forEach(p => {
      const tr = document.createElement('tr');
      var tipoE = (p.tipoEntrega || '').toLowerCase();
      var esRetiro = tipoE.indexOf('recogida') >= 0 || tipoE.indexOf('retiro') >= 0;
      var entregaBadge = esRetiro
        ? '<span class="badge badge-info">🏪 Retiro en tienda</span>'
        : '<span class="badge badge-warning">🚚 Despacho</span>';
      tr.innerHTML =
        '<td><strong>' + esc(p.numeroPedido) + '</strong></td>' +
        '<td>' + esc(p.nombreContacto) + '<br><small>' + esc(p.correoContacto) + '</small></td>' +
        '<td>' + fmt(p.total) + '</td>' +
        '<td>' + entregaBadge + '</td>' +
        '<td>' + statusBadge(p.estado) + '</td>' +
        '<td>' + fmtDate(p.creadoEn) + '</td>' +
        '<td><button class="btn small" data-view-order="' + p.id + '">👁️</button> ' +
          '<select class="status-select" data-order-status="' + p.id + '">' +
            estados.map(e => '<option value="' + e.id + '"' + (e.id === p.estadoId ? ' selected' : '') + '>' + e.nombre + '</option>').join('') +
          '</select></td>';
      tbody.appendChild(tr);
    });

    // Events
    tbody.querySelectorAll('[data-view-order]').forEach(btn => {
      btn.addEventListener('click', () => viewOrder(btn.dataset.viewOrder));
    });
    tbody.querySelectorAll('[data-order-status]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const selectedEstado = estados.find(e => e.id === sel.value);
        if (selectedEstado && selectedEstado.nombre === 'Cancelado') {
          // Show cancel reason modal
          pendingCancelOrderId = sel.dataset.orderStatus;
          pendingCancelEstadoId = sel.value;
          pendingCancelSelect = sel;
          document.getElementById('cancelReason').value = '';
          document.getElementById('cancelModal').classList.add('open');
        } else {
          await api('/api/admin/pedidos/' + sel.dataset.orderStatus + '/estado', 'PATCH', { estadoId: sel.value });
          loadOrders();
        }
      });
    });
  }

  // Cancel modal logic
  let pendingCancelOrderId = null;
  let pendingCancelEstadoId = null;
  let pendingCancelSelect = null;

  document.getElementById('confirmCancelBtn').addEventListener('click', async () => {
    if (!pendingCancelOrderId) return;
    const motivo = document.getElementById('cancelReason').value.trim();
    await api('/api/admin/pedidos/' + pendingCancelOrderId + '/estado', 'PATCH', {
      estadoId: pendingCancelEstadoId,
      motivoCancelacion: motivo || 'Sin motivo especificado'
    });
    document.getElementById('cancelModal').classList.remove('open');
    pendingCancelOrderId = null;
    loadOrders();
  });

  async function viewOrder(id) {
    const data = await api('/api/admin/pedidos/' + id);
    if (!data.pedido) return;
    const p = data.pedido;
    let html = '<div class="order-detail">' +
      '<div class="order-detail-grid">' +
        '<div><strong>Pedido:</strong> ' + esc(p.numeroPedido) + '</div>' +
        '<div><strong>Estado:</strong> ' + statusBadge(p.estado) + '</div>' +
        '<div><strong>Cliente:</strong> ' + esc(p.nombreContacto) + '</div>' +
        '<div><strong>Correo:</strong> ' + esc(p.correoContacto) + '</div>' +
        '<div><strong>Teléfono:</strong> ' + esc(p.telefonoContacto) + '</div>' +
        '<div><strong>Entrega:</strong> ' + esc(p.tipoEntrega) + '</div>' +
        (p.calle ? '<div><strong>Dirección:</strong> ' + esc(p.calle) + ' ' + esc(p.numeroCasa) + ', ' + esc(p.sector) + '</div>' : '') +
        '<div><strong>Fecha:</strong> ' + fmtDate(p.creadoEn) + '</div>' +
      '</div>' +
      '<h4>Items</h4>' +
      '<table class="admin-table compact"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio U.</th><th>Total</th><th>Notas</th></tr></thead><tbody>';
    (data.items || []).forEach(i => {
      html += '<tr><td>' + esc(i.nombreProducto) + '</td><td>' + i.cantidad + '</td><td>' + fmt(i.precioUnitario) + '</td><td>' + fmt(i.totalLinea) + '</td><td>' + esc(i.notasItem) + '</td></tr>';
    });
    var envio = (Number(p.total) || 0) - (Number(p.subtotal) || 0) + (Number(p.descuentoTotal) || 0);
    html += '</tbody></table>' +
      '<div class="order-totals">' +
        '<div>Subtotal: ' + fmt(p.subtotal) + '</div>' +
        (envio > 0 ? '<div>Envío: ' + fmt(envio) + '</div>' : '') +
        (Number(p.descuentoTotal) > 0 ? '<div>Descuento: -' + fmt(p.descuentoTotal) + '</div>' : '') +
        '<div class="total-big">Total: ' + fmt(p.total) + '</div>' +
      '</div></div>';
    document.getElementById('orderDetailContent').innerHTML = html;
    document.getElementById('orderModal').classList.add('open');
  }

  /* ══════════════════════════════════════════
     PRODUCTOS
     ══════════════════════════════════════════ */
  let categorias = [];
  let allIngredientes = []; // todos los ingredientes disponibles
  async function loadCategorias() {
    const data = await api('/api/admin/categorias');
    categorias = data.categorias || [];
  }
  async function loadAllIngredientes() {
    const data = await api('/api/admin/ingredientes');
    allIngredientes = data.ingredientes || [];
  }

  async function loadProducts() {
    await loadCategorias();
    await loadAllIngredientes();
    // Fill category select
    const sel = document.getElementById('prod-categoria');
    sel.innerHTML = '<option value="">Sin categoría</option>';
    categorias.forEach(c => { sel.innerHTML += '<option value="' + c.id + '">' + esc(c.nombre) + '</option>'; });

    const data = await api('/api/admin/productos');
    const tbody = document.querySelector('#productsTable tbody');
    tbody.innerHTML = '';
    (data.productos || []).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(p.nombre) + '</td>' +
        '<td>' + esc(p.categoriaNombre || '—') + '</td>' +
        '<td>' + fmt(p.precio) + (p.costoMockaPoints ? ' <span class="badge badge-info" title="Canjeable con Mocka Points">🏆 ' + p.costoMockaPoints + ' pts</span>' : '') + '</td>' +
        '<td>' + (p.ingredientes && p.ingredientes.length > 0
          ? '<span class="badge badge-info">' + p.ingredientes.length + '</span> <small>' + p.ingredientes.map(i => i.nombre).join(', ') + '</small>'
          : '<span class="badge badge-default">0</span>') + '</td>' +
        '<td>' + (p.activo ? badge('Activo', 'success') : badge('Inactivo', 'danger')) + '</td>' +
        '<td><button class="btn small" data-edit-product="' + p.id + '">✏️</button> <button class="btn small danger" data-del-product="' + p.id + '">🗑️</button></td>';
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-edit-product]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = (data.productos || []).find(x => x.id === btn.dataset.editProduct);
        if (p) openProductModal(p);
      });
    });
    tbody.querySelectorAll('[data-del-product]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Desactivar este producto?')) return;
        await api('/api/admin/productos/' + btn.dataset.delProduct, 'DELETE');
        loadProducts();
      });
    });
  }

  function openProductModal(p) {
    document.getElementById('productModalTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';
    document.getElementById('prod-id').value = p ? p.id : '';
    document.getElementById('prod-nombre').value = p ? p.nombre : '';
    document.getElementById('prod-precio').value = p ? p.precio : '';
    document.getElementById('prod-categoria').value = p ? (p.categoriaId || '') : '';
    document.getElementById('prod-descripcion').value = p ? (p.descripcion || '') : '';
    document.getElementById('prod-imagen').value = p ? (p.imagen || '') : '';
    document.getElementById('prod-activo').checked = p ? !!p.activo : true;
    document.getElementById('prod-mockapoints').value = p && p.costoMockaPoints ? p.costoMockaPoints : '';
    document.getElementById('productMsg').textContent = '';

    // Render ingredientes checkboxes
    const container = document.getElementById('prod-ingredientes-list');
    const productIngs = (p && p.ingredientes) ? p.ingredientes : [];
    let html = '';
    allIngredientes.forEach(ing => {
      const linked = productIngs.find(pi => pi.ingredienteId === ing.id);
      const checked = linked ? 'checked' : '';
      const defChecked = linked && linked.incluidoPorDefecto ? 'checked' : (!linked ? 'checked' : '');
      const quitarChecked = linked ? (linked.sePuedeQuitar ? 'checked' : '') : 'checked';
      html += '<div class="ingredient-item' + (linked ? ' selected' : '') + '">' +
        '<label class="checkbox-label ing-select">' +
          '<input type="checkbox" class="ing-check" data-ing-id="' + ing.id + '" ' + checked + '/>' +
          '<span class="ing-name">' + esc(ing.nombre) + '</span>' +
        '</label>' +
        '<div class="ing-options' + (linked ? '' : ' hidden') + '">' +
          '<label class="checkbox-label small"><input type="checkbox" class="ing-default" data-ing-id="' + ing.id + '" ' + defChecked + '/><span>Incluido por defecto</span></label>' +
          '<label class="checkbox-label small"><input type="checkbox" class="ing-removable" data-ing-id="' + ing.id + '" ' + quitarChecked + '/><span>Se puede quitar</span></label>' +
        '</div>' +
      '</div>';
    });
    if (allIngredientes.length === 0) html = '<p class="empty">No hay ingredientes creados. Crea ingredientes desde la pestaña Ingredientes.</p>';
    container.innerHTML = html;

    // Toggle options visibility when selecting/deselecting ingredient
    container.querySelectorAll('.ing-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const item = cb.closest('.ingredient-item');
        const opts = item.querySelector('.ing-options');
        if (cb.checked) { item.classList.add('selected'); opts.classList.remove('hidden'); }
        else { item.classList.remove('selected'); opts.classList.add('hidden'); }
      });
    });

    document.getElementById('productModal').classList.add('open');
  }

  document.getElementById('btnAddProduct').addEventListener('click', () => openProductModal(null));
  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;

    // Recopilar ingredientes seleccionados
    const ingredientes = [];
    document.querySelectorAll('#prod-ingredientes-list .ing-check:checked').forEach(cb => {
      const ingId = cb.dataset.ingId;
      const defCb = document.querySelector('.ing-default[data-ing-id="' + ingId + '"]');
      const remCb = document.querySelector('.ing-removable[data-ing-id="' + ingId + '"]');
      ingredientes.push({
        ingredienteId: ingId,
        incluidoPorDefecto: defCb ? defCb.checked : true,
        sePuedeQuitar: remCb ? remCb.checked : true
      });
    });

    const body = {
      nombre: document.getElementById('prod-nombre').value,
      precio: parseFloat(document.getElementById('prod-precio').value),
      categoriaId: document.getElementById('prod-categoria').value || null,
      descripcion: document.getElementById('prod-descripcion').value,
      imagen: document.getElementById('prod-imagen').value,
      activo: document.getElementById('prod-activo').checked,
      costoMockaPoints: document.getElementById('prod-mockapoints').value ? parseInt(document.getElementById('prod-mockapoints').value) : null,
      ingredientes
    };
    const msg = document.getElementById('productMsg');
    const data = await api('/api/admin/productos' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body);
    if (data.ok) { document.getElementById('productModal').classList.remove('open'); loadProducts(); }
    else { msg.textContent = data.error || 'Error'; msg.className = 'form-msg error'; }
  });

  /* ══════════════════════════════════════════
     CATEGORÍAS
     ══════════════════════════════════════════ */
  async function loadCategories() {
    await loadCategorias();
    const tbody = document.querySelector('#categoriesTable tbody');
    tbody.innerHTML = '';
    categorias.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(c.nombre) + '</td>' +
        '<td>' + esc(c.descripcion || '—') + '</td>' +
        '<td><button class="btn small" data-edit-cat="' + c.id + '">✏️</button></td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-edit-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = categorias.find(x => x.id === btn.dataset.editCat);
        if (c) openCategoryModal(c);
      });
    });
  }

  function openCategoryModal(c) {
    document.getElementById('categoryModalTitle').textContent = c ? 'Editar categoría' : 'Nueva categoría';
    document.getElementById('cat-id').value = c ? c.id : '';
    document.getElementById('cat-nombre').value = c ? c.nombre : '';
    document.getElementById('cat-descripcion').value = c ? (c.descripcion || '') : '';
    document.getElementById('categoryMsg').textContent = '';
    document.getElementById('categoryModal').classList.add('open');
  }

  document.getElementById('btnAddCategory').addEventListener('click', () => openCategoryModal(null));
  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cat-id').value;
    const body = { nombre: document.getElementById('cat-nombre').value, descripcion: document.getElementById('cat-descripcion').value, activo: true };
    const data = await api('/api/admin/categorias' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body);
    if (data.ok || data.id) { document.getElementById('categoryModal').classList.remove('open'); loadCategories(); loadCategorias(); }
    else { document.getElementById('categoryMsg').textContent = data.error; document.getElementById('categoryMsg').className = 'form-msg error'; }
  });

  /* ══════════════════════════════════════════
     USUARIOS
     ══════════════════════════════════════════ */
  let roles = [];
  async function loadRoles() {
    const data = await api('/api/admin/roles');
    roles = data.roles || [];
  }

  async function loadUsers() {
    await loadRoles();
    const sel = document.getElementById('user-rol');
    sel.innerHTML = '<option value="">Sin rol</option>';
    roles.forEach(r => { sel.innerHTML += '<option value="' + r.id + '">' + esc(r.nombre) + '</option>'; });

    const data = await api('/api/admin/usuarios');
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '';
    (data.usuarios || []).forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(u.nombre) + (u.googleId ? ' <small title="Google">🔗</small>' : '') + '</td>' +
        '<td>' + esc(u.correo) + '</td>' +
        '<td>' + esc(u.telefono || '—') + '</td>' +
        '<td>' + badge(u.rol || 'Sin rol', u.rol === 'admin' ? 'primary' : 'default') + '</td>' +
        '<td>' + (u.mockaPoints || 0) + '</td>' +
        '<td>' + (u.activo ? badge('Activo', 'success') : badge('Inactivo', 'danger')) + '</td>' +
        '<td><button class="btn small" data-edit-user="' + u.id + '">✏️</button></td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-edit-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = (data.usuarios || []).find(x => x.id === btn.dataset.editUser);
        if (u) openUserModal(u);
      });
    });
  }

  function openUserModal(u) {
    document.getElementById('user-id').value = u.id;
    document.getElementById('user-nombre').value = u.nombre;
    document.getElementById('user-telefono').value = u.telefono || '';
    document.getElementById('user-rol').value = u.rolId || '';
    document.getElementById('user-points').value = u.mockaPoints || 0;
    document.getElementById('user-activo').checked = !!u.activo;
    document.getElementById('userMsg').textContent = '';
    document.getElementById('userModal').classList.add('open');
  }

  document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      nombre: document.getElementById('user-nombre').value,
      telefono: document.getElementById('user-telefono').value,
      rolId: document.getElementById('user-rol').value || null,
      mockaPoints: parseInt(document.getElementById('user-points').value) || 0,
      activo: document.getElementById('user-activo').checked
    };
    const data = await api('/api/admin/usuarios/' + document.getElementById('user-id').value, 'PUT', body);
    if (data.ok) { document.getElementById('userModal').classList.remove('open'); loadUsers(); }
    else { document.getElementById('userMsg').textContent = data.error; document.getElementById('userMsg').className = 'form-msg error'; }
  });

  /* ══════════════════════════════════════════
     SECTORES
     ══════════════════════════════════════════ */
  async function loadSectors() {
    const data = await api('/api/admin/sectores');
    const tbody = document.querySelector('#sectorsTable tbody');
    tbody.innerHTML = '';
    (data.sectores || []).forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(s.nombre) + '</td>' +
        '<td>' + esc(s.descripcion || '—') + '</td>' +
        '<td>' + fmt(s.precioEnvio) + '</td>' +
        '<td>' + (s.activo ? badge('Activo', 'success') : badge('Inactivo', 'danger')) + '</td>' +
        '<td><button class="btn small" data-edit-sector="' + s.id + '">✏️</button> <button class="btn small danger" data-del-sector="' + s.id + '">🗑️</button></td>';
      tbody.appendChild(tr);
    });
    const sectoresData = data.sectores || [];
    tbody.querySelectorAll('[data-edit-sector]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = sectoresData.find(x => x.id === btn.dataset.editSector);
        if (s) openSectorModal(s);
      });
    });
    tbody.querySelectorAll('[data-del-sector]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Desactivar este sector?')) return;
        await api('/api/admin/sectores/' + btn.dataset.delSector, 'DELETE');
        loadSectors();
      });
    });
  }

  function openSectorModal(s) {
    document.getElementById('sectorModalTitle').textContent = s ? 'Editar sector' : 'Nuevo sector';
    document.getElementById('sec-id').value = s ? s.id : '';
    document.getElementById('sec-nombre').value = s ? s.nombre : '';
    document.getElementById('sec-descripcion').value = s ? (s.descripcion || '') : '';
    document.getElementById('sec-precio').value = s ? s.precioEnvio : '';
    document.getElementById('sec-activo').checked = s ? !!s.activo : true;
    document.getElementById('sectorMsg').textContent = '';
    document.getElementById('sectorModal').classList.add('open');
  }

  document.getElementById('btnAddSector').addEventListener('click', () => openSectorModal(null));
  document.getElementById('sectorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('sec-id').value;
    const body = {
      nombre: document.getElementById('sec-nombre').value,
      descripcion: document.getElementById('sec-descripcion').value,
      precioEnvio: parseFloat(document.getElementById('sec-precio').value),
      activo: document.getElementById('sec-activo').checked
    };
    const data = await api('/api/admin/sectores' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body);
    if (data.ok || data.id) { document.getElementById('sectorModal').classList.remove('open'); loadSectors(); }
    else { document.getElementById('sectorMsg').textContent = data.error; document.getElementById('sectorMsg').className = 'form-msg error'; }
  });

  /* ══════════════════════════════════════════
     CUPONES
     ══════════════════════════════════════════ */
  async function loadCoupons() {
    const data = await api('/api/admin/cupones');
    const tbody = document.querySelector('#couponsTable tbody');
    tbody.innerHTML = '';
    (data.cupones || []).forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(c.nombre) + '</td>' +
        '<td><code>' + esc(c.codigo) + '</code></td>' +
        '<td>' + (c.porcentajeDescuento ? c.porcentajeDescuento + '%' : '—') + (c.limiteDescuento ? '<br><small>Máx: ' + fmt(c.limiteDescuento) + '</small>' : '') + '</td>' +
        '<td>' + (c.minimoCompra ? fmt(c.minimoCompra) : '—') + '</td>' +
        '<td>' + (c.disponibles != null ? c.disponibles : '∞') + '</td>' +
        '<td>' + (c.venceEn ? fmtDate(c.venceEn) : 'Sin vencimiento') + '</td>' +
        '<td>' + (c.activo ? badge('Activo', 'success') : badge('Inactivo', 'danger')) + '</td>' +
        '<td><button class="btn small" data-edit-coupon="' + c.id + '">✏️</button> <button class="btn small danger" data-del-coupon="' + c.id + '">🗑️</button></td>';
      tbody.appendChild(tr);
    });
    const cuponesData = data.cupones || [];
    tbody.querySelectorAll('[data-edit-coupon]').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = cuponesData.find(x => x.id === btn.dataset.editCoupon);
        if (c) openCouponModal(c);
      });
    });
    tbody.querySelectorAll('[data-del-coupon]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Desactivar este cupón?')) return;
        await api('/api/admin/cupones/' + btn.dataset.delCoupon, 'DELETE');
        loadCoupons();
      });
    });
  }

  function openCouponModal(c) {
    document.getElementById('couponModalTitle').textContent = c ? 'Editar cupón' : 'Nuevo cupón';
    document.getElementById('cup-id').value = c ? c.id : '';
    document.getElementById('cup-nombre').value = c ? c.nombre : '';
    document.getElementById('cup-codigo').value = c ? c.codigo : '';
    document.getElementById('cup-porcentaje').value = c ? (c.porcentajeDescuento || '') : '';
    document.getElementById('cup-limite').value = c ? (c.limiteDescuento || '') : '';
    document.getElementById('cup-minimo').value = c ? (c.minimoCompra || '') : '';
    document.getElementById('cup-stock').value = c ? (c.disponibles != null ? c.disponibles : '') : '';
    document.getElementById('cup-vence').value = c && c.venceEn ? new Date(c.venceEn).toISOString().slice(0, 16) : '';
    document.getElementById('cup-activo').checked = c ? !!c.activo : true;
    document.getElementById('couponMsg').textContent = '';
    document.getElementById('couponModal').classList.add('open');
  }

  document.getElementById('btnAddCoupon').addEventListener('click', () => openCouponModal(null));
  document.getElementById('couponForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cup-id').value;
    const body = {
      nombre: document.getElementById('cup-nombre').value,
      codigo: document.getElementById('cup-codigo').value,
      porcentajeDescuento: parseFloat(document.getElementById('cup-porcentaje').value) || null,
      limiteDescuento: parseFloat(document.getElementById('cup-limite').value) || null,
      minimoCompra: parseFloat(document.getElementById('cup-minimo').value) || null,
      disponibles: document.getElementById('cup-stock').value ? parseInt(document.getElementById('cup-stock').value) : null,
      venceEn: document.getElementById('cup-vence').value || null,
      activo: document.getElementById('cup-activo').checked
    };
    const data = await api('/api/admin/cupones' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body);
    if (data.ok || data.id) { document.getElementById('couponModal').classList.remove('open'); loadCoupons(); }
    else { document.getElementById('couponMsg').textContent = data.error; document.getElementById('couponMsg').className = 'form-msg error'; }
  });

  /* ══════════════════════════════════════════
     INGREDIENTES
     ══════════════════════════════════════════ */
  async function loadIngredients() {
    const data = await api('/api/admin/ingredientes');
    const tbody = document.querySelector('#ingredientsTable tbody');
    tbody.innerHTML = '';
    (data.ingredientes || []).forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(i.nombre) + '</td>' +
        '<td>' + esc(i.descripcion || '—') + '</td>' +
        '<td>' + (i.activo ? badge('Activo', 'success') : badge('Inactivo', 'danger')) + '</td>' +
        '<td><button class="btn small" data-edit-ing="' + i.id + '">✏️</button></td>';
      tbody.appendChild(tr);
    });
    const ingredientesData = data.ingredientes || [];
    tbody.querySelectorAll('[data-edit-ing]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = ingredientesData.find(x => x.id === btn.dataset.editIng);
        if (i) openIngredientModal(i);
      });
    });
  }

  function openIngredientModal(i) {
    document.getElementById('ingredientModalTitle').textContent = i ? 'Editar ingrediente' : 'Nuevo ingrediente';
    document.getElementById('ing-id').value = i ? i.id : '';
    document.getElementById('ing-nombre').value = i ? i.nombre : '';
    document.getElementById('ing-descripcion').value = i ? (i.descripcion || '') : '';
    document.getElementById('ing-activo').checked = i ? !!i.activo : true;
    document.getElementById('ingredientMsg').textContent = '';
    document.getElementById('ingredientModal').classList.add('open');
  }

  document.getElementById('btnAddIngredient').addEventListener('click', () => openIngredientModal(null));
  document.getElementById('ingredientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ing-id').value;
    const body = {
      nombre: document.getElementById('ing-nombre').value,
      descripcion: document.getElementById('ing-descripcion').value,
      activo: document.getElementById('ing-activo').checked
    };
    const data = await api('/api/admin/ingredientes' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body);
    if (data.ok || data.id) { document.getElementById('ingredientModal').classList.remove('open'); loadIngredients(); }
    else { document.getElementById('ingredientMsg').textContent = data.error; document.getElementById('ingredientMsg').className = 'form-msg error'; }
  });

  /* ══════════════════════════════════════════
     SLIDER
     ══════════════════════════════════════════ */
  let slidesData = [];

  async function loadSlider() {
    const data = await api('/api/admin/slider');
    slidesData = data.slides || [];
    const tbody = document.querySelector('#sliderTable tbody');
    tbody.innerHTML = '';

    // Preview thumbnails
    const preview = document.getElementById('sliderPreview');
    preview.innerHTML = slidesData.filter(s => s.activo).length
      ? slidesData.filter(s => s.activo).sort((a, b) => a.orden - b.orden).map(s =>
          '<div style="width:120px;height:70px;border-radius:8px;overflow:hidden;border:2px solid #e5e7eb;flex-shrink:0">' +
          '<img src="' + esc(s.imagenUrl) + '" style="width:100%;height:100%;object-fit:cover" />' +
          '</div>').join('')
      : '<p style="color:#888;font-size:.85rem">No hay imágenes activas en el slider</p>';

    slidesData.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><img src="' + esc(s.imagenUrl) + '" style="width:80px;height:45px;object-fit:cover;border-radius:6px"/></td>' +
        '<td>' + esc(s.titulo || '—') + '</td>' +
        '<td>' + esc(s.subtitulo || '—') + '</td>' +
        '<td>' + (s.orden || 0) + '</td>' +
        '<td>' + (s.activo ? badge('Activo', 'success') : badge('Inactivo', 'danger')) + '</td>' +
        '<td><button class="btn small" data-edit-sld="' + s.id + '">✏️</button> <button class="btn small danger" data-del-sld="' + s.id + '">🗑️</button></td>';
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-edit-sld]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = slidesData.find(x => x.id === btn.dataset.editSld);
        if (s) openSlideModal(s);
      });
    });
    tbody.querySelectorAll('[data-del-sld]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta imagen del slider?')) return;
        await api('/api/admin/slider/' + btn.dataset.delSld, 'DELETE');
        loadSlider();
      });
    });
  }

  function openSlideModal(s) {
    document.getElementById('slideModalTitle').textContent = s ? 'Editar imagen' : 'Nueva imagen';
    document.getElementById('sld-id').value = s ? s.id : '';
    document.getElementById('sld-imagenUrl').value = s ? s.imagenUrl : '';
    document.getElementById('sld-titulo').value = s ? (s.titulo || '') : '';
    document.getElementById('sld-subtitulo').value = s ? (s.subtitulo || '') : '';
    document.getElementById('sld-linkUrl').value = s ? (s.linkUrl || '') : '';
    document.getElementById('sld-orden').value = s ? (s.orden || 0) : 0;
    document.getElementById('sld-activo').checked = s ? !!s.activo : true;
    document.getElementById('slideMsg').textContent = '';
    // Preview
    const url = s ? s.imagenUrl : '';
    if (url) {
      document.getElementById('sld-preview-img').src = url;
      document.getElementById('sld-preview-box').style.display = 'block';
    } else {
      document.getElementById('sld-preview-box').style.display = 'none';
    }
    document.getElementById('slideModal').classList.add('open');
  }

  // Live preview when URL changes
  document.getElementById('sld-imagenUrl').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      document.getElementById('sld-preview-img').src = url;
      document.getElementById('sld-preview-box').style.display = 'block';
    } else {
      document.getElementById('sld-preview-box').style.display = 'none';
    }
  });

  document.getElementById('btnAddSlide').addEventListener('click', () => openSlideModal(null));
  document.getElementById('slideForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('sld-id').value;
    const body = {
      imagenUrl: document.getElementById('sld-imagenUrl').value.trim(),
      titulo: document.getElementById('sld-titulo').value.trim(),
      subtitulo: document.getElementById('sld-subtitulo').value.trim(),
      linkUrl: document.getElementById('sld-linkUrl').value.trim(),
      orden: Number(document.getElementById('sld-orden').value) || 0,
      activo: document.getElementById('sld-activo').checked
    };
    const data = await api('/api/admin/slider' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body);
    if (data.ok || data.id) { document.getElementById('slideModal').classList.remove('open'); loadSlider(); }
    else { document.getElementById('slideMsg').textContent = data.error; document.getElementById('slideMsg').className = 'form-msg error'; }
  });

  /* ══════════════════════════════════════════
     CANJES MOCKA POINTS
     ══════════════════════════════════════════ */
  async function loadCanjes() {
    const data = await api('/api/admin/canjes');
    const canjes = data.canjes || [];
    const tbody = document.querySelector('#canjesTable tbody');
    tbody.innerHTML = '';

    // Stats
    const pending = canjes.filter(c => c.estado === 'pendiente').length;
    const delivered = canjes.filter(c => c.estado === 'entregado').length;
    const cancelled = canjes.filter(c => c.estado === 'cancelado').length;
    const statsEl = document.getElementById('canjesStats');
    statsEl.innerHTML =
      '<div class="stat-card" style="flex:1;padding:1rem;border-radius:12px;background:#fff8e1;border:1px solid #ffe082;text-align:center;min-width:140px"><div style="font-size:1.75rem;font-weight:700;color:#f57f17">' + pending + '</div><div style="font-size:.85rem;color:#666">Pendientes</div></div>' +
      '<div class="stat-card" style="flex:1;padding:1rem;border-radius:12px;background:#e8f5e9;border:1px solid #a5d6a7;text-align:center;min-width:140px"><div style="font-size:1.75rem;font-weight:700;color:#2e7d32">' + delivered + '</div><div style="font-size:.85rem;color:#666">Entregados</div></div>' +
      '<div class="stat-card" style="flex:1;padding:1rem;border-radius:12px;background:#fbe9e7;border:1px solid #ef9a9a;text-align:center;min-width:140px"><div style="font-size:1.75rem;font-weight:700;color:#c62828">' + cancelled + '</div><div style="font-size:.85rem;color:#666">Cancelados</div></div>' +
      '<div class="stat-card" style="flex:1;padding:1rem;border-radius:12px;background:#e3f2fd;border:1px solid #90caf9;text-align:center;min-width:140px"><div style="font-size:1.75rem;font-weight:700;color:#1565c0">' + canjes.length + '</div><div style="font-size:.85rem;color:#666">Total canjes</div></div>';

    if (!canjes.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay canjes registrados</td></tr>';
      return;
    }

    canjes.forEach(c => {
      const tr = document.createElement('tr');
      const fDate = d => d ? new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      const estadoBadge = c.estado === 'pendiente' ? badge('Pendiente', 'warning')
        : c.estado === 'entregado' ? badge('Entregado', 'success')
        : badge('Cancelado', 'danger');

      let actions = '';
      if (c.estado === 'pendiente') {
        actions = '<button class="btn small" data-canje-deliver="' + c.id + '" title="Marcar entregado">✅</button> ' +
                  '<button class="btn small danger" data-canje-cancel="' + c.id + '" title="Cancelar">❌</button>';
      }

      tr.innerHTML =
        '<td>' + esc(c.usuario) + '<br><small>' + esc(c.correo) + '</small></td>' +
        '<td>' + esc(c.producto) + '</td>' +
        '<td><strong>' + c.costoPoints + '</strong> pts</td>' +
        '<td>' + estadoBadge + '</td>' +
        '<td>' + fDate(c.creadoEn) + '</td>' +
        '<td>' + fDate(c.entregadoEn) + '</td>' +
        '<td>' + actions + '</td>';
      tbody.appendChild(tr);
    });

    // Event listeners
    tbody.querySelectorAll('[data-canje-deliver]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Marcar este canje como entregado?')) return;
        await api('/api/admin/canjes/' + btn.dataset.canjeDeliver, 'PATCH', { estado: 'entregado' });
        loadCanjes();
      });
    });
    tbody.querySelectorAll('[data-canje-cancel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Cancelar este canje? Se devolverán los puntos al usuario.')) return;
        await api('/api/admin/canjes/' + btn.dataset.canjeCancel, 'PATCH', { estado: 'cancelado' });
        loadCanjes();
      });
    });
  }

  /* ══════════════════════════════════════════
     LOADER MAP & INIT
     ══════════════════════════════════════════ */
  const loaders = {
    dashboard: loadDashboard,
    orders: loadOrders,
    products: loadProducts,
    categories: loadCategories,
    users: loadUsers,
    sectors: loadSectors,
    coupons: loadCoupons,
    ingredients: loadIngredients,
    slider: loadSlider,
    canjes: loadCanjes
  };

  /* ══════════════════════════════════════════
     ADMIN NOTIFICATIONS — New order alerts
     ══════════════════════════════════════════ */
  let knownOrderIds = new Set();
  let firstPoll = true;

  // Notification sound using Web Audio API
  function playNotifSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Tone 1
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = 'sine';
      o1.frequency.value = 880;
      g1.gain.setValueAtTime(0.3, ctx.currentTime);
      g1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      o1.connect(g1); g1.connect(ctx.destination);
      o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.3);
      // Tone 2
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = 1175;
      g2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
      g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      o2.connect(g2); g2.connect(ctx.destination);
      o2.start(ctx.currentTime + 0.15); o2.stop(ctx.currentTime + 0.5);
      // Tone 3
      const o3 = ctx.createOscillator();
      const g3 = ctx.createGain();
      o3.type = 'sine';
      o3.frequency.value = 1320;
      g3.gain.setValueAtTime(0.3, ctx.currentTime + 0.3);
      g3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
      o3.connect(g3); g3.connect(ctx.destination);
      o3.start(ctx.currentTime + 0.3); o3.stop(ctx.currentTime + 0.7);
    } catch (e) { /* Audio API not supported */ }
  }

  // Toast container
  const toastContainer = document.createElement('div');
  toastContainer.id = 'adminToasts';
  toastContainer.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem;pointer-events:none';
  document.body.appendChild(toastContainer);

  function showOrderToast(pedido) {
    var tipoE = (pedido.tipoEntrega || '').toLowerCase();
    var esRetiro = tipoE.indexOf('recogida') >= 0 || tipoE.indexOf('retiro') >= 0;
    var entregaIcon = esRetiro ? '🏪' : '🚚';
    var entregaText = esRetiro ? 'Retiro en tienda' : 'Despacho';

    const toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:1rem 1.2rem;min-width:320px;max-width:400px;display:flex;gap:.75rem;align-items:flex-start;animation:slideInToast .4s ease;border-left:4px solid #6b5bff;cursor:pointer;transition:opacity .3s';
    toast.innerHTML =
      '<div style="font-size:1.8rem;line-height:1">🛎️</div>' +
      '<div style="flex:1">' +
        '<div style="font-weight:700;color:#222;font-size:.95rem">¡Nuevo pedido!</div>' +
        '<div style="color:#555;font-size:.85rem;margin-top:2px"><strong>' + esc(pedido.numeroPedido) + '</strong> — ' + esc(pedido.nombreContacto) + '</div>' +
        '<div style="margin-top:4px;display:flex;gap:.5rem;align-items:center;font-size:.82rem">' +
          '<span style="color:#6b5bff;font-weight:700">' + fmt(pedido.total) + '</span>' +
          '<span style="color:#888">' + entregaIcon + ' ' + entregaText + '</span>' +
        '</div>' +
      '</div>' +
      '<button style="background:none;border:none;color:#aaa;cursor:pointer;font-size:1.1rem;padding:0 0 0 4px" onclick="this.parentElement.remove()">✕</button>';

    toast.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      // Navigate to orders section
      const ordersNav = document.querySelector('[data-section="orders"]');
      if (ordersNav) ordersNav.click();
      toast.remove();
    });

    toastContainer.appendChild(toast);
    // Auto-remove after 10s
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 10000);
  }

  async function pollNewOrders() {
    try {
      const data = await api('/api/admin/pedidos');
      const pedidos = data.pedidos || [];
      if (firstPoll) {
        // First load: just memorize IDs, no alerts
        pedidos.forEach(p => knownOrderIds.add(p.id));
        firstPoll = false;
        // Update counter badge
        updateOrdersBadge(pedidos);
        return;
      }

      const newOrders = pedidos.filter(p => !knownOrderIds.has(p.id));
      if (newOrders.length > 0) {
        playNotifSound();
        newOrders.forEach(p => {
          knownOrderIds.add(p.id);
          showOrderToast(p);
        });
        // If currently viewing orders or dashboard, reload
        const activeSection = document.querySelector('.section.active');
        if (activeSection && (activeSection.id === 'sec-orders' || activeSection.id === 'sec-dashboard')) {
          loaders[activeSection.id.replace('sec-', '')]();
        }
      }
      updateOrdersBadge(pedidos);
    } catch (e) { /* ignore polling errors */ }
  }

  // Badge on "Pedidos" nav item for pending orders count
  function updateOrdersBadge(pedidos) {
    const pendientes = pedidos.filter(p => p.estado === 'Pendiente').length;
    const navBtn = document.querySelector('[data-section="orders"]');
    if (!navBtn) return;
    let badge = navBtn.querySelector('.nav-badge');
    if (pendientes > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        navBtn.appendChild(badge);
      }
      badge.textContent = pendientes;
    } else if (badge) {
      badge.remove();
    }
  }

  // Poll every 15 seconds
  pollNewOrders();
  setInterval(pollNewOrders, 15000);

  // Load dashboard on init
  loadDashboard();
})();

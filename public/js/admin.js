// public/admin.js — Panel de administración completo
(async function () {
  const ui = window.uiDialog;
  const uiAlert = async (msg, title) => { if (ui) return ui.alert(msg, title); };
  const uiConfirm = async (msg, title) => { if (ui) return ui.confirm(msg, title); return true; };
  const uiPrompt = async (msg, def, title) => { if (ui) return ui.prompt(msg, def, title); return null; };

  /* ── Auth check ── */
  const authRes = await fetch('/api/auth/me');
  const authData = await authRes.json();
  if (!authData.user) { window.location.href = '/login.html'; return; }

  // Check admin role
  try {
    const dashRes = await fetch('/api/admin/dashboard');
    if (dashRes.status === 403 || dashRes.status === 401) {
      await uiAlert('Acceso denegado: No tienes permisos de administrador', 'Acceso denegado');
      window.location.href = '/';
      return;
    }
  } catch (e) { window.location.href = '/'; return; }

  document.getElementById('adminName').textContent = authData.user.nombre || 'Admin';
  document.getElementById('adminAvatar').textContent = (authData.user.nombre || 'A')[0].toUpperCase();

  /* ══════════════════════════════════════════
     NAVIGATION
     ══════════════════════════════════════════ */
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-section]');
  const navGroupToggles = document.querySelectorAll('.nav-group-toggle');
  const sections = document.querySelectorAll('.section');
  const sectionTitle = document.getElementById('sectionTitle');
  const sidebar = document.getElementById('sidebar');
  let pendingMetodoPagoResolver = null;
  let cajaAbierta = false;

  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section;
      if (!sec) return;
      navItems.forEach(n => n.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const targetSection = document.getElementById('sec-' + sec);
      if (!targetSection) return;
      targetSection.classList.add('active');
      sectionTitle.textContent = btn.textContent.trim();
      sidebar.classList.remove('open');
      // Load data
      loaders[sec] && loaders[sec]();
    });
  });

  navGroupToggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupId = btn.dataset.targetGroup;
      if (!groupId) return;
      const groupEl = document.querySelector('.nav-group[data-group="' + groupId + '"]');
      if (!groupEl) return;
      groupEl.classList.toggle('open');
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
      if (modalId === 'metodoPagoModal') {
        resolveMetodoPagoSelection(null);
      }
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
        if (m.id === 'metodoPagoModal') {
          resolveMetodoPagoSelection(null);
        }
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
  const escapeHtml = esc; // alias
  function fmt(n) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(n || 0)); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function badge(text, type) { return '<span class="badge badge-' + type + '">' + esc(text) + '</span>'; }
  function showMsg(el, msg, ok) {
    el.textContent = msg;
    el.style.color = ok ? '#22c55e' : '#e74c3c';
    setTimeout(() => el.textContent = '', 3000);
  }

  function statusBadge(estado) {
    const map = {
      'Pendiente': 'warning',
      'En Preparación': 'info',
      'Listo para Retiro': 'primary',
      'Listo para retirar': 'primary',
      'En Camino': 'primary',
      'Entregado': 'success',
      'Cancelado': 'danger'
    };
    return badge(estado || 'Sin estado', map[estado] || 'default');
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
      statCard('/assets/icons/usuariosIcon.png', 'Usuarios', s.totalUsers, 'purple') +
      statCard('/assets/icons/productosIcon.png', 'Productos', s.totalProducts, 'blue') +
      statCard('/assets/icons/pedidosIcon.png', 'Pedidos del dia', s.totalOrders, 'orange') +
      statCard('/assets/icons/ingresosIcon.png', 'Ingresos del dia', fmt(s.totalRevenue), 'green');

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

    // Cargar configuración del local
    loadConfiguracionLocal();
    initCajaControls();
    await renderCajaStatus();
  }

  // ═══ CONFIGURACIÓN DEL LOCAL (HORARIOS) ═══
  async function loadConfiguracionLocal() {
    try {
      const data = await api('/api/admin/configuracion-local');
      
      // Actualizar inputs de horario
      document.getElementById('horaApertura').value = data.horaApertura || '08:00';
      document.getElementById('horaCierre').value = data.horaCierre || '20:00';
      
      // Actualizar badge de estado
      const badgeAbierto = document.getElementById('badgeAbierto');
      const badgeCerrado = document.getElementById('badgeCerrado');
      
      if (data.abierto) {
        badgeAbierto.style.display = 'inline-block';
        badgeCerrado.style.display = 'none';
      } else {
        badgeAbierto.style.display = 'none';
        badgeCerrado.style.display = 'inline-block';
      }
      
      // Info de horario
      let info = 'Horario: ' + data.horaApertura + ' - ' + data.horaCierre;
      if (data.forzarEstado) {
        info += ' (Estado manual activo)';
      } else {
        info += ' (Automático según horario)';
      }
      document.getElementById('horarioInfo').textContent = info;
    } catch (e) {
      console.error('Error cargando configuración:', e);
    }
  }

  document.getElementById('btnAbrirLocal').addEventListener('click', async () => {
    if (!(await uiConfirm('¿Abrir el local ahora?', 'Confirmar apertura'))) return;
    await api('/api/admin/configuracion-local/toggle', 'POST', { abierto: true });
    loadConfiguracionLocal();
  });

  document.getElementById('btnCerrarLocal').addEventListener('click', async () => {
    const mensaje = await uiPrompt('¿Cerrar el local? Puedes agregar un mensaje opcional (ej: "Volvemos pronto"):', '', 'Cerrar local');
    if (mensaje === null) return;
    await api('/api/admin/configuracion-local/toggle', 'POST', { abierto: false, mensaje: mensaje || null });
    loadConfiguracionLocal();
  });

  document.getElementById('btnGuardarHorario').addEventListener('click', async () => {
    const horaApertura = document.getElementById('horaApertura').value;
    const horaCierre = document.getElementById('horaCierre').value;
    const config = await api('/api/admin/configuracion-local');
    await api('/api/admin/configuracion-local', 'PUT', {
      horaApertura,
      horaCierre,
      abierto: config.abierto,
      forzarEstado: config.forzarEstado,
      mensaje: config.mensaje
    });
    await uiAlert('Horario guardado correctamente.', 'Listo');
    loadConfiguracionLocal();
  });

  document.getElementById('btnUsarHorario').addEventListener('click', async () => {
    if (!(await uiConfirm('¿Usar el horario automático? El local se abrirá/cerrará según el horario configurado.', 'Confirmar horario automático'))) return;
    const config = await api('/api/admin/configuracion-local');
    await api('/api/admin/configuracion-local', 'PUT', {
      horaApertura: config.horaApertura,
      horaCierre: config.horaCierre,
      abierto: config.abierto,
      forzarEstado: false,
      mensaje: null
    });
    loadConfiguracionLocal();
  });

  function statCard(icon, label, value, color) {
    return '<div class="stat-card stat-' + color + '"><div class="stat-icon"><img src="' + esc(icon) + '" class="admin-icon" alt=""></div><div class="stat-info"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div></div>';
  }

  /* ══════════════════════════════════════════
     PEDIDOS
     ══════════════════════════════════════════ */
  let estados = [];
  let metodosPago = [];
  async function loadEstados() {
    if (estados.length > 0) return;
    const data = await api('/api/admin/estados');
    estados = data.estados || [];
  }

  async function loadMetodosPago() {
    if (metodosPago.length > 0) return;
    const data = await api('/api/admin/metodos-pago');
    metodosPago = data.metodosPago || [];
  }

  function resolveMetodoPagoSelection(selection) {
    if (!pendingMetodoPagoResolver) return;
    const resolver = pendingMetodoPagoResolver;
    pendingMetodoPagoResolver = null;
    resolver(selection || null);
  }

  async function selectMetodoPagoEntrega(esRetiro = false) {
    if (esRetiro && !cajaAbierta) {
      await uiAlert('No se puede cambiar el método de pago: la caja está cerrada.\nLos pedidos en local se pagan al tiro, por lo que necesitas tener la caja abierta.', 'Caja cerrada');
      return null;
    }
    await loadMetodosPago();
    if (!metodosPago.length) {
      await uiAlert('No hay métodos de pago configurados.', 'Métodos de pago');
      return null;
    }

    const modal = document.getElementById('metodoPagoModal');
    const optionsBox = document.getElementById('metodoPagoOptions');
    const confirmBtn = document.getElementById('confirmMetodoPagoBtn');
    if (!modal || !optionsBox || !confirmBtn) {
      await uiAlert('No se pudo abrir el selector de método de pago.', 'Error');
      return null;
    }

    optionsBox.innerHTML = metodosPago.map((m, idx) => {
      const checked = idx === 0 ? ' checked' : '';
      return '<label style="display:flex;align-items:center;gap:.55rem;padding:.65rem .75rem;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer">' +
        '<input type="radio" name="metodoPagoEntrega" value="' + esc(m.id) + '"' + checked + '>' +
        '<span style="font-weight:600">' + esc(m.nombre) + '</span>' +
      '</label>';
    }).join('');

    confirmBtn.onclick = () => {
      const selected = modal.querySelector('input[name="metodoPagoEntrega"]:checked');
      if (!selected) {
        uiAlert('Selecciona un método de pago para continuar.', 'Validación');
        return;
      }
      const metodo = metodosPago.find(m => m.id === selected.value) || null;
      modal.classList.remove('open');
      resolveMetodoPagoSelection(metodo);
    };

    modal.classList.add('open');
    return new Promise(resolve => {
      pendingMetodoPagoResolver = resolve;
    });
  }

  // Filtro de pedidos activo
  let orderFilter = 'proceso'; // 'proceso', 'pendientes', 'finalizados', 'todos'

  // Setup filter buttons
  document.querySelectorAll('#ordersFilter .filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ordersFilter .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      orderFilter = btn.dataset.filter;
      loadOrders();
    });
  });

  // Setup date filters
  document.getElementById('orderDateFrom').addEventListener('change', loadOrders);
  document.getElementById('orderDateTo').addEventListener('change', loadOrders);
  document.getElementById('orderDeliveryFilter').addEventListener('change', loadOrders);
  document.getElementById('orderSearch').addEventListener('input', loadOrders);
  document.getElementById('btnClearFilters').addEventListener('click', () => {
    document.getElementById('orderDateFrom').value = '';
    document.getElementById('orderDateTo').value = '';
    document.getElementById('orderDeliveryFilter').value = 'todos';
    document.getElementById('orderSearch').value = '';
    loadOrders();
  });

  async function loadOrders() {
    await loadEstados();
    const cajaData = await api('/api/admin/caja/estado');
    cajaAbierta = cajaData.abierta || false;
    const data = await api('/api/admin/pedidos');
    const tbody = document.querySelector('#ordersTable tbody');
    tbody.innerHTML = '';

    // Filtrar pedidos según el filtro activo
    const estadosEnProceso = ['Pendiente', 'En Preparación', 'Listo para Retiro', 'En Camino'];
    const estadosFinalizados = ['Entregado', 'Cancelado'];
    let pedidos = data.pedidos || [];

    if (orderFilter === 'proceso') {
      pedidos = pedidos.filter(p => estadosEnProceso.includes(p.estado));
    } else if (orderFilter === 'pendientes') {
      pedidos = pedidos.filter(p => String(p.estado || '').toLowerCase() === 'pendiente');
    } else if (orderFilter === 'finalizados') {
      pedidos = pedidos.filter(p => estadosFinalizados.includes(p.estado));
    }

    // Filtrar por fechas
    const dateFrom = document.getElementById('orderDateFrom').value;
    const dateTo = document.getElementById('orderDateTo').value;
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      pedidos = pedidos.filter(p => new Date(p.creadoEn) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      pedidos = pedidos.filter(p => new Date(p.creadoEn) <= to);
    }

    // Filtrar por tipo de entrega
    const deliveryFilter = document.getElementById('orderDeliveryFilter').value;
    if (deliveryFilter === 'retiro') {
      pedidos = pedidos.filter(p => {
        const tipoE = (p.tipoEntrega || '').toLowerCase();
        return tipoE.indexOf('recogida') >= 0 || tipoE.indexOf('retiro') >= 0;
      });
    } else if (deliveryFilter === 'despacho') {
      pedidos = pedidos.filter(p => {
        const tipoE = (p.tipoEntrega || '').toLowerCase();
        return tipoE.indexOf('recogida') < 0 && tipoE.indexOf('retiro') < 0;
      });
    }

    // Filtrar por búsqueda (número de pedido o nombre del cliente)
    const searchTerm = (document.getElementById('orderSearch').value || '').toLowerCase().trim();
    if (searchTerm) {
      pedidos = pedidos.filter(p => {
        const numPedido = (p.numeroPedido || '').toLowerCase();
        const nombreCliente = (p.nombreContacto || '').toLowerCase();
        const correoCliente = (p.correoContacto || '').toLowerCase();
        return numPedido.includes(searchTerm) || nombreCliente.includes(searchTerm) || correoCliente.includes(searchTerm);
      });
    }

    if (!pedidos.length) {
      let msg = 'No hay pedidos';
      if (orderFilter === 'proceso') msg += ' en proceso';
      else if (orderFilter === 'pendientes') msg += ' pendientes';
      else if (orderFilter === 'finalizados') msg += ' finalizados';
      if (dateFrom || dateTo) msg += ' en el rango de fechas seleccionado';
      tbody.innerHTML = '<tr><td colspan="7" class="empty">' + msg + '</td></tr>';
      return;
    }

    pedidos.forEach(p => {
      const tr = document.createElement('tr');
      var kind = getDeliveryKind(p.tipoEntrega);
      var esRetiro = kind === 'retiro';
      var entregaBadge = esRetiro
        ? '<span class="badge badge-info">🏪 Retiro en tienda</span>'
        : '<span class="badge badge-warning">🚚 Despacho</span>';

      // Filtrar estados según tipo de entrega
      var estadosFiltrados = estados.filter(e => isEstadoAllowedForDelivery(e.nombre, p.tipoEntrega));

      tr.innerHTML =
        '<td><strong>' + esc(p.numeroPedido) + '</strong></td>' +
        '<td>' + esc(p.nombreContacto) + '<br><small>' + esc(p.correoContacto) + '</small></td>' +
        '<td>' + fmt(p.total) + '</td>' +
        '<td>' + entregaBadge + '</td>' +
        '<td>' + statusBadge(p.estado) + '</td>' +
        '<td>' + fmtDate(p.creadoEn) + '</td>' +
        '<td><button class="btn small" data-view-order="' + p.id + '">👁️</button> ' +
          '<select class="status-select" data-order-status="' + p.id + '" data-has-metodo-pago="' + esc(p.metodoPago || '') + '" data-delivery-type="' + esc(p.tipoEntrega || '') + '">' +
            estadosFiltrados.map(e => '<option value="' + e.id + '"' + (e.id === p.estadoId ? ' selected' : '') + '>' + e.nombre + '</option>').join('') +
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
        const tipoEntrega = (sel.dataset.deliveryType || '').toLowerCase();
        const esRetiro = tipoEntrega.indexOf('recogida') >= 0 || tipoEntrega.indexOf('retiro') >= 0;
        
        if (selectedEstado && selectedEstado.nombre === 'Cancelado') {
          // Show cancel reason modal
          pendingCancelOrderId = sel.dataset.orderStatus;
          pendingCancelEstadoId = sel.value;
          pendingCancelSelect = sel;
          document.getElementById('cancelReason').value = '';
          document.getElementById('cancelModal').classList.add('open');
        } else if (selectedEstado && selectedEstado.nombre === 'Entregado') {
          if (esRetiro && !cajaAbierta) {
            await uiAlert('No se puede marcar como Entregado: la caja está cerrada.\nLos pedidos en local se pagan al tiro, por lo que necesitas tener la caja abierta.', 'Caja cerrada');
            loadOrders();
            return;
          }
          const yaTieneMetodo = (sel.dataset.hasMetodoPago || '').trim().length > 0;
          if (yaTieneMetodo) {
            await api('/api/admin/pedidos/' + sel.dataset.orderStatus + '/estado', 'PATCH', {
              estadoId: sel.value
            });
          } else {
            const metodo = await selectMetodoPagoEntrega(esRetiro);
            if (!metodo) {
              loadOrders();
              return;
            }
            await api('/api/admin/pedidos/' + sel.dataset.orderStatus + '/estado', 'PATCH', {
              estadoId: sel.value,
              metodoPagoId: metodo.id
            });
          }
          loadOrders();
          // Actualizar display de caja (el dinero se ha entregado y se suma a la caja)
          await renderCajaStatus();
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

    function parseItemNotas(rawNotas) {
      const raw = String(rawNotas || '');
      if (!raw.trim()) return { notaCliente: '', ingredientesQuitados: [] };

      const tokens = raw
        .split('|')
        .map(t => t.trim())
        .filter(Boolean);

      const notaClienteParts = [];
      const ingredientes = [];

      tokens.forEach((token) => {
        const low = token.toLowerCase();
        if (low.startsWith('sin:')) {
          const vals = token.slice(4).split(',').map(s => s.trim()).filter(Boolean);
          vals.forEach(v => ingredientes.push(v));
          return;
        }
        if (low.includes('[venta local') || low.includes('pago:')) {
          return;
        }
        notaClienteParts.push(token);
      });

      const uniqIngredientes = Array.from(new Set(ingredientes));
      return {
        notaCliente: notaClienteParts.join(' | '),
        ingredientesQuitados: uniqIngredientes
      };
    }

    let html = '<div class="order-detail">' +
      '<div class="order-detail-grid">' +
        '<div><strong>Pedido:</strong> ' + esc(p.numeroPedido) + '</div>' +
        '<div><strong>Estado:</strong> ' + statusBadge(p.estado) + '</div>' +
        '<div><strong>Cliente:</strong> ' + esc(p.nombreContacto) + '</div>' +
        '<div><strong>Correo:</strong> ' + esc(p.correoContacto) + '</div>' +
        '<div><strong>Teléfono:</strong> ' + esc(p.telefonoContacto) + '</div>' +
        '<div><strong>Entrega:</strong> ' + esc(p.tipoEntrega) + '</div>' +
        '<div><strong>Método de pago:</strong> ' + esc(p.metodoPago || '—') + '</div>' +
        (p.calle ? '<div><strong>Dirección:</strong> ' + esc(p.calle) + ' ' + esc(p.numeroCasa) + ', ' + esc(p.sector) + '</div>' : '') +
        '<div><strong>Fecha:</strong> ' + fmtDate(p.creadoEn) + '</div>' +
      '</div>' +
      '<h4>Items</h4>' +
      '<table class="admin-table compact"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio U.</th><th>Total</th><th>Notas</th></tr></thead><tbody>';
    (data.items || []).forEach(i => {
      const parsedNotas = parseItemNotas(i.notasItem);
      const notaCliente = parsedNotas.notaCliente ? esc(parsedNotas.notaCliente) : '—';
      const ingredientesTxt = parsedNotas.ingredientesQuitados.length
        ? esc(parsedNotas.ingredientesQuitados.join(', '))
        : '—';

      const notasHtml =
        '<div style="display:flex;flex-direction:column;gap:.25rem">' +
          '<div><strong>Nota cliente:</strong> ' + notaCliente + '</div>' +
          '<div><strong>Ingredientes quitados:</strong> ' + ingredientesTxt + '</div>' +
        '</div>';

      html += '<tr><td>' + esc(i.nombreProducto) + '</td><td>' + i.cantidad + '</td><td>' + fmt(i.precioUnitario) + '</td><td>' + fmt(i.totalLinea) + '</td><td>' + notasHtml + '</td></tr>';
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
    // Fill category select (only active categories)
    const sel = document.getElementById('prod-categoria');
    sel.innerHTML = '<option value="">Sin categoría</option>';
    categorias.filter(c => c.activo).forEach(c => { sel.innerHTML += '<option value="' + c.id + '">' + esc(c.nombre) + '</option>'; });

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
        if (!(await uiConfirm('¿Desactivar este producto?', 'Confirmar'))) return;
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
        '<td>' + (c.activo ? badge('Activa', 'success') : badge('Inactiva', 'danger')) + '</td>' +
        '<td><button class="btn small" data-toggle-cat="' + c.id + '" data-activo="' + (c.activo ? '1' : '0') + '">' + (c.activo ? '🔴' : '🟢') + '</button> ' +
        '<button class="btn small" data-edit-cat="' + c.id + '">✏️</button></td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-toggle-cat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newActivo = btn.dataset.activo === '0';
        const data = await api('/api/admin/categorias/' + btn.dataset.toggleCat + '/toggle', 'PATCH', { activo: newActivo });
        if (data.ok) loadCategories();
      });
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
    document.getElementById('cat-activo').checked = c ? !!c.activo : true;
    document.getElementById('categoryMsg').textContent = '';
    document.getElementById('categoryModal').classList.add('open');
  }

  document.getElementById('btnAddCategory').addEventListener('click', () => openCategoryModal(null));
  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cat-id').value;
    const body = { nombre: document.getElementById('cat-nombre').value, descripcion: document.getElementById('cat-descripcion').value, activo: document.getElementById('cat-activo').checked };
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
        '<td><button class="btn small" data-toggle-user="' + u.id + '" data-activo="' + (u.activo ? '1' : '0') + '">' + (u.activo ? '🔴' : '🟢') + '</button> ' +
        '<button class="btn small" data-edit-user="' + u.id + '">✏️</button></td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-toggle-user]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newActivo = btn.dataset.activo === '0';
        const data = await api('/api/admin/usuarios/' + btn.dataset.toggleUser + '/toggle', 'PATCH', { activo: newActivo });
        if (data.ok) loadUsers();
      });
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
        if (!(await uiConfirm('¿Desactivar este sector?', 'Confirmar'))) return;
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
        if (!(await uiConfirm('¿Desactivar este cupón?', 'Confirmar'))) return;
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
        if (!(await uiConfirm('¿Eliminar esta imagen del slider?', 'Confirmar'))) return;
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
        if (!(await uiConfirm('¿Marcar este canje como entregado?', 'Confirmar'))) return;
        await api('/api/admin/canjes/' + btn.dataset.canjeDeliver, 'PATCH', { estado: 'entregado' });
        loadCanjes();
      });
    });
    tbody.querySelectorAll('[data-canje-cancel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!(await uiConfirm('¿Cancelar este canje? Se devolverán los puntos al usuario.', 'Confirmar cancelación'))) return;
        await api('/api/admin/canjes/' + btn.dataset.canjeCancel, 'PATCH', { estado: 'cancelado' });
        loadCanjes();
      });
    });
  }

  /* ══════════════════════════════════════════
     INGRESOS DINÁMICOS
     ══════════════════════════════════════════ */
  let ingresosInitialized = false;

  function formatInputDateValue(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + 'T' + hh + ':' + mm;
  }

  function getGroupingLabel(grouping) {
    if (grouping === 'hour') return 'Por hora (cierre diario)';
    if (grouping === 'day') return 'Por día';
    if (grouping === 'week') return 'Por semana';
    if (grouping === 'month') return 'Por mes';
    return '—';
  }

  function renderIngresosSummary(report) {
    const box = document.getElementById('ingresosSummary');
    box.innerHTML =
      statCard('/assets/icons/ingresosIcon.png', 'Ingresos Reales', fmt(report.totals.totalIngresos), 'green') +
      statCard('/assets/icons/pedidosIcon.png', 'Pedidos', report.totals.totalPedidos, 'orange') +
      statCard('/assets/icons/trofeoIcon.png', 'MockaPoints Canjeados', report.totals.totalMockaPointsCanjeados, 'purple') +
      statCard('/assets/icons/trofeoIcon.png', 'Canjes Entregados', report.totals.totalCanjesMocka, 'blue');
  }

  function renderIngresosByMethod(report) {
    const el = document.getElementById('ingresosByMethod');
    if (!report.byPaymentMethod || report.byPaymentMethod.length === 0) {
      el.innerHTML = '<p class="empty">Sin transacciones para el rango seleccionado</p>';
      return;
    }

    let html = '<table class="admin-table compact"><thead><tr><th>Método</th><th>Pedidos</th><th>Ingresos</th></tr></thead><tbody>';
    report.byPaymentMethod.forEach((row) => {
      html += '<tr><td>' + esc(row.metodoPago) + '</td><td>' + row.totalPedidos + '</td><td>' + fmt(row.totalIngresos) + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function renderIngresosBreakdown(report) {
    const el = document.getElementById('ingresosBreakdown');
    if (!report.breakdown || report.breakdown.length === 0) {
      el.innerHTML = '<p class="empty">Sin datos para agrupar</p>';
      return;
    }

    let html = '<table class="admin-table compact"><thead><tr><th>Bloque</th><th>Pedidos</th><th>Canjes MP</th><th>Ingresos</th></tr></thead><tbody>';
    report.breakdown.forEach((row) => {
      html += '<tr><td>' + esc(row.bucket) + '</td><td>' + row.totalPedidos + '</td><td>' + row.mockaCanjes + '</td><td>' + fmt(row.totalIngresos) + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function renderIngresosDetail(report) {
    const el = document.getElementById('ingresosDetail');
    if (!report.transactions || report.transactions.length === 0) {
      el.innerHTML = '<p class="empty">No hay transacciones en el rango</p>';
      return;
    }

    let html = '<table class="admin-table"><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Método</th><th>Estado</th><th>Monto</th></tr></thead><tbody>';
    report.transactions.forEach((t) => {
      html += '<tr>' +
        '<td>' + esc(t.numeroPedido || '—') + '</td>' +
        '<td>' + fmtDate(t.fechaOperacion) + '</td>' +
        '<td>' + esc(t.cliente || 'Cliente') + '</td>' +
        '<td>' + esc(t.metodoPago || '—') + '</td>' +
        '<td>' + statusBadge(t.estado) + '</td>' +
        '<td>' + fmt(t.montoReal) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  let cajaEstadoCache = null;

  function toDateInputValue(dateLike) {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function syncCajaDateInput(estado) {
    const input = document.getElementById('cajaFechaCierre');
    if (!input) return;
    if (!input.value && estado && estado.defaultDate) input.value = estado.defaultDate;
  }

  async function fetchCajaEstado() {
    const data = await api('/api/admin/caja/estado');
    if (data && data.error) throw new Error(data.error);
    cajaEstadoCache = data || null;
    return cajaEstadoCache;
  }

  async function fetchCierresByFecha(fecha) {
    const qs = new URLSearchParams({ fecha });
    const data = await api('/api/admin/caja/cierres?' + qs.toString());
    if (data && data.error) throw new Error(data.error);
    return Array.isArray(data.cierres) ? data.cierres : [];
  }

  function buildCierrePrintableHtml(cierre) {
    const desglose = Array.isArray(cierre.desglosePago) ? cierre.desglosePago : [];
    const desgloseRow = desglose.length > 0
      ? '<h2 style="font-size:16px;margin:20px 0 8px;color:#111">Dinero por Método de Pago</h2>' +
        '<table>' +
        '<tr style="background:#f3f4f6"><td style="font-weight:600">Método</td><td style="text-align:center;font-weight:600">Cantidad</td><td style="text-align:right;font-weight:600">Dinero</td></tr>' +
        desglose.map(d => 
          '<tr><td>' + esc(d.metodoPago || 'sin_metodo') + '</td><td style="text-align:center">' + (d.totalPedidos || 0) + '</td><td style="text-align:right">' + fmt(Number(d.totalIngresos || 0)) + '</td></tr>'
        ).join('') +
        '</table>'
      : '';
    
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cierre de Caja</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:18px;color:#111}h1{font-size:20px;margin:0 0 12px}h2{font-size:16px;margin:16px 0 8px}table{border-collapse:collapse;width:100%;max-width:560px}td{padding:8px;border-bottom:1px solid #e5e7eb}td:first-child{color:#4b5563;width:45%}td:last-child{text-align:right}.total td{font-weight:700;border-top:2px solid #111}small{display:block;margin-top:14px;color:#6b7280}</style>' +
      '</head><body>' +
      '<h1>Cierre de Caja</h1>' +
      '<table>' +
      '<tr><td>Fecha apertura</td><td>' + fmtDate(cierre.aperturaAt) + '</td></tr>' +
      '<tr><td>Fecha cierre</td><td>' + fmtDate(cierre.cierreAt) + '</td></tr>' +
      '<tr><td>Monto apertura</td><td>' + fmt(cierre.montoApertura) + '</td></tr>' +
      '<tr><td>Ingresos del turno</td><td>' + fmt(cierre.ingresosTurno) + '</td></tr>' +
      '<tr class="total"><td>Total cierre</td><td>' + fmt(cierre.montoCierre) + '</td></tr>' +
      '</table>' +
      desgloseRow +
      '<small>Dulce Mocka — Reimpresión de cierre</small>' +
      '</body></html>';
  }

  async function reimprimirCierre() {
    const input = document.getElementById('cajaFechaCierre');
    const dateValue = input ? input.value : '';
    if (!dateValue) {
      await uiAlert('Selecciona una fecha de cierre.', 'Reimprimir cierre');
      return;
    }

    let cierres = [];
    try {
      cierres = await fetchCierresByFecha(dateValue);
    } catch (e) {
      await uiAlert('No se pudo consultar cierres: ' + (e.message || 'error desconocido'), 'Reimprimir cierre');
      return;
    }

    if (!cierres.length) {
      await uiAlert('No hay un cierre registrado para la fecha seleccionada.', 'Reimprimir cierre');
      return;
    }

    let cierre = cierres[0];
    if (cierres.length > 1) {
      const opciones = cierres.map((c, idx) => {
        return (idx + 1) + '. ' +
          new Date(c.cierreAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) +
          ' — ' + fmt(c.montoCierre);
      }).join('\n');

      const seleccion = await uiPrompt(
        'Hay ' + cierres.length + ' cierres ese día.\nSelecciona el número que deseas reimprimir:\n\n' + opciones,
        '1',
        'Seleccionar cierre'
      );

      if (seleccion === null) return;
      const idx = Number(String(seleccion).trim()) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= cierres.length) {
        await uiAlert('Selección inválida. Debes ingresar un número de la lista.', 'Reimprimir cierre');
        return;
      }
      cierre = cierres[idx];
    }

    const w = window.open('', '_blank', 'width=720,height=760');
    if (!w) {
      await uiAlert('No se pudo abrir la ventana de impresión. Revisa si el navegador bloqueó popups.', 'Impresión');
      return;
    }

    w.document.open();
    w.document.write(buildCierrePrintableHtml(cierre));
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 220);
  }

  async function renderCajaStatus() {
    const estadoEl = document.getElementById('cajaEstado');
    const aperturaInfoEl = document.getElementById('cajaAperturaInfo');
    const aperturaMontoEl = document.getElementById('cajaMontoApertura');
    const ingresosTurnoEl = document.getElementById('cajaIngresosTurno');
    const cierreMontoEl = document.getElementById('cajaMontoCierre');

    if (!estadoEl || !aperturaInfoEl || !aperturaMontoEl || !ingresosTurnoEl || !cierreMontoEl) return;

    let state = null;
    try {
      state = await fetchCajaEstado();
    } catch (e) {
      estadoEl.textContent = 'Error cargando caja';
      estadoEl.style.color = '#ef4444';
      aperturaInfoEl.textContent = e.message || 'No se pudo obtener el estado';
      aperturaMontoEl.textContent = fmt(0);
      ingresosTurnoEl.textContent = fmt(0);
      cierreMontoEl.textContent = fmt(0);
      return;
    }

    syncCajaDateInput(state);

    if (!state.abierta || !state.aperturaAt) {
      estadoEl.textContent = 'Caja cerrada';
      estadoEl.style.color = '#6b7280';
      aperturaInfoEl.textContent = state.ultimoCierreAt
        ? 'Último cierre: ' + fmtDate(state.ultimoCierreAt)
        : 'Apertura: —';
      aperturaMontoEl.textContent = fmt(state.montoApertura || 0);
      ingresosTurnoEl.textContent = fmt(state.ingresosTurno || 0);
      cierreMontoEl.textContent = fmt(state.montoCierre || 0);
      return;
    }

    estadoEl.textContent = 'Caja abierta';
    estadoEl.style.color = '#16a34a';
    aperturaInfoEl.textContent = 'Apertura: ' + fmtDate(state.aperturaAt);
    aperturaMontoEl.textContent = fmt(state.montoApertura || 0);
    ingresosTurnoEl.textContent = fmt(state.ingresosTurno || 0);
    cierreMontoEl.textContent = fmt(state.montoCierre || 0);
  }

  async function abrirCaja() {
    const state = cajaEstadoCache || await fetchCajaEstado();
    if (state && state.abierta) {
      await uiAlert('La caja ya está abierta.', 'Caja');
      await renderCajaStatus();
      return;
    }

    const value = await uiPrompt('Ingresa el monto de apertura de caja:', String((state && state.montoApertura) || ''), 'Abrir caja');
    if (value === null) return;

    const monto = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(monto) || monto < 0) {
      await uiAlert('Ingresa un monto válido mayor o igual a 0.', 'Monto inválido');
      return;
    }

    const resp = await api('/api/admin/caja/abrir', 'POST', { montoApertura: monto });
    if (resp && resp.error) {
      await uiAlert(resp.error, 'Caja');
      return;
    }

    await renderCajaStatus();
    await uiAlert('Caja abierta correctamente con monto inicial de ' + fmt(monto) + '.', 'Caja abierta');
  }

  async function cerrarCaja() {
    const state = cajaEstadoCache || await fetchCajaEstado();
    if (!state || !state.abierta || !state.aperturaAt) {
      await uiAlert('La caja ya está cerrada.', 'Caja');
      await renderCajaStatus();
      return;
    }

    const montoApertura = Number(state.montoApertura || 0);
    const ingresosTurno = Number(state.ingresosTurno || 0);
    const montoCierre = Number(state.montoCierre || (montoApertura + ingresosTurno));
    const resumen =
      'Monto apertura: ' + fmt(montoApertura) + '\n' +
      'Ingresos del turno: ' + fmt(ingresosTurno) + '\n' +
      'Monto de cierre calculado: ' + fmt(montoCierre) + '\n\n' +
      '¿Deseas cerrar la caja ahora?';

    const ok = await uiConfirm(resumen, 'Cerrar caja');
    if (!ok) return;

    const resp = await api('/api/admin/caja/cerrar', 'POST');
    if (resp && resp.error) {
      await uiAlert(resp.error, 'Error de cierre');
      return;
    }

    await renderCajaStatus();
    const cierreMonto = resp && resp.cierre ? Number(resp.cierre.montoCierre || 0) : montoCierre;
    await uiAlert('Caja cerrada correctamente.\nMonto final: ' + fmt(cierreMonto), 'Caja cerrada');
  }

  function resetIngresosFilters() {
    const end = new Date();
    const start = new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000));
    document.getElementById('ingresosStart').value = formatInputDateValue(start);
    document.getElementById('ingresosEnd').value = formatInputDateValue(end);
  }

  async function fetchAndRenderIngresos() {
    const startInput = document.getElementById('ingresosStart').value;
    const endInput = document.getElementById('ingresosEnd').value;

    const qs = new URLSearchParams({
      startDate: startInput,
      endDate: endInput
    });

    const data = await api('/api/admin/ingresos?' + qs.toString());
    if (data.error) {
      await uiAlert(data.error, 'Reporte de ingresos');
      return;
    }

    document.getElementById('ingresosGroupInfo').textContent = 'Agrupación automática: ' + getGroupingLabel(data.grouping);
    renderIngresosSummary(data);
    renderIngresosByMethod(data);
    renderIngresosBreakdown(data);
    renderIngresosDetail(data);
  }

  let cajaControlsInitialized = false;

  function initCajaControls() {
    if (cajaControlsInitialized) return;
    cajaControlsInitialized = true;
    const abrirBtn = document.getElementById('cajaAbrirBtn');
    const cerrarBtn = document.getElementById('cajaCerrarBtn');
    const reimprimirBtn = document.getElementById('cajaReimprimirBtn');
    if (abrirBtn) abrirBtn.addEventListener('click', abrirCaja);
    if (cerrarBtn) cerrarBtn.addEventListener('click', cerrarCaja);
    if (reimprimirBtn) reimprimirBtn.addEventListener('click', reimprimirCierre);
  }

  function initIngresosControls() {
    if (ingresosInitialized) return;
    ingresosInitialized = true;

    resetIngresosFilters();

    document.getElementById('ingresosApplyBtn').addEventListener('click', fetchAndRenderIngresos);
    document.getElementById('ingresosClearBtn').addEventListener('click', async () => {
      resetIngresosFilters();
      await fetchAndRenderIngresos();
    });
    document.getElementById('ingresosExportBtn').addEventListener('click', () => {
      const startDate = document.getElementById('ingresosStart').value;
      const endDate = document.getElementById('ingresosEnd').value;
      const qs = new URLSearchParams({ startDate, endDate });
      window.open('/api/admin/ingresos/export?' + qs.toString(), '_blank');
    });
  }

  async function loadIngresos() {
    initIngresosControls();
    await fetchAndRenderIngresos();
  }

  /* ══════════════════════════════════════════
     VENTAS EN LOCAL
     ══════════════════════════════════════════ */
  let ventasInitialized = false;
  let ventasProductos = [];
  let ventasProductosFiltrados = [];
  let ventasSectores = [];
  let ventasCarrito = [];
  let ventaProductoActual = null;
  let ventaDespachoData = null;
  let ventaLocalAbierto = true;

  function ventaSubtotal() {
    return ventasCarrito.reduce((acc, it) => acc + ((Number(it.precio) || 0) * (Number(it.cantidad) || 1)), 0);
  }

  function ventaShipping() {
    const tipo = document.getElementById('ventaTipoEntrega')?.value || 'retiro';
    if (tipo !== 'despacho' || !ventaDespachoData) return 0;
    return Number(ventaDespachoData.costoEnvio || 0);
  }

  function renderVentasSummary() {
    const subtotal = ventaSubtotal();
    const shipping = ventaShipping();
    const total = subtotal + shipping;
    document.getElementById('ventaSubtotal').textContent = fmt(subtotal);
    document.getElementById('ventaTotal').textContent = fmt(total);

    const shippingRow = document.getElementById('ventaShippingRow');
    const shippingEl = document.getElementById('ventaShipping');
    if (shipping > 0) {
      shippingRow.style.display = '';
      shippingEl.textContent = fmt(shipping);
    } else {
      shippingRow.style.display = 'none';
    }
  }

  function renderVentasCarrito() {
    const box = document.getElementById('ventaCartItems');
    if (!ventasCarrito.length) {
      box.innerHTML =
        '<div class="ventas-empty-cart">' +
          '<span class="empty-icon"><img src="/assets/icons/pedidosIcon.png" class="admin-icon" alt=""></span>' +
          '<p>El carrito está vacío</p>' +
          '<small>Agrega productos desde la lista</small>' +
        '</div>';
      renderVentasSummary();
      return;
    }

    box.innerHTML = ventasCarrito.map((it, idx) => {
      const totalLinea = (Number(it.precio) || 0) * (Number(it.cantidad) || 1);
      const sinTxt = (it.ingredientesQuitados || []).length
        ? '<div class="ventas-cart-line">Sin: ' + esc((it.ingredientesQuitados || []).map(i => i.nombre).join(', ')) + '</div>'
        : '';
      const notasTxt = it.notas ? '<div class="ventas-cart-line">📝 ' + esc(it.notas) + '</div>' : '';

      return (
        '<div class="ventas-cart-item" data-cart-idx="' + idx + '">' +
          '<div class="ventas-cart-top">' +
            '<div>' +
              '<div class="ventas-cart-name">' + esc(it.nombre) + '</div>' +
              '<div class="ventas-cart-line">' + fmt(it.precio) + ' c/u</div>' +
              sinTxt + notasTxt +
            '</div>' +
            '<strong>' + fmt(totalLinea) + '</strong>' +
          '</div>' +
          '<div class="ventas-cart-actions">' +
            '<div class="ventas-cart-qty">' +
              '<button type="button" data-venta-qty="minus" data-idx="' + idx + '">−</button>' +
              '<span>' + (Number(it.cantidad) || 1) + '</span>' +
              '<button type="button" data-venta-qty="plus" data-idx="' + idx + '">+</button>' +
            '</div>' +
            '<button type="button" class="ventas-remove" data-venta-remove="' + idx + '">Quitar</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    renderVentasSummary();
  }

  function renderVentasProductos() {
    const list = document.getElementById('ventasProductosList');
    if (!ventasProductosFiltrados.length) {
      list.innerHTML = '<p class="empty">No hay productos para mostrar</p>';
      return;
    }

    list.innerHTML = ventasProductosFiltrados.map(p => {
      const img = p.imagen && /^https?:\/\//i.test(p.imagen)
        ? '<img src="' + esc(p.imagen) + '" alt="' + esc(p.nombre) + '">'
        : '<span>' + esc(p.emoji || '🧃') + '</span>';

      return (
        '<article class="ventas-prod-card" data-venta-product="' + p.id + '">' +
          '<div class="ventas-prod-img">' + img + '</div>' +
          '<div class="ventas-prod-name">' + esc(p.nombre) + '</div>' +
          '<div class="ventas-prod-desc">' + esc(p.descripcion || 'Sin descripción') + '</div>' +
          '<div class="ventas-prod-price">' + fmt(p.precio) + '</div>' +
        '</article>'
      );
    }).join('');
  }

  function updateVentaModalSubtotal() {
    if (!ventaProductoActual) return;
    const qty = Math.max(1, parseInt(document.getElementById('ventaCantidad').value, 10) || 1);
    document.getElementById('ventaCantidad').value = qty;
    document.getElementById('ventaModalSubtotal').textContent = fmt((Number(ventaProductoActual.precio) || 0) * qty);
  }

  function openVentaProductoModal(producto) {
    ventaProductoActual = producto;
    document.getElementById('ventaProductoNombre').textContent = producto.nombre;
    document.getElementById('ventaProductoDesc').textContent = producto.descripcion || 'Sin descripción';
    document.getElementById('ventaProductoPrecio').textContent = fmt(producto.precio);
    document.getElementById('ventaProductoNotas').value = '';
    document.getElementById('ventaCantidad').value = 1;

    const imgBox = document.getElementById('ventaProductoImg');
    if (producto.imagen && /^https?:\/\//i.test(producto.imagen)) {
      imgBox.innerHTML = '<img src="' + esc(producto.imagen) + '" alt="' + esc(producto.nombre) + '">';
    } else {
      imgBox.innerHTML = '<img src="/assets/icons/productosIcon.png" class="admin-icon" alt="">';
    }

    const section = document.getElementById('ventaIngredientesSection');
    const list = document.getElementById('ventaIngredientesList');
    const ingredientes = Array.isArray(producto.ingredientes) ? producto.ingredientes : [];
    if (!ingredientes.length) {
      section.style.display = 'none';
      list.innerHTML = '';
    } else {
      section.style.display = '';
      list.innerHTML = ingredientes.map(ing => {
        const checked = ing.incluidoPorDefecto ? 'checked' : '';
        const disable = ing.sePuedeQuitar ? '' : 'disabled';
        const hint = ing.sePuedeQuitar ? 'se puede quitar' : 'fijo';
        return (
          '<div class="venta-ing-item">' +
            '<label>' +
              '<input type="checkbox" class="venta-ing-check" data-ing-id="' + ing.ingredienteId + '" ' + checked + ' ' + disable + '>' +
              '<span>' + esc(ing.nombre) + '</span>' +
            '</label>' +
            '<small>' + hint + '</small>' +
          '</div>'
        );
      }).join('');
    }

    updateVentaModalSubtotal();
    document.getElementById('ventaProductoModal').classList.add('open');
  }

  function bindVentasEventsOnce() {
    if (ventasInitialized) return;
    ventasInitialized = true;

    document.getElementById('ventaSearchInput').addEventListener('input', (e) => {
      const term = (e.target.value || '').trim().toLowerCase();
      ventasProductosFiltrados = term
        ? ventasProductos.filter(p => (p.nombre || '').toLowerCase().includes(term) || (p.descripcion || '').toLowerCase().includes(term))
        : [...ventasProductos];
      renderVentasProductos();
    });

    document.getElementById('ventasProductosList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-venta-product]');
      if (!card) return;
      const p = ventasProductos.find(x => x.id === card.dataset.ventaProduct);
      if (p) openVentaProductoModal(p);
    });

    document.getElementById('ventaCartItems').addEventListener('click', (e) => {
      const rem = e.target.closest('[data-venta-remove]');
      if (rem) {
        const idx = Number(rem.dataset.ventaRemove);
        ventasCarrito.splice(idx, 1);
        renderVentasCarrito();
        return;
      }
      const qty = e.target.closest('[data-venta-qty]');
      if (!qty) return;
      const idx = Number(qty.dataset.idx);
      if (!ventasCarrito[idx]) return;
      const op = qty.dataset.ventaQty;
      let q = Number(ventasCarrito[idx].cantidad) || 1;
      q = op === 'minus' ? Math.max(1, q - 1) : q + 1;
      ventasCarrito[idx].cantidad = q;
      renderVentasCarrito();
    });

    document.getElementById('ventaClearBtn').addEventListener('click', () => {
      (async () => {
        if (!ventasCarrito.length) return;
        if (!(await uiConfirm('¿Vaciar carrito de venta?', 'Confirmar'))) return;
        ventasCarrito = [];
        renderVentasCarrito();
      })();
    });

    document.querySelectorAll('.ventas-delivery-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ventas-delivery-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('ventaTipoEntrega').value = btn.dataset.tipo;
        renderVentasSummary();
      });
    });

    document.getElementById('despachoSector').addEventListener('change', () => {
      const sectorId = document.getElementById('despachoSector').value;
      if (!sectorId) {
        document.getElementById('despachoCosto').textContent = 'Por definir';
        return;
      }
      const sector = ventasSectores.find(s => s.id === sectorId);
      document.getElementById('despachoCosto').textContent = fmt(sector ? Number(sector.precioEnvio || 0) : 0);
    });

    document.getElementById('despachoConfirmBtn').addEventListener('click', () => {
      const telefono = document.getElementById('despachoTelefono').value.trim();
      const direccion = document.getElementById('despachoDireccion').value.trim();
      const sectorId = document.getElementById('despachoSector').value;
      const referencia = document.getElementById('despachoReferencia').value.trim();

      if (!telefono || !direccion || !sectorId) {
        uiAlert('Completa teléfono, dirección y sector para despacho.', 'Campos incompletos');
        return;
      }

      const sector = ventasSectores.find(s => s.id === sectorId);
      ventaDespachoData = {
        telefono,
        direccion,
        sectorId,
        sectorNombre: sector ? sector.nombre : '',
        referencia,
        costoEnvio: sector ? Number(sector.precioEnvio || 0) : 0
      };
      document.getElementById('despachoModal').classList.remove('open');
      renderVentasSummary();
    });

    document.getElementById('ventaQtyMinus').addEventListener('click', () => {
      const input = document.getElementById('ventaCantidad');
      input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
      updateVentaModalSubtotal();
    });
    document.getElementById('ventaQtyPlus').addEventListener('click', () => {
      const input = document.getElementById('ventaCantidad');
      input.value = (parseInt(input.value, 10) || 1) + 1;
      updateVentaModalSubtotal();
    });
    document.getElementById('ventaCantidad').addEventListener('input', updateVentaModalSubtotal);

    document.getElementById('ventaProductoConfirmBtn').addEventListener('click', () => {
      if (!ventaProductoActual) return;
      const cantidad = Math.max(1, parseInt(document.getElementById('ventaCantidad').value, 10) || 1);
      const notas = document.getElementById('ventaProductoNotas').value.trim();

      const ingredientesQuitados = [];
      const checks = document.querySelectorAll('#ventaIngredientesList .venta-ing-check');
      checks.forEach(cb => {
        const ing = (ventaProductoActual.ingredientes || []).find(i => i.ingredienteId === cb.dataset.ingId);
        if (!ing) return;
        if (!cb.checked && ing.incluidoPorDefecto) {
          ingredientesQuitados.push({ id: ing.ingredienteId, nombre: ing.nombre });
        }
      });

      ventasCarrito.push({
        productoId: ventaProductoActual.id,
        nombre: ventaProductoActual.nombre,
        precio: Number(ventaProductoActual.precio) || 0,
        cantidad,
        notas,
        ingredientesQuitados
      });

      document.getElementById('ventaProductoModal').classList.remove('open');
      renderVentasCarrito();
    });

    document.getElementById('ventaCreateBtn').addEventListener('click', async () => {
      const msg = document.getElementById('ventaMsg');
      msg.textContent = '';
      msg.style.color = '#e74c3c';

      if (!ventaLocalAbierto) {
        msg.textContent = 'El local está cerrado. No se pueden registrar ventas en local.';
        return;
      }

      try {
        const cajaData = await api('/api/admin/caja/estado');
        cajaAbierta = !!(cajaData && cajaData.abierta);
      } catch (e) {
        msg.textContent = 'No se pudo validar el estado de caja. Intenta nuevamente.';
        return;
      }

      if (!cajaAbierta) {
        msg.textContent = 'La caja está cerrada. Debes abrir caja antes de finalizar una venta en local.';
        return;
      }

      if (!ventasCarrito.length) {
        msg.textContent = 'Agrega productos al carrito para finalizar la venta.';
        return;
      }

      const tipoEntrega = document.getElementById('ventaTipoEntrega').value || 'retiro';
      if (tipoEntrega === 'despacho' && !ventaDespachoData) {
        document.getElementById('despachoModal').classList.add('open');
        msg.textContent = 'Completa los datos de despacho para continuar.';
        return;
      }

      const clienteNombre = document.getElementById('ventaClienteNombre').value.trim() || 'Cliente en local';
      const metodoPago = document.getElementById('ventaMetodoPago').value;
      const subtotal = ventaSubtotal();
      const shipping = ventaShipping();

      const items = ventasCarrito.map(it => ({
        productoId: it.productoId,
        nombre: it.nombre,
        precio: Number(it.precio) || 0,
        cantidad: Number(it.cantidad) || 1,
        notas: it.notas || '',
        ingredientesQuitados: it.ingredientesQuitados || []
      }));

      msg.style.color = '#6b7280';
      msg.textContent = 'Procesando venta...';
      try {
        const data = await api('/api/admin/ventas', 'POST', {
          clienteNombre,
          tipoEntrega,
          metodoPago,
          despacho: tipoEntrega === 'despacho' ? ventaDespachoData : null,
          items,
          subtotal,
          total: subtotal + shipping
        });

        if (!data.ok || !data.pedido) {
          msg.style.color = '#e74c3c';
          msg.textContent = data.error || 'No se pudo crear la venta.';
          return;
        }

        msg.style.color = '#22c55e';
        msg.textContent = 'Venta creada: ' + data.pedido.numeroPedido;
        ventasCarrito = [];
        ventaDespachoData = null;
        document.getElementById('ventaClienteNombre').value = '';
        document.getElementById('ventaMetodoPago').value = 'efectivo';
        document.getElementById('despachoTelefono').value = '';
        document.getElementById('despachoDireccion').value = '';
        document.getElementById('despachoSector').value = '';
        document.getElementById('despachoReferencia').value = '';
        document.getElementById('despachoCosto').textContent = 'Por definir';
        document.getElementById('ventaTipoEntrega').value = 'retiro';
        document.querySelectorAll('.ventas-delivery-btn').forEach(b => b.classList.remove('active'));
        const retiroBtn = document.querySelector('.ventas-delivery-btn[data-tipo="retiro"]');
        if (retiroBtn) retiroBtn.classList.add('active');
        renderVentasCarrito();
      } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = 'Error de conexión al crear la venta.';
      }
    });
  }

  async function loadVentas() {
    bindVentasEventsOnce();

    const cfg = await api('/api/admin/configuracion-local');
    const cajaData = await api('/api/admin/caja/estado');
    const createBtn = document.getElementById('ventaCreateBtn');
    const msg = document.getElementById('ventaMsg');
    ventaLocalAbierto = !!(cfg && cfg.abierto);
    cajaAbierta = !!(cajaData && cajaData.abierta);
    if (createBtn) {
      createBtn.disabled = !ventaLocalAbierto || !cajaAbierta;
      createBtn.title = !ventaLocalAbierto
        ? 'Local cerrado'
        : (!cajaAbierta ? 'Caja cerrada' : '');
    }
    if (!ventaLocalAbierto) {
      msg.textContent = 'El local está cerrado. No se pueden registrar ventas en local.';
      msg.style.color = '#e74c3c';
    } else if (!cajaAbierta) {
      msg.textContent = 'La caja está cerrada. Debes abrir caja para registrar ventas en local.';
      msg.style.color = '#e74c3c';
    } else {
      msg.textContent = '';
    }

    const prodRes = await api('/api/admin/productos');
    ventasProductos = (prodRes.productos || []).filter(p => p.activo).map(p => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      precio: Number(p.precio) || 0,
      imagen: p.imagen || null,
      emoji: p.emoji || '🧃',
      ingredientes: p.ingredientes || []
    }));
    ventasProductosFiltrados = [...ventasProductos];
    renderVentasProductos();

    const sectorsRes = await api('/api/admin/sectores');
    ventasSectores = (sectorsRes.sectores || []).filter(s => s.activo !== 0).map(s => ({
      id: s.id,
      nombre: s.nombre,
      precioEnvio: Number(s.precioEnvio || 0)
    }));
    document.getElementById('despachoSector').innerHTML =
      '<option value="">-- Seleccionar sector --</option>' +
      ventasSectores.map(s => '<option value="' + s.id + '">' + esc(s.nombre) + ' (' + fmt(s.precioEnvio) + ')</option>').join('');

    renderVentasCarrito();
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
    canjes: loadCanjes,
    ingresos: loadIngresos,
    ventas: loadVentas
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

  /* ══════════════════════════════════════════
     NOTIFICACIONES
     ══════════════════════════════════════════ */
  const notifModalBackdrop = document.getElementById('notifModalBackdrop');
  const btnNotificaciones = document.getElementById('btnNotificaciones');
  const closeNotifModal = document.getElementById('closeNotifModal');
  const notifForm = document.getElementById('notifForm');
  const notifMsg = document.getElementById('notifMsg');
  const notifList = document.getElementById('notifList');

  btnNotificaciones.addEventListener('click', () => {
    notifModalBackdrop.style.display = 'flex';
    loadNotificaciones();
  });

  closeNotifModal.addEventListener('click', () => {
    notifModalBackdrop.style.display = 'none';
  });

  notifModalBackdrop.addEventListener('click', (e) => {
    if (e.target === notifModalBackdrop) {
      notifModalBackdrop.style.display = 'none';
    }
  });

  async function loadNotificaciones() {
    try {
      const res = await fetch('/api/admin/notificaciones');
      const notifs = await res.json();
      if (!notifs.length) {
        notifList.innerHTML = '<p style="color:#999;font-size:.85rem">No hay notificaciones enviadas</p>';
        return;
      }
      notifList.innerHTML = notifs.map(n => `
        <div class="notif-item" style="padding:.75rem;border:1px solid #eee;border-radius:8px;margin-bottom:.5rem;background:${n.activa ? '#f8fff8' : '#fafafa'}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">
            <div style="flex:1">
              <strong style="font-size:.9rem">${esc(n.titulo)}</strong>
              <p style="margin:.25rem 0;font-size:.8rem;color:#666">${esc(n.cuerpo)}</p>
              ${n.link ? `<a href="${esc(n.link)}" target="_blank" style="font-size:.75rem;color:#7b61ff">🔗 ${esc(n.link)}</a>` : ''}
              <div style="font-size:.7rem;color:#999;margin-top:.3rem">${new Date(n.creadoEn).toLocaleString('es-CL')}</div>
            </div>
            <div style="display:flex;gap:.25rem;flex-shrink:0">
              <button onclick="toggleNotif(${n.id})" class="btn-icon" style="background:${n.activa ? '#f59e0b' : '#22c55e'};color:#fff;border:none;padding:.3rem .5rem;border-radius:4px;font-size:.7rem;cursor:pointer" title="${n.activa ? 'Desactivar' : 'Activar'}">${n.activa ? '🔕' : '🔔'}</button>
              <button onclick="deleteNotif(${n.id})" class="btn-icon" style="background:#e74c3c;color:#fff;border:none;padding:.3rem .5rem;border-radius:4px;font-size:.7rem;cursor:pointer" title="Eliminar">🗑️</button>
            </div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      notifList.innerHTML = '<p style="color:#e74c3c;font-size:.85rem">Error al cargar notificaciones</p>';
    }
  }

  notifForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('notifTitulo').value.trim();
    const cuerpo = document.getElementById('notifCuerpo').value.trim();
    const link = document.getElementById('notifLink').value.trim();

    if (!titulo || !cuerpo) {
      showMsg(notifMsg, 'Título y mensaje son requeridos', false);
      return;
    }

    try {
      const res = await fetch('/api/admin/notificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, cuerpo, link: link || null })
      });
      const data = await res.json();
      if (data.ok) {
        showMsg(notifMsg, '¡Notificación enviada!', true);
        notifForm.reset();
        loadNotificaciones();
      } else {
        showMsg(notifMsg, data.error || 'Error al enviar', false);
      }
    } catch (err) {
      showMsg(notifMsg, 'Error de conexión', false);
    }
  });

  // Global functions for inline onclick
  window.toggleNotif = async (id) => {
    try {
      await fetch(`/api/admin/notificaciones/${id}/toggle`, { method: 'PATCH' });
      loadNotificaciones();
    } catch (e) { /* ignore */ }
  };

  window.deleteNotif = async (id) => {
    if (!(await uiConfirm('¿Eliminar esta notificación?', 'Confirmar'))) return;
    try {
      await fetch(`/api/admin/notificaciones/${id}`, { method: 'DELETE' });
      loadNotificaciones();
    } catch (e) { /* ignore */ }
  };

  // Load dashboard on init
  loadDashboard();
})();

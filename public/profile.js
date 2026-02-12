// public/profile.js — lógica del perfil de usuario
(async function () {
  /* ── Auth check ── */
  const authRes = await fetch('/api/auth/me');
  const authData = await authRes.json();
  if (!authData.user) {
    window.location.href = '/login.html';
    return;
  }

  /* ══════════════════════════════════════════════════════
     TAB NAVIGATION
     ══════════════════════════════════════════════════════ */
  const tabs = document.querySelectorAll('.profile-tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  /* ══════════════════════════════════════════════════════
     PERFIL — cargar y guardar
     ══════════════════════════════════════════════════════ */
  async function loadProfile() {
    try {
      const res = await fetch('/api/perfil');
      const data = await res.json();
      if (!data.user) return;
      const u = data.user;

      document.getElementById('pf-nombre').value = u.nombre || '';
      document.getElementById('pf-telefono').value = u.telefono || '';
      document.getElementById('pf-correo').value = u.correo || '';
      document.getElementById('pf-fechaNac').value = u.fechaNacimiento ? u.fechaNacimiento.slice(0, 10) : '';
      document.getElementById('pf-points').textContent = (u.mockaPoints || 0) + ' pts';
      document.getElementById('pf-member').textContent = u.creadoEn ? new Date(u.creadoEn).toLocaleDateString('es-DO') : '—';

      // Sidebar
      document.getElementById('profileAvatar').textContent = (u.nombre || '?')[0].toUpperCase();
      document.getElementById('sidebarName').textContent = u.nombre || 'Usuario';
      document.getElementById('sidebarEmail').textContent = u.correo || '';
    } catch (err) {
      console.error('Error cargando perfil', err);
    }
  }

  loadProfile();

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('profileMsg');
    msg.textContent = '';
    msg.className = 'form-msg';

    const body = {
      nombre: document.getElementById('pf-nombre').value,
      telefono: document.getElementById('pf-telefono').value,
      fechaNacimiento: document.getElementById('pf-fechaNac').value || null
    };

    try {
      const res = await fetch('/api/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        msg.textContent = '✓ ' + data.message;
        msg.classList.add('success');
        loadProfile();
      } else {
        msg.textContent = data.error || 'Error al guardar';
        msg.classList.add('error');
      }
    } catch (err) {
      msg.textContent = 'Error de conexión';
      msg.classList.add('error');
    }
  });

  /* ══════════════════════════════════════════════════════
     CONTRASEÑA
     ══════════════════════════════════════════════════════ */
  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('passwordMsg');
    msg.textContent = '';
    msg.className = 'form-msg';

    const newPw = document.getElementById('pw-new').value;
    const confirmPw = document.getElementById('pw-confirm').value;

    if (newPw !== confirmPw) {
      msg.textContent = 'Las contraseñas no coinciden';
      msg.classList.add('error');
      return;
    }

    const body = {
      currentPassword: document.getElementById('pw-current').value || null,
      newPassword: newPw
    };

    try {
      const res = await fetch('/api/perfil/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        msg.textContent = '✓ ' + data.message;
        msg.classList.add('success');
        document.getElementById('passwordForm').reset();
      } else {
        msg.textContent = data.error || 'Error';
        msg.classList.add('error');
      }
    } catch (err) {
      msg.textContent = 'Error de conexión';
      msg.classList.add('error');
    }
  });

  /* ══════════════════════════════════════════════════════
     DIRECCIONES
     ══════════════════════════════════════════════════════ */
  let sectores = [];

  async function loadSectores() {
    try {
      const res = await fetch('/api/perfil/sectores');
      const data = await res.json();
      sectores = data.sectores || [];
      const select = document.getElementById('addr-sector');
      select.innerHTML = '<option value="">Seleccionar sector...</option>';
      sectores.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nombre + (s.precioEnvio ? ' (RD$' + Number(s.precioEnvio).toFixed(2) + ')' : '');
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('Error cargando sectores', err);
    }
  }

  async function loadAddresses() {
    const list = document.getElementById('addressesList');
    list.innerHTML = '<p class="loading-message">Cargando direcciones...</p>';

    try {
      const res = await fetch('/api/perfil/direcciones');
      const data = await res.json();
      const dirs = data.direcciones || [];

      if (dirs.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>📍 No tienes direcciones guardadas</p><p class="hint">Agrega una dirección para facilitar tus pedidos</p></div>';
        return;
      }

      list.innerHTML = '';
      dirs.forEach(d => {
        const card = document.createElement('div');
        card.className = 'address-card' + (d.esPrincipal ? ' principal' : '');
        card.innerHTML =
          '<div class="address-card-header">' +
            '<div class="address-info">' +
              (d.esPrincipal ? '<span class="badge-principal">⭐ Principal</span>' : '') +
              '<h4>' + escapeHtml(d.calle) + '</h4>' +
              (d.numeroCasa ? '<p class="addr-detail">🏠 ' + escapeHtml(d.numeroCasa) + '</p>' : '') +
              (d.sectorNombre ? '<p class="addr-detail">📍 ' + escapeHtml(d.sectorNombre) +
                (d.precioEnvio ? ' — Envío: RD$' + Number(d.precioEnvio).toFixed(2) : '') + '</p>' : '') +
              (d.nota ? '<p class="addr-note">📝 ' + escapeHtml(d.nota) + '</p>' : '') +
            '</div>' +
            '<div class="address-actions">' +
              (!d.esPrincipal ? '<button class="btn small outline" data-set-principal="' + d.id + '" title="Marcar como principal">⭐</button>' : '') +
              '<button class="btn small outline" data-edit="' + d.id + '" title="Editar">✏️</button>' +
              '<button class="btn small outline danger" data-delete="' + d.id + '" title="Eliminar">🗑️</button>' +
            '</div>' +
          '</div>';
        list.appendChild(card);
      });

      // Event delegation
      list.addEventListener('click', handleAddressAction);
    } catch (err) {
      list.innerHTML = '<p class="error-message">Error al cargar las direcciones</p>';
    }
  }

  async function handleAddressAction(e) {
    const btn = e.target.closest('[data-edit], [data-delete], [data-set-principal]');
    if (!btn) return;

    if (btn.dataset.delete) {
      if (!confirm('¿Estás seguro de eliminar esta dirección?')) return;
      try {
        const res = await fetch('/api/perfil/direcciones/' + btn.dataset.delete, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) loadAddresses();
        else alert(data.error || 'Error al eliminar');
      } catch (err) { alert('Error de conexión'); }
    }

    if (btn.dataset.setPrincipal) {
      try {
        const res = await fetch('/api/perfil/direcciones/' + btn.dataset.setPrincipal + '/principal', { method: 'PATCH' });
        const data = await res.json();
        if (data.ok) loadAddresses();
        else alert(data.error || 'Error');
      } catch (err) { alert('Error de conexión'); }
    }

    if (btn.dataset.edit) {
      try {
        const res = await fetch('/api/perfil/direcciones/' + btn.dataset.edit);
        const data = await res.json();
        if (data.direccion) openAddressModal(data.direccion);
      } catch (err) { alert('Error al cargar dirección'); }
    }
  }

  /* ── Modal ── */
  const modal = document.getElementById('addressModal');
  const form = document.getElementById('addressForm');

  function openAddressModal(dir) {
    document.getElementById('addressModalTitle').textContent = dir ? 'Editar dirección' : 'Nueva dirección';
    document.getElementById('addr-id').value = dir ? dir.id : '';
    document.getElementById('addr-calle').value = dir ? dir.calle : '';
    document.getElementById('addr-numero').value = dir ? (dir.numeroCasa || '') : '';
    document.getElementById('addr-sector').value = dir ? (dir.sectorId || '') : '';
    document.getElementById('addr-nota').value = dir ? (dir.nota || '') : '';
    document.getElementById('addr-principal').checked = dir ? !!dir.esPrincipal : false;
    document.getElementById('addressMsg').textContent = '';
    modal.classList.add('open');
  }

  function closeAddressModal() {
    modal.classList.remove('open');
    form.reset();
  }

  document.getElementById('btnAddAddress').addEventListener('click', () => openAddressModal(null));
  document.getElementById('addressModalClose').addEventListener('click', closeAddressModal);
  document.getElementById('addressCancelBtn').addEventListener('click', closeAddressModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeAddressModal(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('addressMsg');
    msg.textContent = '';
    msg.className = 'form-msg';

    const id = document.getElementById('addr-id').value;
    const body = {
      calle: document.getElementById('addr-calle').value,
      numeroCasa: document.getElementById('addr-numero').value,
      sectorId: document.getElementById('addr-sector').value || null,
      nota: document.getElementById('addr-nota').value,
      esPrincipal: document.getElementById('addr-principal').checked
    };

    const url = id ? '/api/perfil/direcciones/' + id : '/api/perfil/direcciones';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        closeAddressModal();
        loadAddresses();
      } else {
        msg.textContent = data.error || 'Error al guardar';
        msg.classList.add('error');
      }
    } catch (err) {
      msg.textContent = 'Error de conexión';
      msg.classList.add('error');
    }
  });

  // Cargar datos iniciales
  loadSectores();
  loadAddresses();

  /* ══════════════════════════════════════════════════════
     CUPONES
     ══════════════════════════════════════════════════════ */
  async function loadCoupons() {
    const grid = document.getElementById('couponsGrid');
    grid.innerHTML = '<p class="loading-text">Cargando cupones...</p>';
    try {
      const res = await fetch('/api/perfil/cupones');
      const data = await res.json();
      const cupones = data.cupones || [];

      if (cupones.length === 0) {
        grid.innerHTML =
          '<div class="empty-coupons">' +
            '<div class="empty-icon">🎟️</div>' +
            '<p>No tienes cupones aún</p>' +
            '<p style="font-size:.85rem;margin-top:.3rem">Ingresa un código arriba para reclamar uno</p>' +
          '</div>';
        return;
      }

      grid.innerHTML = '';
      cupones.forEach(c => {
        const card = document.createElement('div');
        card.className = 'coupon-card ' + c.estado;

        const porcDesc = Number(c.porcentajeDescuento) || 0;
        const limite = Number(c.limiteDescuento) || 0;
        const minCompra = Number(c.minimoCompra) || 0;
        const venceEn = c.venceEn ? new Date(c.venceEn) : null;

        let detalles = '';
        if (minCompra > 0) detalles += '<div>🛒 Compra mínima: <strong>$' + minCompra.toLocaleString('es-CL') + '</strong></div>';
        if (limite > 0) detalles += '<div>📊 Descuento máximo: <strong>$' + limite.toLocaleString('es-CL') + '</strong></div>';
        if (venceEn) detalles += '<div>📅 Vence: <strong>' + venceEn.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) + '</strong></div>';
        if (c.usadoEn) detalles += '<div>✅ Usado el: <strong>' + new Date(c.usadoEn).toLocaleDateString('es-CL') + '</strong></div>';

        const badgeLabel = { disponible: 'Disponible', usado: 'Usado', vencido: 'Vencido', inactivo: 'Inactivo' }[c.estado] || c.estado;

        card.innerHTML =
          '<div class="coupon-card-top">' +
            '<span class="coupon-name">' + escapeHtml(c.nombre) + '</span>' +
            '<span class="coupon-badge ' + c.estado + '">' + badgeLabel + '</span>' +
          '</div>' +
          '<div class="coupon-discount">' + porcDesc + '% OFF</div>' +
          '<div class="coupon-code">' +
            '<span>' + escapeHtml(c.codigo) + '</span>' +
            '<button class="coupon-copy-btn" title="Copiar código" data-code="' + escapeHtml(c.codigo) + '">📋</button>' +
          '</div>' +
          '<div class="coupon-details">' + detalles + '</div>' +
          (c.estado === 'disponible' || c.estado === 'vencido' ? '<div class="coupon-actions"><button class="coupon-delete-btn" data-id="' + c.id + '">🗑️ Eliminar</button></div>' : '');

        grid.appendChild(card);
      });

      // Copy buttons
      grid.querySelectorAll('.coupon-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.code).then(() => {
            btn.textContent = '✓';
            setTimeout(() => { btn.textContent = '📋'; }, 1500);
          });
        });
      });

      // Delete buttons
      grid.querySelectorAll('.coupon-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este cupón de tu cuenta?')) return;
          try {
            await fetch('/api/perfil/cupones/' + btn.dataset.id, { method: 'DELETE' });
            loadCoupons();
          } catch (e) { /* ignore */ }
        });
      });

    } catch (err) {
      grid.innerHTML = '<p class="loading-text" style="color:#ef4444">Error al cargar cupones</p>';
    }
  }

  // Reclamar cupón
  document.getElementById('claimCouponForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('claimMsg');
    const input = document.getElementById('couponCodeInput');
    msg.textContent = '';
    msg.className = 'form-msg';

    const codigo = input.value.trim();
    if (!codigo) return;

    try {
      const res = await fetch('/api/perfil/cupones/reclamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo })
      });
      const data = await res.json();
      if (data.ok) {
        msg.textContent = '✓ ' + data.message;
        msg.classList.add('success');
        input.value = '';
        loadCoupons();
      } else {
        msg.textContent = data.error || 'Error al reclamar cupón';
        msg.classList.add('error');
      }
    } catch (err) {
      msg.textContent = 'Error de conexión';
      msg.classList.add('error');
    }
  });

  // Load coupons when tab is selected
  document.querySelector('[data-tab="coupons"]').addEventListener('click', loadCoupons);

  /* ── Helpers ── */
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
})();

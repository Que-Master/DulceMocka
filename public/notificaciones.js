// public/notificaciones.js — Notification bell + dropdown panel
(function initNotificaciones() {
  // Wait for auth-ui to finish building the user menu
  const waitForMenu = setInterval(() => {
    const userMenu = document.querySelector('.user-menu');
    if (!userMenu) return; // not logged in or not ready yet

    clearInterval(waitForMenu);
    buildNotificationBell(userMenu);
  }, 200);

  // Give up after 5 seconds
  setTimeout(() => clearInterval(waitForMenu), 5000);

  function buildNotificationBell(userMenu) {
    // Insert bell BEFORE the user avatar menu
    const actions = userMenu.parentElement;

    const wrap = document.createElement('div');
    wrap.className = 'notif-wrap';
    wrap.innerHTML =
      '<button class="notif-bell" id="notifBellBtn" title="Notificaciones">' +
        '🔔' +
        '<span class="notif-badge" id="notifBadge" style="display:none">0</span>' +
      '</button>' +
      '<div class="notif-dropdown" id="notifDropdown">' +
        '<div class="notif-dropdown-header">' +
          '<span class="notif-dropdown-title">Notificaciones</span>' +
          '<button class="notif-mark-all" id="notifMarkAll" title="Marcar todas como leídas">✓ Todas</button>' +
        '</div>' +
        '<div class="notif-list" id="notifList">' +
          '<div class="notif-empty">Sin notificaciones</div>' +
        '</div>' +
      '</div>';

    actions.insertBefore(wrap, userMenu);

    // Toggle dropdown
    const bellBtn = document.getElementById('notifBellBtn');
    const dropdown = document.getElementById('notifDropdown');

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
      // Close user dropdown if open
      const ud = document.getElementById('userDropdown');
      if (ud) ud.classList.remove('open');
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) dropdown.classList.remove('open');
    });

    // Mark all read
    document.getElementById('notifMarkAll').addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetch('/api/notificaciones/leer-todas', { method: 'PUT' });
      loadNotificaciones();
    });

    // Load immediately and poll every 30s
    loadNotificaciones();
    setInterval(loadNotificaciones, 30000);
  }

  async function loadNotificaciones() {
    try {
      const res = await fetch('/api/notificaciones');
      if (!res.ok) return;
      const data = await res.json();
      renderNotificaciones(data.notificaciones || [], data.sinLeer || 0);
    } catch (e) { /* silent */ }
  }

  function renderNotificaciones(notifs, sinLeer) {
    // Badge
    const badge = document.getElementById('notifBadge');
    if (sinLeer > 0) {
      badge.textContent = sinLeer > 9 ? '9+' : sinLeer;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }

    // List
    const list = document.getElementById('notifList');
    if (!notifs.length) {
      list.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
      return;
    }

    list.innerHTML = notifs.map(n => {
      const cls = n.leida ? 'notif-item read' : 'notif-item unread';
      const time = timeAgo(n.creadoEn);
      const cancelInfo = n.motivoCancelacion
        ? '<div class="notif-cancel-reason"><strong>Motivo:</strong> ' + esc(n.motivoCancelacion) + '</div>'
        : '';

      return '<div class="' + cls + '" data-notif-id="' + n.id + '"' +
        (n.pedidoId ? ' data-pedido-id="' + n.pedidoId + '"' : '') + '>' +
        '<div class="notif-content">' +
          '<div class="notif-title">' + esc(n.titulo) + '</div>' +
          '<div class="notif-msg">' + esc(n.mensaje) + '</div>' +
          cancelInfo +
          '<div class="notif-time">' + time + '</div>' +
        '</div>' +
        '<div class="notif-actions">' +
          (!n.leida ? '<button class="notif-action-btn" data-mark-read="' + n.id + '" title="Marcar como leída">✓</button>' : '') +
          '<button class="notif-action-btn del" data-delete-notif="' + n.id + '" title="Eliminar">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // Event listeners
    list.querySelectorAll('[data-mark-read]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/notificaciones/' + btn.dataset.markRead + '/leer', { method: 'PUT' });
        loadNotificaciones();
      });
    });

    list.querySelectorAll('[data-delete-notif]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/notificaciones/' + btn.dataset.deleteNotif, { method: 'DELETE' });
        loadNotificaciones();
      });
    });

    // Click on notification to go to order
    list.querySelectorAll('[data-pedido-id]').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const pid = item.dataset.pedidoId;
        window.location.href = '/order.html?id=' + pid;
      });
    });
  }

  function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return 'Hace ' + mins + ' min';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return 'Hace ' + hrs + 'h';
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Ayer';
    if (days < 7) return 'Hace ' + days + ' días';
    return date.toLocaleDateString('es-CL');
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
})();

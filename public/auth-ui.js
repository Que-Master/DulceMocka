// public/auth-ui.js  –  shared auth UI for all pages
(async function initAuthUI() {
  const actions = document.querySelector('.actions');
  if (!actions) return;

  // find existing login link
  const loginLink = actions.querySelector('a[href="/login.html"]');

  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (data.user) {
      // ── User is logged in: replace "Iniciar sesión" with avatar menu ──
      if (loginLink) loginLink.remove();

      const wrap = document.createElement('div');
      wrap.className = 'user-menu';

      const initial = (data.user.nombre || data.user.email || '?')[0].toUpperCase();
      const nombre = data.user.nombre || data.user.email || 'Usuario';

      wrap.innerHTML =
        '<button class="user-avatar" id="userMenuBtn" title="' + nombre + '">' + initial + '</button>' +
        '<div class="user-dropdown" id="userDropdown">' +
          '<div class="user-dropdown-header">' +
            '<span class="user-dropdown-name">' + nombre + '</span>' +
            '<span class="user-dropdown-email">' + (data.user.email || '') + '</span>' +
          '</div>' +
          '<hr>' +
          '<a href="/profile.html" class="user-dropdown-item">👤 Mi perfil</a>' +
          '<a href="/mis-pedidos.html" class="user-dropdown-item">📦 Mis pedidos</a>' +
          '<a href="/cart.html" class="user-dropdown-item">🛒 Mi carrito</a>' +
          '<button class="user-dropdown-item logout-item" id="logoutBtn">🚪 Cerrar sesión</button>' +
        '</div>';

      actions.appendChild(wrap);

      // Check if admin and add admin link
      try {
        const adminCheck = await fetch('/api/admin/dashboard');
        if (adminCheck.ok) {
          const adminLink = document.createElement('a');
          adminLink.href = '/admin.html';
          adminLink.className = 'user-dropdown-item';
          adminLink.textContent = '⚙️ Panel Admin';
          const hr = dd.querySelector('hr');
          hr.insertAdjacentElement('afterend', adminLink);
        }
      } catch (e) { /* not admin */ }

      // Toggle dropdown
      const btn = document.getElementById('userMenuBtn');
      const dd  = document.getElementById('userDropdown');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dd.classList.toggle('open');
      });
      document.addEventListener('click', () => dd.classList.remove('open'));

      // Logout
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
      });
    }
    // if no user, keep the existing "Iniciar sesión" link
  } catch (e) {
    console.error('auth-ui error', e);
  }
})();

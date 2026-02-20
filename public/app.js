// public/app.js

const api = {
  categorias: '/api/categorias',
  productos: '/api/productos'
};

const $categories = document.getElementById('categories');
const $productsGrid = document.getElementById('productsGrid');
let categorias = [];
let productos = [];
let categoriaActiva = null; // null = todos, 'mockapoints' = canjeable, o categoryId

async function fetchCategorias() {
  try {
    const res = await fetch(api.categorias);
    categorias = await res.json();
    renderCategorias();
  } catch (e) {
    console.error('Error cargando categorías', e);
  }
}

async function fetchProductos(categoriaId = null) {
  try {
    let url = api.productos;
    if (categoriaId && categoriaId !== 'mockapoints') {
      url = `${api.productos}?categoria=${categoriaId}`;
    }
    const res = await fetch(url);
    let prods = await res.json();
    
    // Si es filtro de Mocka Points, mostrar solo productos canjeables
    if (categoriaId === 'mockapoints') {
      prods = prods.filter(p => p.costoMockaPoints && p.costoMockaPoints > 0);
    }
    
    productos = prods;
    renderProductos();
  } catch (e) {
    console.error('Error cargando productos', e);
  }
}

function renderCategorias() {
  $categories.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'pill' + (categoriaActiva === null ? ' active' : '');
  allBtn.textContent = 'Todos';
  allBtn.onclick = () => { categoriaActiva = null; fetchProductos(null); updateCategoriaActive(); };
  $categories.appendChild(allBtn);

  // Botón especial de Mocka Points
  const mpBtn = document.createElement('button');
  mpBtn.className = 'pill mp-pill' + (categoriaActiva === 'mockapoints' ? ' active' : '');
  mpBtn.textContent = '🏆 Mocka Points';
  mpBtn.onclick = () => { categoriaActiva = 'mockapoints'; fetchProductos('mockapoints'); updateCategoriaActive(); };
  $categories.appendChild(mpBtn);

  categorias.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'pill' + (categoriaActiva == cat.id ? ' active' : '');
    btn.textContent = cat.nombre;
    btn.onclick = () => { categoriaActiva = cat.id; fetchProductos(cat.id); updateCategoriaActive(); };
    $categories.appendChild(btn);
  });
}

function updateCategoriaActive() {
  Array.from($categories.children).forEach(btn => btn.classList.remove('active'));
  Array.from($categories.children).forEach(btn => {
    const btnText = btn.textContent;
    if (categoriaActiva === null && btnText === 'Todos') {
      btn.classList.add('active');
    } else if (categoriaActiva === 'mockapoints' && btnText === '🏆 Mocka Points') {
      btn.classList.add('active');
    } else if (btnText === (categorias.find(c => c.id == categoriaActiva) || {}).nombre) {
      btn.classList.add('active');
    }
  });
}

function renderProductos() {
  $productsGrid.innerHTML = '';
  if (!productos || productos.length === 0) {
    $productsGrid.innerHTML = '<p>No hay productos disponibles.</p>';
    return;
  }
  productos.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card product-card';

    const top = document.createElement('div');
    top.className = 'card-top';
    const img = document.createElement('div');
    img.className = 'card-img';
    if (p.imagen && (p.imagen.startsWith('http://') || p.imagen.startsWith('https://'))) {
      top.style.backgroundImage = 'url(' + p.imagen + ')';
      top.style.backgroundSize = 'cover';
      top.style.backgroundPosition = 'center';
      top.style.background = 'url(' + p.imagen + ') center/cover no-repeat';
    } else {
      img.textContent = p.emoji || '🍬';
    }
    top.appendChild(img);

    // Badge de Mocka Points si el producto es canjeable
    if (p.costoMockaPoints && p.costoMockaPoints > 0) {
      const mpBadge = document.createElement('div');
      mpBadge.className = 'mp-badge';
      mpBadge.textContent = '🏆 ' + p.costoMockaPoints + ' pts';
      top.appendChild(mpBadge);
    }

    const body = document.createElement('div');
    body.className = 'card-body';

    const h4 = document.createElement('h4');
    h4.textContent = p.nombre;

    const small = document.createElement('small');
    small.textContent = (p.categoria_nombre || '').toUpperCase();

    const pDesc = document.createElement('p');
    pDesc.textContent = p.descripcion || '';

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = p.precio ? formatPrice(p.precio) : '';

    const btn = document.createElement('button');
    btn.className = 'vermas';
    btn.textContent = 'Ver más';
    btn.onclick = () => { window.location = `/product.html?id=${p.id}`; };

    footer.appendChild(price);
    footer.appendChild(btn);

    body.appendChild(h4);
    body.appendChild(small);
    body.appendChild(pDesc);
    body.appendChild(footer);

    card.appendChild(top);
    card.appendChild(body);

    $productsGrid.appendChild(card);
  });
}

function formatPrice(v) {
  const n = Number(v);
  if (isNaN(n)) return '';
  // Formato: $4.500 (miles con punto)
  return `$${n.toLocaleString('es-CL')}`;
}

// Inicializar
fetchCategorias();
fetchProductos();
initSlider();
initMockaPoints();

/* ── Mocka Points Section ── */
async function initMockaPoints() {
  try {
    const res = await fetch('/api/mockapoints/productos');
    if (!res.ok) return;
    const data = await res.json();
    const prods = data.productos || [];
    if (prods.length === 0) return;

    // Show section
    const section = document.getElementById('mockapoints');
    if (section) section.style.display = '';

    // Check if logged in
    let userPoints = null;
    try {
      const authRes = await fetch('/api/auth/me');
      const authData = await authRes.json();
      if (authData.user) {
        const saldoRes = await fetch('/api/mockapoints/saldo');
        const saldoData = await saldoRes.json();
        userPoints = saldoData.puntos || 0;
        document.getElementById('mpBalance').style.display = '';
        document.getElementById('mpBalanceValue').textContent = userPoints.toLocaleString('es-CL');
        document.getElementById('mpLoginMsg').style.display = 'none';
      } else {
        document.getElementById('mpLoginMsg').style.display = '';
      }
    } catch (e) {
      document.getElementById('mpLoginMsg').style.display = '';
    }

    const grid = document.getElementById('mpProductsGrid');
    grid.innerHTML = '';
    prods.forEach(p => {
      const card = document.createElement('article');
      card.className = 'card product-card mp-card';

      const top = document.createElement('div');
      top.className = 'card-top';
      if (p.imagen && (p.imagen.startsWith('http://') || p.imagen.startsWith('https://'))) {
        top.style.background = 'url(' + p.imagen + ') center/cover no-repeat';
      } else {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'card-img';
        imgDiv.textContent = '🏆';
        top.appendChild(imgDiv);
      }

      const pointsBadge = document.createElement('div');
      pointsBadge.className = 'mp-badge';
      pointsBadge.textContent = p.costoMockaPoints + ' pts';
      top.appendChild(pointsBadge);

      const body = document.createElement('div');
      body.className = 'card-body';

      const h4 = document.createElement('h4');
      h4.textContent = p.nombre;

      const desc = document.createElement('p');
      desc.textContent = p.descripcion || '';

      const footer = document.createElement('div');
      footer.className = 'card-footer';

      const pointsInfo = document.createElement('div');
      pointsInfo.className = 'price mp-cost';
      pointsInfo.innerHTML = '🏆 ' + p.costoMockaPoints + ' pts';

      const btn = document.createElement('button');
      btn.className = 'vermas mp-redeem';
      if (userPoints !== null) {
        if (userPoints >= p.costoMockaPoints) {
          btn.textContent = 'Canjear';
          btn.onclick = () => redeemProduct(p, btn);
        } else {
          btn.textContent = 'Puntos insuficientes';
          btn.disabled = true;
          btn.style.opacity = '0.5';
        }
      } else {
        btn.textContent = 'Iniciar sesión';
        btn.onclick = () => { window.location.href = '/login.html'; };
      }

      footer.appendChild(pointsInfo);
      footer.appendChild(btn);

      body.appendChild(h4);
      body.appendChild(desc);
      body.appendChild(footer);
      card.appendChild(top);
      card.appendChild(body);
      grid.appendChild(card);
    });
  } catch (e) {
    console.error('Error cargando Mocka Points', e);
  }
}

async function redeemProduct(prod, btn) {
  if (!confirm('¿Deseas canjear "' + prod.nombre + '" por ' + prod.costoMockaPoints + ' Mocka Points?\n\n⚠️ Solo retiro en tienda')) return;
  btn.disabled = true;
  btn.textContent = 'Canjeando...';
  try {
    const res = await fetch('/api/mockapoints/canjear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productoId: prod.id })
    });
    const data = await res.json();
    if (data.ok) {
      // Mostrar modal/confirmación de canje exitoso
      const verBoleta = confirm(
        '🏆 ¡CANJE EXITOSO!\n\n' +
        '📦 Producto: ' + data.producto.nombre + '\n' +
        '🎟️ Boleta: #' + data.numeroPedido + '\n' +
        '🏪 Retiro: En tienda\n' +
        '💰 Puntos restantes: ' + data.puntosRestantes + '\n\n' +
        '¿Deseas ver tu boleta de canje?'
      );
      if (verBoleta) {
        window.location.href = '/order.html?id=' + data.pedidoId;
      } else {
        initMockaPoints(); // Refresh
      }
    } else {
      // Handle special cases
      if (data.requiresLogin) {
        if (confirm(data.error + '\n\n¿Deseas iniciar sesión?')) {
          window.location.href = '/login.html';
        }
      } else if (data.requiresProfile) {
        if (confirm(data.error + '\n\n¿Deseas completar tu perfil?')) {
          window.location.href = '/profile.html';
        }
      } else if (data.requiresAge) {
        alert('⚠️ ' + data.error + '\n\nDebes ser mayor de 18 años para realizar compras o canjes en Dulce Mocka.');
      } else {
        alert(data.error || 'Error al canjear');
      }
      btn.disabled = false;
      btn.textContent = 'Canjear';
    }
  } catch (e) {
    alert('Error de conexión');
    btn.disabled = false;
    btn.textContent = 'Canjear';
  }
}

/* ── Hero Slider ── */
async function initSlider() {
  try {
    const res = await fetch('/api/slider');
    if (!res.ok) return;
    const data = await res.json();
    const slides = data.slides || [];
    if (slides.length === 0) return;

    // Hide fallback, show slider
    const fallback = document.getElementById('heroFallback');
    const container = document.getElementById('sliderContainer');
    if (fallback) fallback.style.display = 'none';
    if (container) container.style.display = 'block';

    const track = document.getElementById('sliderTrack');
    const dotsBox = document.getElementById('sliderDots');
    let current = 0;

    // Build slides
    slides.forEach((s, i) => {
      const slide = document.createElement('div');
      slide.className = 'slider-slide';
      slide.innerHTML = '<img src="' + s.imagenUrl + '" alt="' + (s.titulo || 'Slider') + '" />'
        + ((s.titulo || s.subtitulo) ? '<div class="slider-overlay">'
          + (s.titulo ? '<h2>' + s.titulo + '</h2>' : '')
          + (s.subtitulo ? '<p>' + s.subtitulo + '</p>' : '')
          + '</div>' : '');
      if (s.linkUrl) {
        slide.style.cursor = 'pointer';
        slide.addEventListener('click', () => { window.location.href = s.linkUrl; });
      }
      track.appendChild(slide);

      // Dot
      const dot = document.createElement('button');
      dot.className = 'slider-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => goTo(i));
      dotsBox.appendChild(dot);
    });

    function goTo(idx) {
      current = idx;
      if (current < 0) current = slides.length - 1;
      if (current >= slides.length) current = 0;
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      dotsBox.querySelectorAll('.slider-dot').forEach((d, i) => d.classList.toggle('active', i === current));
    }

    document.getElementById('sliderPrev').addEventListener('click', () => goTo(current - 1));
    document.getElementById('sliderNext').addEventListener('click', () => goTo(current + 1));

    // Auto-play every 5 seconds
    let autoTimer = setInterval(() => goTo(current + 1), 5000);
    container.addEventListener('mouseenter', () => clearInterval(autoTimer));
    container.addEventListener('mouseleave', () => { autoTimer = setInterval(() => goTo(current + 1), 5000); });

  } catch (e) { /* slider not available, fallback stays */ }
}

// ═══ Estado del Local (Abierto/Cerrado) ═══
async function loadEstadoLocal() {
  try {
    const banner = document.getElementById('localStatusBanner');
    const text = document.getElementById('localStatusText');
    if (!banner || !text) return;

    const res = await fetch('/api/estado-local');
    const data = await res.json();
    
    if (data.abierto) {
      banner.className = 'local-status-banner abierto';
      text.innerHTML = '🟢 <strong>ABIERTO</strong> — Horario: ' + data.horaApertura + ' - ' + data.horaCierre;
    } else {
      banner.className = 'local-status-banner cerrado';
      let msg = '🔴 <strong>CERRADO</strong>';
      if (data.mensaje) {
        msg += ' — ' + data.mensaje;
      } else {
        msg += ' — Horario de atención: ' + data.horaApertura + ' - ' + data.horaCierre;
      }
      text.innerHTML = msg;
    }
    
    banner.style.display = 'block';
    
    // Guardar estado en sessionStorage para usarlo en checkout
    sessionStorage.setItem('localAbierto', data.abierto ? '1' : '0');
  } catch (e) {
    console.error('Error cargando estado del local', e);
  }
}

// Llamar al cargar la página
loadEstadoLocal();

/* ══════════════════════════════════════════
   NOTIFICACIONES
   ══════════════════════════════════════════ */
const notifBell = document.getElementById('notifBell');
const notifDropdown = document.getElementById('notifDropdown');
const notifDropdownList = document.getElementById('notifDropdownList');
const notifBadge = document.getElementById('notifBadge');

// Track dismissed notifications
function getDismissedNotifs() {
  try {
    return JSON.parse(localStorage.getItem('dismissedNotifs') || '[]');
  } catch (e) { return []; }
}

function saveDismissedNotif(id) {
  const dismissed = getDismissedNotifs();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem('dismissedNotifs', JSON.stringify(dismissed));
  }
}

async function loadNotificaciones() {
  try {
    const res = await fetch('/api/notificaciones');
    const notifs = await res.json();
    const dismissed = getDismissedNotifs();
    
    // Filter out dismissed notifications for badge count
    const unread = notifs.filter(n => !dismissed.includes(n.id));
    
    // Update badge
    if (notifBadge) {
      if (unread.length > 0) {
        notifBadge.textContent = unread.length > 9 ? '9+' : unread.length;
        notifBadge.style.display = '';
      } else {
        notifBadge.style.display = 'none';
      }
    }
    
    // Render all notifications
    if (!notifDropdownList) return;
    
    if (!notifs.length) {
      notifDropdownList.innerHTML = '<p class="notif-empty">No hay notificaciones</p>';
      return;
    }
    
    notifDropdownList.innerHTML = notifs.map(n => {
      const isRead = dismissed.includes(n.id);
      return `
        <div class="notif-item-card ${isRead ? 'read' : ''}" data-id="${n.id}" ${n.link ? `data-link="${escapeAttr(n.link)}"` : ''}>
          <h4>${escapeHtml(n.titulo)}</h4>
          <p>${escapeHtml(n.cuerpo)}</p>
          <div class="notif-time">${timeAgo(n.creadoEn)}</div>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    notifDropdownList.querySelectorAll('.notif-item-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id);
        const link = card.dataset.link;
        saveDismissedNotif(id);
        card.classList.add('read');
        updateBadgeCount();
        if (link) {
          window.location.href = link;
        }
      });
    });
  } catch (e) {
    console.error('Error cargando notificaciones', e);
  }
}

function updateBadgeCount() {
  if (!notifBadge) return;
  const items = notifDropdownList.querySelectorAll('.notif-item-card:not(.read)');
  if (items.length > 0) {
    notifBadge.textContent = items.length > 9 ? '9+' : items.length;
    notifBadge.style.display = '';
  } else {
    notifBadge.style.display = 'none';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} hora${Math.floor(diff / 3600) > 1 ? 's' : ''}`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} día${Math.floor(diff / 86400) > 1 ? 's' : ''}`;
  return date.toLocaleDateString('es-CL');
}

// Toggle dropdown
if (notifBell && notifDropdown) {
  notifBell.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    notifDropdown.classList.toggle('open');
    if (notifDropdown.classList.contains('open')) {
      loadNotificaciones();
    }
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!notifDropdown.contains(e.target) && e.target !== notifBell) {
      notifDropdown.classList.remove('open');
    }
  });
}

// Load on init
loadNotificaciones();

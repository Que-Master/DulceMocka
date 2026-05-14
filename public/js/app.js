// public/app.js

const api = {
  categorias: '/api/categorias',
  productos: '/api/productos'
};

const $categories = document.getElementById('categories');
const $productsGrid = document.getElementById('productsGrid');
const ui = window.uiDialog;
const uiAlert = async (msg, title) => { if (ui) return ui.alert(msg, title); };
const uiConfirm = async (msg, title) => { if (ui) return ui.confirm(msg, title); return true; };
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

    // Solo para categoría real; para mockapoints el botón hace scroll a la sección inferior
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
  if (!$categories) return;
  $categories.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'pill' + (categoriaActiva === null ? ' active' : '');
  allBtn.textContent = 'Todos';
  allBtn.onclick = () => {
    categoriaActiva = null;
    fetchProductos(null);
    updateCategoriaActive();
  };
  $categories.appendChild(allBtn);

  // Botón especial de Mocka Points: solo baja a la sección inferior
  const mpBtn = document.createElement('button');
  mpBtn.className = 'pill mp-pill' + (categoriaActiva === 'mockapoints' ? ' active' : '');
  mpBtn.innerHTML = '<img class="pill-icon" src="/assets/icons/trofeoIcon.png" alt=""> Mocka Points';
  mpBtn.onclick = () => {
    categoriaActiva = 'mockapoints';
    updateCategoriaActive();
    scrollToMockaPointsSection();
  };
  $categories.appendChild(mpBtn);

  categorias.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'pill' + (categoriaActiva == cat.id ? ' active' : '');
    btn.textContent = cat.nombre;
    btn.onclick = () => {
      categoriaActiva = cat.id;
      fetchProductos(cat.id);
      updateCategoriaActive();
    };
    $categories.appendChild(btn);
  });
}

function updateCategoriaActive() {
  if (!$categories) return;
  Array.from($categories.children).forEach(btn => btn.classList.remove('active'));
  Array.from($categories.children).forEach(btn => {
    const btnText = btn.textContent;
    if (categoriaActiva === null && btnText === 'Todos') {
      btn.classList.add('active');
    } else if (categoriaActiva === 'mockapoints' && btn.classList.contains('mp-pill')) {
      btn.classList.add('active');
    } else if (btnText === (categorias.find(c => c.id == categoriaActiva) || {}).nombre) {
      btn.classList.add('active');
    }
  });
}

function scrollToMockaPointsSection() {
  const section = document.getElementById('mockapoints');
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProductos() {
  if (!$productsGrid) return;
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
      top.style.background = 'url(' + p.imagen + ') center/cover no-repeat';
    } else {
      img.textContent = p.emoji || '🍬';
    }
    top.appendChild(img);

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
      }
    } catch (e) {}

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
        imgDiv.innerHTML = '<img class="card-icon" src="/assets/icons/trofeoIcon.png" alt="Mocka Points">';
        top.appendChild(imgDiv);
      }

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
      pointsInfo.innerHTML = '<img class="pill-icon" src="/assets/icons/trofeoIcon.png" alt=""> ' + p.costoMockaPoints + ' pts';

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
  if (!(await uiConfirm('¿Deseas canjear "' + prod.nombre + '" por ' + prod.costoMockaPoints + ' Mocka Points?\n\n⚠️ Solo retiro en tienda', 'Confirmar canje'))) return;
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
      const verBoleta = await uiConfirm(
        '🏆 ¡CANJE EXITOSO!\n\n' +
        '📦 Producto: ' + data.producto.nombre + '\n' +
        '🎟️ Boleta: #' + data.numeroPedido + '\n' +
        '🏪 Retiro: En tienda\n' +
        '💰 Puntos restantes: ' + data.puntosRestantes + '\n\n' +
        '¿Deseas ver tu boleta de canje?',
        'Canje exitoso'
      );
      if (verBoleta) {
        window.location.href = '/order.html?id=' + data.pedidoId;
      } else {
        initMockaPoints(); // Refresh
      }
    } else {
      // Handle special cases
      if (data.requiresLogin) {
        if (await uiConfirm(data.error + '\n\n¿Deseas iniciar sesión?', 'Iniciar sesión')) {
          window.location.href = '/login.html';
        }
      } else if (data.requiresProfile) {
        if (await uiConfirm(data.error + '\n\n¿Deseas completar tu perfil?', 'Completar perfil')) {
          window.location.href = '/profile.html';
        }
      } else if (data.requiresAge) {
        await uiAlert('⚠️ ' + data.error + '\n\nDebes ser mayor de 18 años para realizar compras o canjes en Dulce Mocka.', 'Restricción de edad');
      } else {
        await uiAlert(data.error || 'Error al canjear', 'Error');
      }
      btn.disabled = false;
      btn.textContent = 'Canjear';
    }
  } catch (e) {
    await uiAlert('Error de conexión', 'Error');
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

    // Auto-play every 5 seconds
    let autoTimer = setInterval(() => goTo(current + 1), 5000);
    container.addEventListener('mouseenter', () => clearInterval(autoTimer));
    container.addEventListener('mouseleave', () => { autoTimer = setInterval(() => goTo(current + 1), 5000); });

    // Swipe en móvil (deslizable con dedo)
    let touchStartX = 0;
    let touchEndX = 0;
    const swipeThreshold = 45;

    container.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      touchEndX = e.changedTouches[0].clientX;
    }, { passive: true });

    container.addEventListener('touchend', () => {
      const deltaX = touchEndX - touchStartX;
      if (Math.abs(deltaX) < swipeThreshold) return;
      if (deltaX < 0) goTo(current + 1);
      else goTo(current - 1);
    }, { passive: true });

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

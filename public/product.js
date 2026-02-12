// public/product.js
const $root = document.getElementById('productPage');
const fmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

function formatPrice(v) { return fmt.format(Number(v) || 0); }

/* ── Carrito en localStorage ── */
function getCart() {
  try { return JSON.parse(localStorage.getItem('cart')) || []; }
  catch { return []; }
}
function saveCart(cart) { localStorage.setItem('cart', JSON.stringify(cart)); }
function addItemToCart(item) {
  const cart = getCart();
  cart.push(item);
  saveCart(cart);
}

/* ── Render helpers ── */
function renderLoading() { $root.innerHTML = '<p class="loading-message">Cargando producto…</p>'; }
function renderError(msg) { $root.innerHTML = `<div class="error-message">Error: ${msg}</div>`; }
function renderNotFound() { $root.innerHTML = '<div class="error-message">Producto no encontrado</div>'; }

/* ── Main ── */
async function loadProduct() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return renderNotFound();

  renderLoading();

  let producto;
  try {
    const res = await fetch(`/api/producto/${encodeURIComponent(id)}`);
    if (!res.ok) return renderNotFound();
    producto = await res.json();

    // Si el producto no tiene ingredientes vinculados, cargar todos los ingredientes activos
    if (!producto.ingredientes || producto.ingredientes.length === 0) {
      try {
        const ir = await fetch('/api/ingredientes');
        if (ir.ok) {
          const ingr = await ir.json();
          // marcar incluidos por defecto para que los switches aparezcan activos
          producto.ingredientes = ingr.map(i => ({ ...i, incluidoPorDefecto: 1, sePuedeQuitar: 1 }));
        } else {
          producto.ingredientes = [];
        }
      } catch (ie) {
        producto.ingredientes = [];
      }
    }

  } catch (e) { return renderError(e.message); }

  /* estado local */
  let cantidad = 1;
  let notas = '';
  let agregando = false;
  const seleccionados = {};
  (producto.ingredientes || []).forEach(i => { seleccionados[i.id] = !!i.incluidoPorDefecto; });

  const catNombre = producto.categoria_nombre || '';
  const precio = parseFloat(producto.precio) || 0;

  /* ── HTML ── */
  const hasImage = producto.imagen && (producto.imagen.startsWith('http://') || producto.imagen.startsWith('https://'));
  const imageHtml = hasImage
    ? '<div class="product-image-large" style="background:none"><img src="' + producto.imagen + '" alt="' + producto.nombre + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/></div>'
    : '<div class="product-image-large">🍦</div>';

  $root.innerHTML = `
    <nav class="breadcrumb">
      <a href="/">Home</a> / <span>${catNombre}</span> / <span>${producto.nombre}</span>
    </nav>

    <div class="product-header">
      ${imageHtml}
      <div class="product-basic-info">
        <h1>${producto.nombre}</h1>
        <p class="category-badge">${catNombre.toUpperCase()}</p>
        <p class="product-desc">${producto.descripcion || ''}</p>
        <div class="price-section"><span class="price-large">${formatPrice(precio)}</span></div>
      </div>
    </div>

    ${(producto.ingredientes && producto.ingredientes.length) ? `
    <div class="ingredients-section">
      <h2>Personaliza tu bebida</h2>
      <p class="ingredients-hint">Selecciona los ingredientes que deseas incluir</p>
      <div class="ingredients-list" id="ingredientsList"></div>
    </div>` : ''}

    <div class="order-form">
      <div class="form-group">
        <label><strong>Cantidad:</strong></label>
        <div class="quantity-control">
          <button class="qty-btn" id="qtyMinus">−</button>
          <input id="cantidad" class="qty-input" type="number" min="1" value="1" />
          <button class="qty-btn" id="qtyPlus">+</button>
        </div>
      </div>

      <div class="form-group">
        <label><strong>Notas especiales:</strong></label>
        <textarea id="notas" class="notes-input" rows="4"
          placeholder="Ej: Sin azúcar, bien frío, extra frutas…"></textarea>
      </div>

      <div class="order-summary">
        <div class="summary-row"><span>Precio unitario:</span><span>${formatPrice(precio)}</span></div>
        <div class="summary-row"><span>Cantidad:</span><span id="summaryQty">1x</span></div>
        <div class="summary-row total-row"><span><strong>Total:</strong></span>
          <span id="totalPrice">${formatPrice(precio)}</span></div>
      </div>

      <button id="addToCart" class="btn-add-cart">Agregar al Carrito - ${formatPrice(precio)}</button>
      <div id="successMsg" class="success-message" style="display:none"></div>
    </div>
  `;

  /* ── Ingredientes ── */
  const $list = document.getElementById('ingredientsList');
  if ($list) {
    (producto.ingredientes || []).forEach(ing => {
      const canToggle = !!ing.sePuedeQuitar;
      const isRequired = !canToggle && !!ing.incluidoPorDefecto;
      const item = document.createElement('div');
      item.className = 'ingredient-item' + (isRequired ? ' required' : '');
      item.innerHTML = `
        <label class="ingredient-label">
          <input type="checkbox" id="ing_${ing.id}" class="ingredient-checkbox-input" ${seleccionados[ing.id] ? 'checked' : ''} ${!canToggle ? 'disabled' : ''} />
          <span class="switch" aria-hidden="true"></span>
          <span class="ingredient-name">${ing.nombre}</span>
          ${isRequired ? '<span class="required-badge">Incluido</span>' : ''}
        </label>
        ${ing.descripcion ? `<p class="ingredient-desc">${ing.descripcion}</p>` : ''}
      `;
      const cb = item.querySelector('input');
      cb.addEventListener('change', () => {
        if (!canToggle) { cb.checked = !!ing.incluidoPorDefecto; return; }
        seleccionados[ing.id] = cb.checked;
      });
      $list.appendChild(item);
    });
  }

  /* ── Cantidad ── */
  const qtyInput = document.getElementById('cantidad');
  const summaryQty = document.getElementById('summaryQty');
  const totalEl = document.getElementById('totalPrice');
  const addBtn = document.getElementById('addToCart');

  function updateTotal() {
    cantidad = Math.max(1, parseInt(qtyInput.value) || 1);
    qtyInput.value = cantidad;
    summaryQty.textContent = cantidad + 'x';
    const total = precio * cantidad;
    totalEl.textContent = formatPrice(total);
    addBtn.textContent = `Agregar al Carrito - ${formatPrice(total)}`;
  }

  document.getElementById('qtyMinus').addEventListener('click', () => {
    qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 1) - 1); updateTotal();
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    qtyInput.value = (parseInt(qtyInput.value) || 1) + 1; updateTotal();
  });
  qtyInput.addEventListener('change', updateTotal);
  document.getElementById('notas').addEventListener('input', e => { notas = e.target.value; });

  /* ── Agregar al carrito ── */
  addBtn.addEventListener('click', () => {
    if (agregando) return;
    agregando = true;
    addBtn.disabled = true;
    addBtn.textContent = 'Agregando…';

    const ingredientesQuitados = (producto.ingredientes || [])
      .filter(i => !seleccionados[i.id])
      .map(i => ({ id: i.id, nombre: i.nombre }));

    addItemToCart({
      id: producto.id,
      nombre: producto.nombre,
      slug: producto.slug || producto.id,
      precio,
      cantidad,
      notas,
      ingredientesQuitados,
      totalLinea: precio * cantidad
    });

    const msg = document.getElementById('successMsg');
    msg.textContent = '✅ Producto agregado al carrito';
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);

    agregando = false;
    addBtn.disabled = false;
    updateTotal();
  });
}

loadProduct();

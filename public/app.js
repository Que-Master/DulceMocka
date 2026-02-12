// public/app.js

const api = {
  categorias: '/api/categorias',
  productos: '/api/productos'
};

const $categories = document.getElementById('categories');
const $productsGrid = document.getElementById('productsGrid');
let categorias = [];
let productos = [];
let categoriaActiva = null;

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
    const url = categoriaId ? `${api.productos}?categoria=${categoriaId}` : api.productos;
    const res = await fetch(url);
    productos = await res.json();
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
    if ((categoriaActiva === null && btn.textContent === 'Todos') || btn.textContent === (categorias.find(c => c.id == categoriaActiva) || {}).nombre) {
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
    img.textContent = p.emoji || '🍬';
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

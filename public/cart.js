// public/cart.js
const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
function fmt(v){ return currency.format(Number(v)||0); }

function getCart(){ try{return JSON.parse(localStorage.getItem('cart'))||[];}catch{return [];} }
function saveCart(c){ localStorage.setItem('cart', JSON.stringify(c)); }

function renderCart(){
  const cart = getCart();
  const $body = document.getElementById('cartBody');
  $body.innerHTML = '';
  if(!cart || cart.length===0){
    $body.innerHTML = '<tr><td colspan="5">Tu carrito está vacío.</td></tr>';
    document.getElementById('subtotal').textContent = fmt(0);
    document.getElementById('total').textContent = fmt(0);
    return;
  }

  let subtotal = 0;
  cart.forEach((item, idx) => {
    const row = document.createElement('tr');
    const totalLine = (Number(item.precio)||0) * (Number(item.cantidad)||1);
    subtotal += totalLine;

    // ingredient badges for removed ingredients
    const removed = (item.ingredientesQuitados||[]).map(i=>`<span class="badge removed">Sin: ${i.nombre}</span>`).join(' ');
    const notes = item.notas ? `<div class="note">Notas: ${item.notas}</div>` : '';

    row.innerHTML = `
      <td>
        <div class="cart-prod-name">${item.nombre}</div>
        <div class="cart-meta">${removed}${notes}</div>
      </td>
      <td class="cart-price">${fmt(item.precio)}</td>
      <td class="cart-qty">
        <button class="qty-btn" data-idx="${idx}" data-op="minus">−</button>
        <input class="qty-input" data-idx="${idx}" value="${item.cantidad}" />
        <button class="qty-btn" data-idx="${idx}" data-op="plus">+</button>
      </td>
      <td class="cart-total">${fmt(totalLine)}</td>
      <td class="cart-actions"><button class="remove-btn" data-idx="${idx}">🗑</button></td>
    `;

    $body.appendChild(row);
  });

  document.getElementById('subtotal').textContent = fmt(subtotal);
  document.getElementById('total').textContent = fmt(subtotal - currentDiscount);

  // Update discount row
  if (currentDiscount > 0) {
    document.getElementById('discountRow').style.display = '';
    document.getElementById('discount').textContent = '-' + fmt(currentDiscount);
  } else {
    document.getElementById('discountRow').style.display = 'none';
  }

  // attach events
  document.querySelectorAll('.qty-btn').forEach(b=> b.addEventListener('click', onQtyBtn));
  document.querySelectorAll('.qty-input').forEach(i=> i.addEventListener('change', onQtyInput));
  document.querySelectorAll('.remove-btn').forEach(b=> b.addEventListener('click', onRemove));
}

function onQtyBtn(e){
  const idx = Number(e.currentTarget.dataset.idx);
  const op = e.currentTarget.dataset.op;
  const cart = getCart();
  if(!cart[idx]) return;
  let q = Number(cart[idx].cantidad)||1;
  if(op==='minus') q = Math.max(1, q-1);
  else q = q+1;
  cart[idx].cantidad = q;
  saveCart(cart);
  renderCart();
}

function onQtyInput(e){
  const idx = Number(e.currentTarget.dataset.idx);
  const cart = getCart();
  let q = parseInt(e.currentTarget.value) || 1;
  q = Math.max(1, q);
  cart[idx].cantidad = q;
  saveCart(cart);
  renderCart();
}

function onRemove(e){
  const idx = Number(e.currentTarget.dataset.idx);
  const cart = getCart();
  cart.splice(idx,1);
  saveCart(cart);
  renderCart();
}

document.getElementById('checkoutBtn').addEventListener('click', ()=>{
  const cart = getCart();
  if(!cart || cart.length===0) return alert('El carrito está vacío');
  // Save applied coupon to localStorage for checkout
  if (appliedCoupon) {
    localStorage.setItem('appliedCoupon', JSON.stringify(appliedCoupon));
  } else {
    localStorage.removeItem('appliedCoupon');
  }
  window.location.href = '/checkout.html';
});

/* ══════════════════════════════════════════
   CUPONES
   ══════════════════════════════════════════ */
let appliedCoupon = null;  // { id, codigo, nombre, porcentajeDescuento, limiteDescuento, minimoCompra }
let currentDiscount = 0;

// Restore coupon from localStorage if returning to cart
(function restoreCoupon() {
  try {
    const saved = JSON.parse(localStorage.getItem('appliedCoupon'));
    if (saved && saved.codigo) {
      // Re-validate
      revalidateCoupon(saved.codigo);
    }
  } catch (e) { /* ignore */ }
})();

async function revalidateCoupon(codigo) {
  const cart = getCart();
  let subtotal = 0;
  cart.forEach(it => { subtotal += (Number(it.precio)||0) * (Number(it.cantidad)||1); });

  try {
    const res = await fetch('/api/cupones/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, subtotal })
    });
    const data = await res.json();
    if (data.ok) {
      appliedCoupon = data.cupon;
      currentDiscount = data.descuento;
      showAppliedCoupon();
      renderCart();
    } else {
      localStorage.removeItem('appliedCoupon');
    }
  } catch (e) { /* ignore */ }
}

function showAppliedCoupon() {
  document.getElementById('couponInputRow').style.display = 'none';
  document.getElementById('couponAppliedRow').style.display = 'flex';
  document.getElementById('couponAppliedCode').textContent = appliedCoupon.codigo;
  document.getElementById('couponAppliedDesc').textContent = appliedCoupon.porcentajeDescuento + '% OFF — ' + appliedCoupon.nombre;
  document.getElementById('couponMsg').textContent = '';
  document.getElementById('couponMsg').className = 'coupon-msg';
}

function hideAppliedCoupon() {
  document.getElementById('couponInputRow').style.display = '';
  document.getElementById('couponAppliedRow').style.display = 'none';
  document.getElementById('couponInput').value = '';
  document.getElementById('couponMsg').textContent = '';
  document.getElementById('couponMsg').className = 'coupon-msg';
}

document.getElementById('applyCouponBtn').addEventListener('click', async () => {
  const msg = document.getElementById('couponMsg');
  const input = document.getElementById('couponInput');
  const codigo = input.value.trim();
  msg.textContent = '';
  msg.className = 'coupon-msg';

  if (!codigo) { msg.textContent = 'Ingresa un código'; msg.className = 'coupon-msg error'; return; }

  const cart = getCart();
  let subtotal = 0;
  cart.forEach(it => { subtotal += (Number(it.precio)||0) * (Number(it.cantidad)||1); });

  if (cart.length === 0) { msg.textContent = 'Agrega productos al carrito primero'; msg.className = 'coupon-msg error'; return; }

  try {
    const res = await fetch('/api/cupones/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, subtotal })
    });
    const data = await res.json();
    if (data.ok) {
      appliedCoupon = data.cupon;
      currentDiscount = data.descuento;
      showAppliedCoupon();
      renderCart();
      msg.textContent = '✓ Cupón aplicado: -' + fmt(currentDiscount);
      msg.className = 'coupon-msg success';
    } else {
      msg.textContent = data.error || 'Cupón no válido';
      msg.className = 'coupon-msg error';
    }
  } catch (e) {
    msg.textContent = 'Error de conexión';
    msg.className = 'coupon-msg error';
  }
});

document.getElementById('removeCouponBtn').addEventListener('click', () => {
  appliedCoupon = null;
  currentDiscount = 0;
  localStorage.removeItem('appliedCoupon');
  hideAppliedCoupon();
  renderCart();
});

renderCart();

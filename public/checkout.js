// public/checkout.js
const coCurrency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
function coFmt(v){ return coCurrency.format(Number(v)||0); }

function getCart(){ try{ return JSON.parse(localStorage.getItem('cart')) || []; }catch{ return []; } }

/* ── sectores cache (loaded once) ── */
let sectoresCache = [];

async function loadSectores(){
  const sel = document.getElementById('sector');
  if(!sel) return;
  sel.innerHTML = '<option value="">Cargando...</option>';
  try{
    const res = await fetch('/api/sectores');
    if(!res.ok) throw new Error('fetch');
    sectoresCache = await res.json();
    sel.innerHTML = '<option value="">Selecciona un sector</option>'
      + sectoresCache.map(s => `<option value="${s.id}" data-precio="${Number(s.precioEnvio||s.precio_envio||0)}">${s.nombre}</option>`).join('');
  }catch(e){ sel.innerHTML = '<option value="">No se pudieron cargar</option>'; }
}

/* ── show / hide delivery fields ── */
function updateDeliveryFields(){
  const delivery = document.querySelector('input[name="delivery"]:checked').value;
  document.getElementById('deliveryFields').style.display = delivery === 'domicilio' ? 'block' : 'none';
  if(delivery === 'domicilio' && sectoresCache.length === 0) loadSectores();
}
document.querySelectorAll('input[name="delivery"]').forEach(r => r.addEventListener('change', updateDeliveryFields));
updateDeliveryFields();

/* ── render summary from cart ── */
function renderSummary(){
  const cart = getCart();
  const $list = document.getElementById('summaryList');
  $list.innerHTML = '';
  if(!cart.length){ $list.innerHTML = '<p>Tu carrito está vacío.</p>'; document.getElementById('coSubtotal').textContent = coFmt(0); document.getElementById('coTotal').textContent = coFmt(0); return; }
  let subtotal = 0;
  cart.forEach(it => {
    const precio = Number(it.precio) || 0;
    const qty    = Number(it.cantidad) || 1;
    const lineTotal = precio * qty;
    subtotal += lineTotal;
    const removed = (it.ingredientesQuitados||[]).map(r => `<div class="badge removed">Sin: ${r.nombre}</div>`).join('');
    const notes   = it.notas ? `<div class="note">Nota: ${it.notas}</div>` : '';
    const d = document.createElement('div');
    d.className = 'summary-item';
    d.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px">${it.nombre} x${qty}</div>
      ${removed}${notes}
      <div style="color:#3b82f6;font-weight:700;margin-top:6px">${coFmt(lineTotal)}</div>
      <hr style="border:none;border-top:1px solid #f3f3f3;margin:10px 0"/>`;
    $list.appendChild(d);
  });
  document.getElementById('coSubtotal').textContent = coFmt(subtotal);
  document.getElementById('coTotal').textContent    = coFmt(subtotal);
}
renderSummary();

/* ── submit ── */
document.getElementById('checkoutForm').addEventListener('submit', function(e){
  e.preventDefault();

  // snapshot cart FIRST
  const cartItems = getCart();
  if(!cartItems.length){ alert('Tu carrito está vacío. Agrega productos antes de pedir.'); return; }

  const nombre   = document.getElementById('nombre').value.trim();
  const email    = document.getElementById('email').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const delivery = document.querySelector('input[name="delivery"]:checked').value;
  if(!nombre || !email || !telefono){ alert('Por favor completa los campos obligatorios'); return; }

  // compute subtotal from items
  let subtotalVal = 0;
  cartItems.forEach(it => { subtotalVal += (Number(it.precio)||0) * (Number(it.cantidad)||1); });

  // resolve shipping
  let shippingVal   = 0;
  let sectorNombre  = null;
  let deliveryAddress = null;

  if(delivery === 'domicilio'){
    const selEl = document.getElementById('sector');
    const sectorId = selEl ? selEl.value : null;
    if(sectorId){
      const opt = selEl.selectedOptions[0];
      sectorNombre = opt ? opt.textContent : null;
      // try data-attr first, then cache
      if(opt && opt.dataset.precio) shippingVal = Number(opt.dataset.precio) || 0;
      if(!shippingVal){
        const found = sectoresCache.find(s => String(s.id) === String(sectorId));
        if(found) shippingVal = Number(found.precioEnvio || found.precio_envio || 0);
      }
    }
    deliveryAddress = {
      calle:   document.getElementById('calle').value.trim(),
      numero:  document.getElementById('numero').value.trim(),
      sectorId: sectorId || null,
      sectorNombre: sectorNombre,
      precioEnvio: shippingVal,
      notas:   document.getElementById('direccionNotas').value.trim()
    };
  }

  const totalVal = subtotalVal + shippingVal;

  const order = {
    id:             'ord_' + Date.now(),
    numero:         'DSM-' + (Math.floor(Math.random()*900000)+100000),
    nombre, email, telefono, delivery,
    deliveryAddress,
    items:          cartItems,
    subtotalValue:  subtotalVal,
    shippingValue:  shippingVal,
    totalValue:     totalVal,
    createdAt:      new Date().toISOString()
  };

  console.log('[checkout] order saved:', JSON.stringify(order));

  // persist
  try{
    const orders = JSON.parse(localStorage.getItem('orders')||'[]');
    orders.push(order);
    localStorage.setItem('orders', JSON.stringify(orders));
    localStorage.removeItem('cart');
  }catch(err){ console.error(err); }

  const msg = document.getElementById('checkoutMsg');
  msg.style.display = 'block';
  msg.textContent = 'Pedido confirmado. Redirigiendo a la boleta...';
  setTimeout(()=>{ window.location.href = '/order.html?id=' + encodeURIComponent(order.id); }, 900);
});

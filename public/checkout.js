// public/checkout.js
const coCurrency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
function coFmt(v){ return coCurrency.format(Number(v)||0); }

function getCart(){ try{ return JSON.parse(localStorage.getItem('cart')) || []; }catch{ return []; } }

/* ── sectores cache (loaded once) ── */
let sectoresCache = [];
let savedAddresses = [];
let loggedInUser = null;
let usingSavedAddress = false;

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
    // If a saved address was already applied and has a sector, set it now
    if (usingSavedAddress && pendingSectorId) {
      sel.value = pendingSectorId;
      pendingSectorId = null;
      updateTotalWithShipping();
    }
  }catch(e){ sel.innerHTML = '<option value="">No se pudieron cargar</option>'; }
}
let pendingSectorId = null;

/* ── Load saved addresses for logged-in user ── */
async function loadUserAddresses(){
  try {
    const res = await fetch('/api/perfil/direcciones');
    if (!res.ok) return;
    const data = await res.json();
    savedAddresses = data.direcciones || data || [];
    if (savedAddresses.length === 0) return;

    const box = document.getElementById('savedAddressesBox');
    const sel = document.getElementById('savedAddressSelect');
    box.style.display = 'block';

    sel.innerHTML = '<option value="">Seleccionar dirección...</option>' +
      '<option value="_new">➕ Ingresar nueva dirección</option>' +
      savedAddresses.map(a => {
        const principal = a.esPrincipal ? ' ⭐' : '';
        const sName = a.sectorNombre || a.sector || '';
        const label = (a.calle || '') + ' ' + (a.numeroCasa || '') + (sName ? ', ' + sName : '') + principal;
        return '<option value="' + a.id + '"' + (a.esPrincipal ? ' selected' : '') + '>' + label + '</option>';
      }).join('');

    // Auto-select principal address
    const principal = savedAddresses.find(a => a.esPrincipal);
    if (principal) {
      applySavedAddress(principal);
    }

    sel.addEventListener('change', () => {
      const val = sel.value;
      if (val === '_new' || val === '') {
        usingSavedAddress = false;
        document.getElementById('manualAddressFields').style.display = 'block';
        document.getElementById('savedAddressPreview').style.display = 'none';
        clearAddressFields();
      } else {
        const addr = savedAddresses.find(a => a.id === val);
        if (addr) applySavedAddress(addr);
      }
    });

    document.getElementById('useNewAddressBtn').addEventListener('click', () => {
      sel.value = '_new';
      usingSavedAddress = false;
      document.getElementById('manualAddressFields').style.display = 'block';
      document.getElementById('savedAddressPreview').style.display = 'none';
      clearAddressFields();
    });
  } catch (e) { /* not logged in or error */ }
}

function applySavedAddress(addr) {
  usingSavedAddress = true;
  // Fill manual fields (hidden but used for submission)
  document.getElementById('calle').value = addr.calle || '';
  document.getElementById('numero').value = addr.numeroCasa || '';
  document.getElementById('direccionNotas').value = addr.nota || '';

  // Set sector in select
  if (addr.sectorId) {
    const sectorSel = document.getElementById('sector');
    let found = false;
    for (let i = 0; i < sectorSel.options.length; i++) {
      if (sectorSel.options[i].value === addr.sectorId) {
        sectorSel.value = addr.sectorId;
        found = true;
        break;
      }
    }
    if (!found) {
      // Sectors might not be loaded yet, save for later
      pendingSectorId = addr.sectorId;
    } else {
      updateTotalWithShipping();
    }
  }

  // Show preview, hide manual fields
  document.getElementById('manualAddressFields').style.display = 'none';
  const preview = document.getElementById('savedAddressPreview');
  preview.style.display = 'block';
  const sName = addr.sectorNombre || addr.sector || '';
  preview.innerHTML = '<strong>📍 ' + (addr.calle || '') + ' ' + (addr.numeroCasa || '') + '</strong>' +
    (sName ? '<br>Sector: ' + sName : '') +
    (addr.nota ? '<br><em>' + addr.nota + '</em>' : '');
}

function clearAddressFields() {
  document.getElementById('calle').value = '';
  document.getElementById('numero').value = '';
  document.getElementById('direccionNotas').value = '';
  document.getElementById('sector').selectedIndex = 0;
}

/* ── Auto-fill user data if logged in ── */
async function autoFillUserData() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.user) {
      loggedInUser = data.user;
      const nombreField = document.getElementById('nombre');
      const emailField = document.getElementById('email');
      const telField = document.getElementById('telefono');
      if (nombreField && !nombreField.value && data.user.nombre) nombreField.value = data.user.nombre;
      if (emailField && !emailField.value && data.user.email) emailField.value = data.user.email;
      // Fetch phone from profile
      try {
        const pRes = await fetch('/api/perfil');
        const pData = await pRes.json();
        if (pData.telefono && telField && !telField.value) telField.value = pData.telefono;
      } catch(_) {}
    }
  } catch (e) { /* not logged in */ }
}

/* ── show / hide delivery fields ── */
function updateDeliveryFields(){
  const delivery = document.querySelector('input[name="delivery"]:checked').value;
  document.getElementById('deliveryFields').style.display = delivery === 'domicilio' ? 'block' : 'none';
  if(delivery === 'domicilio') {
    if (sectoresCache.length === 0) loadSectores();
    if (loggedInUser && savedAddresses.length === 0) loadUserAddresses();
  }
}
document.querySelectorAll('input[name="delivery"]').forEach(r => r.addEventListener('change', updateDeliveryFields));

// Init: first auto-fill user data, then set up delivery fields
autoFillUserData().then(() => {
  updateDeliveryFields();
});

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

  // Check for applied coupon from cart
  let descuento = 0;
  const discountEl = document.getElementById('coDiscount');
  const discountRow = document.getElementById('coDiscountRow');
  try {
    const savedCoupon = JSON.parse(localStorage.getItem('appliedCoupon'));
    if (savedCoupon && savedCoupon.codigo) {
      checkoutCuponCodigo = savedCoupon.codigo;
      const porciento = Number(savedCoupon.porcentajeDescuento) || 0;
      const limite = Number(savedCoupon.limiteDescuento) || Infinity;
      descuento = Math.round((subtotal * porciento) / 100);
      if (descuento > limite) descuento = limite;
      if (discountRow) { discountRow.style.display = ''; }
      if (discountEl) { discountEl.textContent = '-' + coFmt(descuento); }
    } else {
      if (discountRow) discountRow.style.display = 'none';
    }
  } catch (e) {
    if (discountRow) discountRow.style.display = 'none';
  }

  checkoutSubtotal = subtotal;
  checkoutDescuento = descuento;
  updateTotalWithShipping();
}
let checkoutCuponCodigo = null;
let checkoutSubtotal = 0;
let checkoutDescuento = 0;

/* ── update shipping display & recalculate total ── */
function getShippingCost(){
  const delivery = document.querySelector('input[name="delivery"]:checked');
  if (!delivery || delivery.value !== 'domicilio') return 0;
  const selEl = document.getElementById('sector');
  const sectorId = selEl ? selEl.value : null;
  if (!sectorId) return 0;
  const opt = selEl.selectedOptions[0];
  if (opt && opt.dataset.precio) return Number(opt.dataset.precio) || 0;
  const found = sectoresCache.find(s => String(s.id) === String(sectorId));
  return found ? Number(found.precioEnvio || found.precio_envio || 0) : 0;
}

function updateTotalWithShipping(){
  const shipping = getShippingCost();
  const shippingRow = document.getElementById('coShippingRow');
  const shippingEl = document.getElementById('coShipping');
  if (shipping > 0) {
    if (shippingRow) shippingRow.style.display = '';
    if (shippingEl) shippingEl.textContent = coFmt(shipping);
  } else {
    if (shippingRow) shippingRow.style.display = 'none';
  }
  document.getElementById('coTotal').textContent = coFmt(checkoutSubtotal + shipping - checkoutDescuento);
}

// Listen for sector changes to update shipping
document.getElementById('sector').addEventListener('change', updateTotalWithShipping);
// Listen for delivery type changes
document.querySelectorAll('input[name="delivery"]').forEach(r => r.addEventListener('change', updateTotalWithShipping));

renderSummary();

/* ── submit ── */
document.getElementById('checkoutForm').addEventListener('submit', async function(e){
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
  let direccion     = null;

  if(delivery === 'domicilio'){
    const selEl = document.getElementById('sector');
    const sectorId = selEl ? selEl.value : null;
    if(sectorId){
      const opt = selEl.selectedOptions[0];
      if(opt && opt.dataset.precio) shippingVal = Number(opt.dataset.precio) || 0;
      if(!shippingVal){
        const found = sectoresCache.find(s => String(s.id) === String(sectorId));
        if(found) shippingVal = Number(found.precioEnvio || found.precio_envio || 0);
      }
    }
    direccion = {
      calle:    document.getElementById('calle').value.trim(),
      numero:   document.getElementById('numero').value.trim(),
      sectorId: sectorId || null,
      notas:    document.getElementById('direccionNotas').value.trim()
    };
  }

  const totalVal = subtotalVal + shippingVal;

  // Preparar items para el servidor
  const items = cartItems.map(it => ({
    productoId: it.id || null,
    nombre: it.nombre,
    precio: Number(it.precio) || 0,
    cantidad: Number(it.cantidad) || 1,
    notas: it.notas || '',
    ingredientesQuitados: it.ingredientesQuitados || []
  }));

  const msg = document.getElementById('checkoutMsg');
  msg.style.display = 'block';
  msg.textContent = 'Procesando pedido...';

  try {
    const res = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre, email, telefono, delivery,
        direccion,
        items,
        subtotal: subtotalVal,
        total: totalVal,
        cuponCodigo: checkoutCuponCodigo || null
      })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error || 'Error al crear pedido'; msg.style.color = '#ef4444'; return; }

    // Pedido creado exitosamente — limpiar carrito y cupón
    localStorage.removeItem('cart');
    localStorage.removeItem('appliedCoupon');

    msg.style.color = '#22c55e';
    msg.textContent = '¡Pedido confirmado! Número: ' + data.pedido.numeroPedido + '. Redirigiendo...';
    setTimeout(() => { window.location.href = '/order.html?id=' + encodeURIComponent(data.pedido.id); }, 1200);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Error de conexión al procesar el pedido.';
    msg.style.color = '#ef4444';
  }
});

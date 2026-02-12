// public/register.js
function showMsg(text, type){
  const el = document.getElementById('authMsg');
  el.textContent = text;
  el.className = 'auth-msg ' + type;
  el.style.display = 'block';
}

document.getElementById('registerForm').addEventListener('submit', async function(e){
  e.preventDefault();
  const nombre   = document.getElementById('nombre').value.trim();
  const email    = document.getElementById('email').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const password = document.getElementById('password').value;

  if(!nombre || !email || !password) return showMsg('Completa los campos obligatorios', 'error');
  if(password.length < 6) return showMsg('La contraseña debe tener al menos 6 caracteres', 'error');

  try{
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, telefono, password })
    });
    const data = await res.json();
    if(!res.ok) return showMsg(data.error || 'Error al crear cuenta', 'error');

    showMsg('Cuenta creada. Redirigiendo...', 'success');
    setTimeout(() => { window.location.href = '/'; }, 800);
  }catch(err){
    showMsg('Error de conexión', 'error');
  }
});

// Google OAuth
document.getElementById('googleBtn').addEventListener('click', function(){
  window.location.href = '/api/auth/google';
});

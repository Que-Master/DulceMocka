// public/login.js
function showMsg(text, type){
  const el = document.getElementById('authMsg');
  el.textContent = text;
  el.className = 'auth-msg ' + type;
  el.style.display = 'block';
}

// Email / password login
document.getElementById('loginForm').addEventListener('submit', async function(e){
  e.preventDefault();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if(!email || !password) return showMsg('Completa todos los campos', 'error');

  try{
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if(!res.ok) return showMsg(data.error || 'Error al iniciar sesión', 'error');

    showMsg('Bienvenido ' + (data.user.nombre || ''), 'success');
    const dest = data.user.rol === 'admin' ? '/admin.html' : '/';
    setTimeout(() => { window.location.href = dest; }, 800);
  }catch(err){
    showMsg('Error de conexión', 'error');
  }
});

// Google OAuth — redirect to server route
document.getElementById('googleBtn').addEventListener('click', function(){
  window.location.href = '/api/auth/google';
});

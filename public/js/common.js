async function api(path, options = {}) {
  const opts = { headers: { 'Content-Type': 'application/json' }, ...options };
  const r = await fetch(path, opts);
  if (r.status === 401) {
    window.location.href = '/login.html';
    return Promise.reject(new Error('No autenticado'));
  }
  if (!r.ok) {
    let msg = 'Error';
    try { msg = (await r.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

function money(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s) {
  if (!s) return '';
  const d = s.length <= 10 ? new Date(s + 'T00:00:00') : new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('es-AR');
}

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function renderNav(active) {
  const nav = `
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
      <div class="container">
        <a class="navbar-brand" href="/">Service CRM</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="nav">
          <ul class="navbar-nav me-auto">
            <li class="nav-item"><a class="nav-link ${active==='dashboard'?'active':''}" href="/">Dashboard</a></li>
            <li class="nav-item"><a class="nav-link ${active==='agenda'?'active':''}" href="/agenda.html">Agenda</a></li>
            <li class="nav-item"><a class="nav-link ${active==='clients'?'active':''}" href="/clients.html">Clientes</a></li>
            <li class="nav-item"><a class="nav-link ${active==='services'?'active':''}" href="/services.html">Servicios</a></li>
            <li class="nav-item"><a class="nav-link ${active==='quotes'?'active':''}" href="/quotes.html">Presupuestos</a></li>
          </ul>
          <button id="logoutBtn" class="btn btn-outline-light btn-sm">Salir</button>
        </div>
      </div>
    </nav>
  `;
  document.getElementById('nav-placeholder').outerHTML = nav;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
}

function catBadgeColor(cat) {
  const map = {
    'Jardinería': 'success',
    'Limpieza': 'info',
    'Fletes': 'warning',
    'Pintura': 'primary',
    'Otro': 'secondary'
  };
  return map[cat] || 'secondary';
}

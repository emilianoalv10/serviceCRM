// Componente reusable para el form de servicio (usado en services.html y agenda.html).
// Requiere: un modal #svcModal con form#svcForm y selects #clientSelect, #categorySelect, y un div #daySchedule opcional.
window.ServiceForm = (() => {
  let modal, form, clients = [], categories = [], onSaved = null, allServices = [];

  async function init(opts = {}) {
    onSaved = opts.onSaved || null;
    modal = new bootstrap.Modal(document.getElementById('svcModal'));
    form = document.getElementById('svcForm');

    [categories, clients, allServices] = await Promise.all([
      api('/api/services/categories'),
      api('/api/clients'),
      api('/api/services?sort=asc')
    ]);

    document.getElementById('categorySelect').innerHTML =
      categories.map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('clientSelect').innerHTML =
      '<option value="">— Seleccionar —</option>' +
      clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    form.addEventListener('submit', onSubmit);
    const dateInput = form.querySelector('[name="service_date"]');
    if (dateInput) dateInput.addEventListener('change', renderDaySchedule);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  }

  async function refreshAll() {
    allServices = await api('/api/services?sort=asc');
  }

  function renderDaySchedule() {
    const box = document.getElementById('daySchedule');
    if (!box) return;
    const date = form.service_date.value;
    if (!date) { box.innerHTML = ''; return; }
    const editingId = Number(form.id.value || 0);
    const sameDay = allServices
      .filter(s => s.service_date === date && s.id !== editingId)
      .sort((a, b) => (a.service_time || '99:99').localeCompare(b.service_time || '99:99'));
    if (!sameDay.length) {
      box.innerHTML = `<div class="alert alert-success py-2 px-3 small mb-0">📅 No hay otros servicios agendados ese día.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="alert alert-light border py-2 px-3 small mb-0">
        <div class="fw-semibold mb-1">📅 Agenda de ese día:</div>
        ${sameDay.map(s => `
          <div>
            <strong>${s.service_time || '— : —'}</strong> · ${escapeHtml(s.client_name)}
            <span class="text-muted">(${s.category})</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function openNew({ date, clientId } = {}) {
    await refreshAll();
    form.reset();
    form.id.value = '';
    form.service_date.value = date || new Date().toISOString().slice(0, 10);
    if (clientId) form.client_id.value = clientId;
    document.getElementById('svcModalTitle').textContent = 'Nuevo servicio';
    renderDaySchedule();
    modal.show();
  }

  async function openEdit(id) {
    await refreshAll();
    const s = await api('/api/services/' + id);
    form.id.value = s.id;
    form.client_id.value = s.client_id;
    form.category.value = s.category;
    form.service_date.value = s.service_date;
    if (form.service_time) form.service_time.value = s.service_time || '';
    form.description.value = s.description || '';
    form.price.value = s.price;
    form.paid.checked = !!s.paid;
    document.getElementById('svcModalTitle').textContent = 'Editar servicio';
    renderDaySchedule();
    modal.show();
  }

  async function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd);
    data.paid = fd.get('paid') ? 1 : 0;
    data.price = Number(data.price || 0);
    const id = data.id;
    delete data.id;
    try {
      if (id) await api('/api/services/' + id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/api/services', { method: 'POST', body: JSON.stringify(data) });
      modal.hide();
      if (onSaved) await onSaved();
    } catch (err) { alert(err.message); }
  }

  return { init, openNew, openEdit };
})();

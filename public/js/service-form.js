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
    if (dateInput) dateInput.addEventListener('change', () => { renderDaySchedule(); renderRecurrencePreview(); });
    const recInput = form.querySelector('[name="recurrence"]');
    const occInput = form.querySelector('[name="occurrences"]');
    if (recInput) recInput.addEventListener('change', renderRecurrencePreview);
    if (occInput) occInput.addEventListener('input', renderRecurrencePreview);
  }

  function addRecurrence(dateStr, kind, i) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (kind === 'weekly' || kind === 'biweekly') {
      const step = kind === 'weekly' ? 7 : 14;
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + step * i);
      return dt.toISOString().slice(0, 10);
    }
    if (kind === 'monthly') {
      const probe = new Date(Date.UTC(y, m - 1 + i, 1));
      const daysInMonth = new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth() + 1, 0)).getUTCDate();
      const day = Math.min(d, daysInMonth);
      return new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), day)).toISOString().slice(0, 10);
    }
    return dateStr;
  }

  function renderRecurrencePreview() {
    const row = document.getElementById('recurrenceRow');
    const preview = document.getElementById('recurrencePreview');
    if (!row || !preview) return;
    const isEditing = !!(form.id && form.id.value);
    row.style.display = isEditing ? 'none' : '';
    if (isEditing) { preview.innerHTML = ''; return; }
    const kind = form.recurrence.value;
    const date = form.service_date.value;
    if (!kind || !date) { preview.innerHTML = ''; return; }
    const count = Math.max(1, Math.min(52, Number(form.occurrences.value) || 1));
    if (count <= 1) { preview.innerHTML = ''; return; }
    const dates = [];
    const show = Math.min(count, 4);
    for (let i = 0; i < show; i++) dates.push(addRecurrence(date, kind, i));
    const last = addRecurrence(date, kind, count - 1);
    preview.innerHTML = `Se crearán <strong>${count}</strong> servicios: ${dates.map(d => fmtDate(d)).join(', ')}${count > show ? ` … hasta ${fmtDate(last)}` : ''}.`;
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
    if (form.recurrence) form.recurrence.value = '';
    if (form.occurrences) form.occurrences.value = 4;
    document.getElementById('svcModalTitle').textContent = 'Nuevo servicio';
    renderDaySchedule();
    renderRecurrencePreview();
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
    renderRecurrencePreview();
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
    if (id) {
      // al editar no se re-aplica la recurrencia, se actualiza solo ese servicio
      delete data.recurrence;
      delete data.occurrences;
    } else {
      if (!data.recurrence) { delete data.recurrence; delete data.occurrences; }
      else data.occurrences = Math.max(1, Math.min(52, Number(data.occurrences) || 1));
    }
    try {
      if (id) await api('/api/services/' + id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/api/services', { method: 'POST', body: JSON.stringify(data) });
      modal.hide();
      if (onSaved) await onSaved();
    } catch (err) { alert(err.message); }
  }

  return { init, openNew, openEdit };
})();

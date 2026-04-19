// Componente reusable para el form de servicio (usado en services.html y agenda.html).
// Requiere: un modal #svcModal con form#svcForm y selects #clientSelect, #categorySelect, y un div #daySchedule opcional.
window.ServiceForm = (() => {
  let modal, form, clients = [], categories = [], employees = [], onSaved = null, allServices = [];

  async function init(opts = {}) {
    onSaved = opts.onSaved || null;
    modal = new bootstrap.Modal(document.getElementById('svcModal'));
    form = document.getElementById('svcForm');

    [categories, clients, employees, allServices] = await Promise.all([
      api('/api/services/categories'),
      api('/api/clients'),
      api('/api/employees?active=1').catch(() => []),
      api('/api/services?sort=asc')
    ]);

    document.getElementById('categorySelect').innerHTML =
      categories.map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('clientSelect').innerHTML =
      '<option value="">— Seleccionar —</option>' +
      clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    const empSel = document.getElementById('employeeSelect');
    if (empSel) {
      empSel.innerHTML = '<option value="">Sin asignar</option>' +
        employees.map(e => `<option value="${e.id}">${escapeHtml(e.name)}${e.role ? ' · ' + escapeHtml(e.role) : ''}</option>`).join('');
    }

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

  async function openNew({ date, clientId, description, price, category, employeeId } = {}) {
    await refreshAll();
    form.reset();
    form.id.value = '';
    form.service_date.value = date || new Date().toISOString().slice(0, 10);
    if (clientId) form.client_id.value = clientId;
    if (category) form.category.value = category;
    if (description != null) form.description.value = description;
    if (price != null) form.price.value = price;
    if (employeeId && form.employee_id) form.employee_id.value = employeeId;
    if (form.recurrence) form.recurrence.value = '';
    if (form.occurrences) form.occurrences.value = 4;
    document.getElementById('svcModalTitle').textContent = 'Nuevo servicio';
    renderDaySchedule();
    renderRecurrencePreview();
    renderPhotos(null);
    renderShare(null);
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
    if (form.employee_id) form.employee_id.value = s.employee_id || '';
    document.getElementById('svcModalTitle').textContent = 'Editar servicio';
    renderDaySchedule();
    renderRecurrencePreview();
    renderPhotos(s);
    renderShare(s);
    modal.show();
  }

  function renderPhotos(service) {
    const box = document.getElementById('photoSection');
    if (!box) return;
    box.style.display = '';
    if (!service || !service.id) {
      box.innerHTML = `<hr class="my-3" /><div class="small text-muted">📷 Guardá primero el servicio para poder adjuntar fotos del <strong>antes</strong> y <strong>después</strong>.</div>`;
      return;
    }
    const before = (service.photos || []).filter(p => p.kind === 'before');
    const after = (service.photos || []).filter(p => p.kind === 'after');
    const isCompleted = !!service.completed;
    box.innerHTML = `
      <hr class="my-3" />
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong>Estado del trabajo</strong>
        <button type="button" class="btn btn-sm ${isCompleted ? 'btn-success' : 'btn-outline-success'}" id="toggleCompletedBtn">
          ${isCompleted ? '✓ Realizado' : 'Marcar como realizado'}
        </button>
      </div>

      <div class="mb-3">
        <label class="form-label small text-muted d-flex justify-content-between align-items-center">
          <span>Fotos ANTES <span class="badge text-bg-secondary ms-1">${before.length}</span></span>
          <span class="upload-status text-info" data-kind="before"></span>
        </label>
        ${renderPhotoGrid(before, service.photos || [])}
        <input type="file" class="form-control form-control-sm mt-2" accept="image/*" multiple id="beforeUpload" />
      </div>

      <div class="mb-3" style="${isCompleted ? '' : 'opacity:.5;'}">
        <label class="form-label small text-muted d-flex justify-content-between align-items-center">
          <span>Fotos DESPUÉS <span class="badge text-bg-secondary ms-1">${after.length}</span> ${!isCompleted ? '<em class="text-warning">(marcá como realizado)</em>' : ''}</span>
          <span class="upload-status text-info" data-kind="after"></span>
        </label>
        ${renderPhotoGrid(after, service.photos || [])}
        <input type="file" class="form-control form-control-sm mt-2" accept="image/*" multiple id="afterUpload" ${isCompleted ? '' : 'disabled'} />
      </div>
    `;
    document.getElementById('toggleCompletedBtn').addEventListener('click', async () => {
      await api(`/api/services/${service.id}/toggle-completed`, { method: 'POST' });
      const fresh = await api('/api/services/' + service.id);
      renderPhotos(fresh);
    });
    document.getElementById('beforeUpload').addEventListener('change', (e) => uploadPhotos(service.id, 'before', e.target));
    if (isCompleted) {
      const a = document.getElementById('afterUpload');
      if (a) a.addEventListener('change', (e) => uploadPhotos(service.id, 'after', e.target));
    }
    box.querySelectorAll('.photo-del').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePhoto(service.id, Number(b.dataset.id));
    }));
    box.querySelectorAll('.photo-thumb').forEach(el => el.addEventListener('click', (e) => {
      e.preventDefault();
      openViewer(service.photos || [], Number(el.dataset.id));
    }));
  }

  function renderPhotoGrid(photos, allPhotos) {
    if (!photos.length) return '<div class="small text-muted">— Sin fotos</div>';
    return `<div class="d-flex flex-wrap gap-2">${photos.map(p => `
      <div class="position-relative" style="width:96px;height:96px;">
        <a href="#" class="photo-thumb d-block" data-id="${p.id}">
          <img src="/api/uploads/${p.filename}" loading="lazy"
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'d-flex align-items-center justify-content-center text-danger small',style:'width:96px;height:96px;border:1px solid #f5c2c7;border-radius:6px;background:#f8d7da;',innerText:'⚠ no carga'}))"
            style="width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #dee2e6;" />
        </a>
        <button type="button" class="btn btn-sm btn-danger position-absolute photo-del" data-id="${p.id}" style="top:-6px;right:-6px;padding:0 6px;line-height:1.2;border-radius:50%;" title="Borrar">×</button>
      </div>
    `).join('')}</div>`;
  }

  async function uploadPhotos(serviceId, kind, input) {
    const files = input.files;
    if (!files || !files.length) return;
    const statusEl = document.querySelector(`.upload-status[data-kind="${kind}"]`);
    const showStatus = (txt, cls = 'text-info') => { if (statusEl) { statusEl.className = `upload-status ${cls}`; statusEl.textContent = txt; } };

    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('photos', f));
    const totalSize = Array.from(files).reduce((a, f) => a + f.size, 0);
    showStatus(`Subiendo ${files.length} archivo${files.length > 1 ? 's' : ''} (${(totalSize/1024/1024).toFixed(1)} MB)…`);
    input.disabled = true;
    try {
      const r = await fetch(`/api/services/${serviceId}/photos?kind=${kind}`, {
        method: 'POST',
        body: fd,
        credentials: 'same-origin'
      });
      const text = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) {}
      if (!r.ok) throw new Error((parsed && parsed.error) || text || `Error ${r.status}`);
      showStatus(`✓ ${parsed.length} subida${parsed.length > 1 ? 's' : ''}`, 'text-success');
      const fresh = await api('/api/services/' + serviceId);
      renderPhotos(fresh);
    } catch (err) {
      showStatus('✗ ' + err.message, 'text-danger');
      alert('Error al subir: ' + err.message);
    } finally {
      input.value = '';
    }
  }

  async function deletePhoto(serviceId, photoId) {
    if (!confirm('¿Borrar esta foto?')) return;
    await api(`/api/services/${serviceId}/photos/${photoId}`, { method: 'DELETE' });
    const fresh = await api('/api/services/' + serviceId);
    renderPhotos(fresh);
  }

  // ---------- share (WhatsApp) ----------
  function cleanPhone(p) {
    if (!p) return '';
    return String(p).replace(/[^\d+]/g, '').replace(/^\+/, '');
  }

  function waLink(phone, text) {
    const p = cleanPhone(phone);
    const url = 'https://wa.me/' + (p || '') + '?text=' + encodeURIComponent(text);
    return url;
  }

  function fmtDateEs(s) {
    if (!s) return '';
    const d = s.length <= 10 ? new Date(s + 'T00:00:00') : new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function buildClientMessage(s) {
    const lines = [
      '*Servicio agendado*',
      '',
      `Cliente: ${s.client_name}`,
      `Rubro: ${s.category}`,
      `Fecha: ${fmtDateEs(s.service_date)}${s.service_time ? ' a las ' + s.service_time + ' hs' : ''}`
    ];
    if (s.description) lines.push(`\nDetalle: ${s.description}`);
    if (s.price) lines.push(`Precio: $${Number(s.price).toLocaleString('es-AR')}`);
    if (s.employee_name) lines.push(`\nTe atiende: ${s.employee_name}`);
    lines.push('\n¡Cualquier duda me avisás!');
    return lines.join('\n');
  }

  function buildEmployeeMessage(s) {
    const lines = [
      '*Nuevo servicio asignado*',
      '',
      `Fecha: ${fmtDateEs(s.service_date)}${s.service_time ? ' a las ' + s.service_time + ' hs' : ''}`,
      `Rubro: ${s.category}`,
      '',
      `Cliente: ${s.client_name}`
    ];
    if (s.client_phone) lines.push(`Tel: ${s.client_phone}`);
    if (s.client_address) lines.push(`Dirección: ${s.client_address}`);
    if (s.client_map_url) lines.push(`Mapa: ${s.client_map_url}`);
    if (s.description) lines.push(`\nDetalle del trabajo:\n${s.description}`);
    if (s.price) lines.push(`\nPrecio acordado: $${Number(s.price).toLocaleString('es-AR')}`);
    return lines.join('\n');
  }

  function renderShare(service) {
    const box = document.getElementById('shareSection');
    if (!box) return;
    if (!service || !service.id) { box.innerHTML = ''; return; }
    const clientTxt = buildClientMessage(service);
    const empTxt = buildEmployeeMessage(service);
    const clientPhone = cleanPhone(service.client_phone);
    const empPhone = cleanPhone(service.employee_phone);
    box.innerHTML = `
      <hr class="my-3" />
      <div class="mb-2"><strong>📤 Compartir</strong></div>
      <div class="d-flex flex-wrap gap-2">
        <a class="btn btn-sm btn-success ${clientPhone ? '' : 'disabled'}" target="_blank" rel="noopener"
           href="${waLink(service.client_phone, clientTxt)}"
           ${clientPhone ? '' : 'title="El cliente no tiene teléfono cargado"'}>
          WhatsApp al cliente${clientPhone ? '' : ' (sin tel.)'}
        </a>
        <a class="btn btn-sm btn-success ${empPhone ? '' : 'disabled'}" target="_blank" rel="noopener"
           href="${waLink(service.employee_phone, empTxt)}"
           ${empPhone ? '' : 'title="El empleado no tiene teléfono cargado o no está asignado"'}>
          WhatsApp al empleado${service.employee_name ? '' : ' (sin asignar)'}
        </a>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="copyClientMsg">Copiar mensaje cliente</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="copyEmpMsg">Copiar mensaje empleado</button>
      </div>
    `;
    document.getElementById('copyClientMsg').addEventListener('click', () => copy(clientTxt, 'Mensaje para cliente copiado'));
    document.getElementById('copyEmpMsg').addEventListener('click', () => copy(empTxt, 'Mensaje para empleado copiado'));
  }

  async function copy(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      alert(okMsg || 'Copiado');
    } catch (e) {
      alert('No se pudo copiar. Copialo a mano:\n\n' + text);
    }
  }

  // ---------- viewer (lightbox) ----------
  let viewerPhotos = [];
  let viewerIndex = 0;
  let viewerModal = null;

  function ensureViewer() {
    if (document.getElementById('photoViewer')) return;
    const html = `
      <div class="modal fade" id="photoViewer" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-centered">
          <div class="modal-content bg-dark text-white">
            <div class="modal-header border-0 py-2">
              <span class="small" id="viewerCounter"></span>
              <span class="small ms-3" id="viewerKind"></span>
              <button type="button" class="btn-close btn-close-white ms-auto" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body position-relative p-0 text-center" style="min-height: 60vh;">
              <button id="viewerPrev" class="btn btn-light position-absolute top-50 start-0 translate-middle-y ms-2" style="opacity:.7;z-index:2;">‹</button>
              <img id="viewerImg" style="max-height:80vh;max-width:100%;object-fit:contain;" />
              <button id="viewerNext" class="btn btn-light position-absolute top-50 end-0 translate-middle-y me-2" style="opacity:.7;z-index:2;">›</button>
            </div>
            <div class="modal-footer border-0 py-2 justify-content-center">
              <a id="viewerOpen" href="#" target="_blank" rel="noopener" class="btn btn-sm btn-outline-light">Abrir original</a>
            </div>
          </div>
        </div>
      </div>`;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    document.body.appendChild(wrapper.firstElementChild);
    viewerModal = new bootstrap.Modal(document.getElementById('photoViewer'));
    document.getElementById('viewerPrev').addEventListener('click', () => step(-1));
    document.getElementById('viewerNext').addEventListener('click', () => step(1));
    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('photoViewer').classList.contains('show')) return;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });
  }

  function openViewer(photos, photoId) {
    ensureViewer();
    viewerPhotos = photos;
    viewerIndex = Math.max(0, photos.findIndex(p => p.id === photoId));
    updateViewer();
    viewerModal.show();
  }

  function step(d) {
    if (!viewerPhotos.length) return;
    viewerIndex = (viewerIndex + d + viewerPhotos.length) % viewerPhotos.length;
    updateViewer();
  }

  function updateViewer() {
    const p = viewerPhotos[viewerIndex];
    if (!p) return;
    const url = `/api/uploads/${p.filename}`;
    document.getElementById('viewerImg').src = url;
    document.getElementById('viewerOpen').href = url;
    document.getElementById('viewerCounter').textContent = `${viewerIndex + 1} / ${viewerPhotos.length}`;
    document.getElementById('viewerKind').textContent = p.kind === 'before' ? '📷 Antes' : '✅ Después';
    const many = viewerPhotos.length > 1;
    document.getElementById('viewerPrev').style.display = many ? '' : 'none';
    document.getElementById('viewerNext').style.display = many ? '' : 'none';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd);
    data.paid = fd.get('paid') ? 1 : 0;
    data.price = Number(data.price || 0);
    if (data.employee_id === '') data.employee_id = null;
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

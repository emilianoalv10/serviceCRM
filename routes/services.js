const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const CATEGORIES = ['Jardinería', 'Limpieza', 'Fletes', 'Pintura', 'Otro'];
const UPLOADS_DIR = db.UPLOADS_DIR;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10).toLowerCase();
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes'));
  }
});

router.get('/categories', (req, res) => res.json(CATEGORIES));

function sanitizeTime(t) {
  if (!t) return null;
  const s = String(t).trim();
  if (!s) return null;
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return s;
}

const RECURRENCE = { weekly: 7, biweekly: 14, monthly: null };

function addRecurrence(dateStr, kind, i) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (kind === 'weekly' || kind === 'biweekly') {
    const step = RECURRENCE[kind];
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + step * i);
    return dt.toISOString().slice(0, 10);
  }
  if (kind === 'monthly') {
    const targetMonth = m - 1 + i;
    const probe = new Date(Date.UTC(y, targetMonth, 1));
    const daysInMonth = new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth() + 1, 0)).getUTCDate();
    const day = Math.min(d, daysInMonth);
    const dt = new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), day));
    return dt.toISOString().slice(0, 10);
  }
  return dateStr;
}

router.get('/', (req, res) => {
  const { client_id, category, paid, from, to, sort } = req.query;
  const where = [];
  const params = [];
  if (client_id) { where.push('s.client_id = ?'); params.push(client_id); }
  if (category) { where.push('s.category = ?'); params.push(category); }
  if (paid === '0' || paid === '1') { where.push('s.paid = ?'); params.push(Number(paid)); }
  if (from) { where.push('s.service_date >= ?'); params.push(from); }
  if (to) { where.push('s.service_date <= ?'); params.push(to); }
  const order = sort === 'asc'
    ? 'ORDER BY s.service_date ASC, s.service_time ASC, s.id ASC'
    : 'ORDER BY s.service_date DESC, s.service_time DESC, s.id DESC';
  const sql = `
    SELECT s.*, c.name AS client_name
    FROM services s
    JOIN clients c ON c.id = s.client_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ${order}
  `;
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT s.*, c.name AS client_name
    FROM services s JOIN clients c ON c.id = s.client_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  row.photos = db.prepare('SELECT id, kind, filename, original_name, size, uploaded_at FROM service_photos WHERE service_id = ? ORDER BY uploaded_at ASC').all(req.params.id);
  res.json(row);
});

router.post('/', (req, res) => {
  const { client_id, category, description, service_date, service_time, price, paid, recurrence, occurrences } = req.body;
  if (!client_id) return res.status(400).json({ error: 'Cliente obligatorio' });
  if (!category) return res.status(400).json({ error: 'Categoría obligatoria' });
  if (!service_date) return res.status(400).json({ error: 'Fecha obligatoria' });

  const priceNum = Number(price) || 0;
  const paidNum = paid ? 1 : 0;
  const time = sanitizeTime(service_time);

  const recKind = recurrence && RECURRENCE.hasOwnProperty(recurrence) ? recurrence : null;
  const count = recKind ? Math.max(1, Math.min(52, Number(occurrences) || 1)) : 1;

  const insert = db.prepare(`
    INSERT INTO services (client_id, category, description, service_date, service_time, price, paid, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const date = recKind ? addRecurrence(service_date, recKind, i) : service_date;
      const paidAt = paidNum ? new Date().toISOString() : null;
      const info = insert.run(client_id, category, description || null, date, time, priceNum, paidNum, paidAt);
      ids.push(info.lastInsertRowid);
    }
    return ids;
  });

  const ids = insertMany();
  const rows = db.prepare(`SELECT * FROM services WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  res.status(201).json(count === 1 ? rows[0] : { created: rows.length, services: rows });
});

router.put('/:id', (req, res) => {
  const { client_id, category, description, service_date, service_time, price, paid } = req.body;
  const current = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'No encontrado' });
  const paidNum = paid ? 1 : 0;
  let paidAt = current.paid_at;
  if (paidNum && !current.paid) paidAt = new Date().toISOString();
  if (!paidNum) paidAt = null;
  db.prepare(`
    UPDATE services SET client_id = ?, category = ?, description = ?, service_date = ?, service_time = ?, price = ?, paid = ?, paid_at = ?
    WHERE id = ?
  `).run(
    client_id || current.client_id,
    category || current.category,
    description ?? current.description,
    service_date || current.service_date,
    service_time !== undefined ? sanitizeTime(service_time) : current.service_time,
    price !== undefined ? Number(price) : current.price,
    paidNum,
    paidAt,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id));
});

router.post('/:id/toggle-paid', (req, res) => {
  const current = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'No encontrado' });
  const newPaid = current.paid ? 0 : 1;
  const paidAt = newPaid ? new Date().toISOString() : null;
  db.prepare('UPDATE services SET paid = ?, paid_at = ? WHERE id = ?').run(newPaid, paidAt, req.params.id);
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id));
});

router.post('/:id/toggle-completed', (req, res) => {
  const current = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'No encontrado' });
  const newCompleted = current.completed ? 0 : 1;
  const completedAt = newCompleted ? new Date().toISOString() : null;
  db.prepare('UPDATE services SET completed = ?, completed_at = ? WHERE id = ?').run(newCompleted, completedAt, req.params.id);
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id));
});

router.get('/:id/photos', (req, res) => {
  const rows = db.prepare('SELECT id, kind, filename, original_name, size, uploaded_at FROM service_photos WHERE service_id = ? ORDER BY uploaded_at ASC').all(req.params.id);
  res.json(rows);
});

router.post('/:id/photos', upload.array('photos', 20), (req, res) => {
  const kind = req.query.kind === 'after' ? 'after' : 'before';
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!service) {
    (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
    return res.status(404).json({ error: 'Servicio no encontrado' });
  }
  if (kind === 'after' && !service.completed) {
    (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
    return res.status(400).json({ error: 'Marcá el servicio como realizado antes de subir fotos "después"' });
  }
  const stmt = db.prepare(`INSERT INTO service_photos (service_id, kind, filename, original_name, size) VALUES (?, ?, ?, ?, ?)`);
  const created = (req.files || []).map(f => {
    const info = stmt.run(req.params.id, kind, f.filename, f.originalname, f.size);
    return { id: info.lastInsertRowid, kind, filename: f.filename, original_name: f.originalname, size: f.size };
  });
  res.status(201).json(created);
});

router.delete('/:id/photos/:photoId', (req, res) => {
  const photo = db.prepare('SELECT * FROM service_photos WHERE id = ? AND service_id = ?').get(req.params.photoId, req.params.id);
  if (!photo) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM service_photos WHERE id = ?').run(photo.id);
  try { fs.unlinkSync(path.join(UPLOADS_DIR, photo.filename)); } catch (e) {}
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const photos = db.prepare('SELECT filename FROM service_photos WHERE service_id = ?').all(req.params.id);
  const info = db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  photos.forEach(p => { try { fs.unlinkSync(path.join(UPLOADS_DIR, p.filename)); } catch (e) {} });
  res.json({ ok: true });
});

module.exports = router;

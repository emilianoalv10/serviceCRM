const express = require('express');
const db = require('../db');

const router = express.Router();

const CATEGORIES = ['Jardinería', 'Limpieza', 'Fletes', 'Pintura', 'Otro'];

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
  res.json(row);
});

router.post('/', (req, res) => {
  const { client_id, category, description, service_date, service_time, price, paid } = req.body;
  if (!client_id) return res.status(400).json({ error: 'Cliente obligatorio' });
  if (!category) return res.status(400).json({ error: 'Categoría obligatoria' });
  if (!service_date) return res.status(400).json({ error: 'Fecha obligatoria' });
  const priceNum = Number(price) || 0;
  const paidNum = paid ? 1 : 0;
  const paidAt = paidNum ? new Date().toISOString() : null;
  const info = db.prepare(`
    INSERT INTO services (client_id, category, description, service_date, service_time, price, paid, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client_id, category, description || null, service_date, sanitizeTime(service_time), priceNum, paidNum, paidAt);
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid));
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

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM services s WHERE s.client_id = c.id) AS services_count,
        (SELECT COALESCE(SUM(price), 0) FROM services s WHERE s.client_id = c.id) AS total_billed,
        (SELECT COALESCE(SUM(price), 0) FROM services s WHERE s.client_id = c.id AND s.paid = 0) AS total_pending
      FROM clients c
      WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?
      ORDER BY c.name COLLATE NOCASE
    `).all(like, like, like);
  } else {
    rows = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM services s WHERE s.client_id = c.id) AS services_count,
        (SELECT COALESCE(SUM(price), 0) FROM services s WHERE s.client_id = c.id) AS total_billed,
        (SELECT COALESCE(SUM(price), 0) FROM services s WHERE s.client_id = c.id AND s.paid = 0) AS total_pending
      FROM clients c
      ORDER BY c.name COLLATE NOCASE
    `).all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'No encontrado' });
  const services = db.prepare('SELECT * FROM services WHERE client_id = ? ORDER BY service_date DESC').all(req.params.id);
  res.json({ ...client, services });
});

function sanitizeMapUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

router.post('/', (req, res) => {
  const { name, phone, email, address, map_url, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const info = db.prepare(`
    INSERT INTO clients (name, phone, email, address, map_url, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name.trim(), phone || null, email || null, address || null, sanitizeMapUrl(map_url), notes || null);
  const created = db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(created);
});

router.put('/:id', (req, res) => {
  const { name, phone, email, address, map_url, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const info = db.prepare(`
    UPDATE clients SET name = ?, phone = ?, email = ?, address = ?, map_url = ?, notes = ?
    WHERE id = ?
  `).run(name.trim(), phone || null, email || null, address || null, sanitizeMapUrl(map_url), notes || null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;

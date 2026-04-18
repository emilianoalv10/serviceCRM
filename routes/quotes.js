const express = require('express');
const db = require('../db');

const router = express.Router();

const STATUSES = ['pending', 'approved', 'rejected'];

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(`
      SELECT * FROM quotes
      WHERE prospect_name LIKE ? OR work_requested LIKE ?
      ORDER BY quote_date DESC, id DESC
    `).all(like, like);
  } else {
    rows = db.prepare('SELECT * FROM quotes ORDER BY quote_date DESC, id DESC').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { prospect_name, work_requested, amount, quote_date, status } = req.body;
  if (!prospect_name || !prospect_name.trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
  if (!quote_date) return res.status(400).json({ error: 'Fecha obligatoria' });
  const finalStatus = STATUSES.includes(status) ? status : 'pending';
  const info = db.prepare(`
    INSERT INTO quotes (prospect_name, work_requested, amount, quote_date, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(prospect_name.trim(), work_requested || null, Number(amount) || 0, quote_date, finalStatus);
  res.status(201).json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { prospect_name, work_requested, amount, quote_date, status } = req.body;
  if (!prospect_name || !prospect_name.trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
  if (!quote_date) return res.status(400).json({ error: 'Fecha obligatoria' });
  const current = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'No encontrado' });
  const finalStatus = STATUSES.includes(status) ? status : current.status;
  db.prepare(`
    UPDATE quotes SET prospect_name = ?, work_requested = ?, amount = ?, quote_date = ?, status = ?
    WHERE id = ?
  `).run(prospect_name.trim(), work_requested || null, Number(amount) || 0, quote_date, finalStatus, req.params.id);
  res.json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id));
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  const info = db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;

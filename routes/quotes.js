const express = require('express');
const db = require('../db');

const router = express.Router();

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
  const { prospect_name, work_requested, amount, quote_date } = req.body;
  if (!prospect_name || !prospect_name.trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
  if (!quote_date) return res.status(400).json({ error: 'Fecha obligatoria' });
  const info = db.prepare(`
    INSERT INTO quotes (prospect_name, work_requested, amount, quote_date)
    VALUES (?, ?, ?, ?)
  `).run(prospect_name.trim(), work_requested || null, Number(amount) || 0, quote_date);
  res.status(201).json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { prospect_name, work_requested, amount, quote_date } = req.body;
  if (!prospect_name || !prospect_name.trim()) return res.status(400).json({ error: 'Nombre obligatorio' });
  if (!quote_date) return res.status(400).json({ error: 'Fecha obligatoria' });
  const info = db.prepare(`
    UPDATE quotes SET prospect_name = ?, work_requested = ?, amount = ?, quote_date = ?
    WHERE id = ?
  `).run(prospect_name.trim(), work_requested || null, Number(amount) || 0, quote_date, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;

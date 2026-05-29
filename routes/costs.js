const express = require('express');
const db = require('../db');

const router = express.Router();

const CATEGORIES = ['Insumos', 'Combustible', 'Sueldos', 'Herramientas', 'Movilidad', 'Otro'];

router.get('/categories', (req, res) => res.json(CATEGORIES));

router.get('/', (req, res) => {
  const { category, from, to } = req.query;
  const where = [];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  if (from) { where.push('cost_date >= ?'); params.push(from); }
  if (to) { where.push('cost_date <= ?'); params.push(to); }
  const sql = `
    SELECT * FROM costs
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY cost_date DESC, id DESC
  `;
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM costs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { cost_date, category, description, amount } = req.body;
  if (!cost_date) return res.status(400).json({ error: 'Fecha obligatoria' });
  if (!category) return res.status(400).json({ error: 'Rubro obligatorio' });
  const info = db.prepare(`
    INSERT INTO costs (cost_date, category, description, amount)
    VALUES (?, ?, ?, ?)
  `).run(cost_date, category, description || null, Number(amount) || 0);
  res.status(201).json(db.prepare('SELECT * FROM costs WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { cost_date, category, description, amount } = req.body;
  if (!cost_date) return res.status(400).json({ error: 'Fecha obligatoria' });
  if (!category) return res.status(400).json({ error: 'Rubro obligatorio' });
  const info = db.prepare(`
    UPDATE costs SET cost_date = ?, category = ?, description = ?, amount = ?
    WHERE id = ?
  `).run(cost_date, category, description || null, Number(amount) || 0, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(db.prepare('SELECT * FROM costs WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM costs WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const onlyActive = req.query.active === '1';
  const sql = `
    SELECT e.*,
      (SELECT COUNT(*) FROM services s WHERE s.employee_id = e.id) AS services_count
    FROM employees e
    ${onlyActive ? 'WHERE e.active = 1' : ''}
    ORDER BY e.active DESC, e.name COLLATE NOCASE
  `;
  res.json(db.prepare(sql).all());
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { name, phone, role, notes, active } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const info = db.prepare(`
    INSERT INTO employees (name, phone, role, notes, active)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), phone || null, role || null, notes || null, active === 0 ? 0 : 1);
  res.status(201).json(db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, phone, role, notes, active } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const info = db.prepare(`
    UPDATE employees SET name = ?, phone = ?, role = ?, notes = ?, active = ?
    WHERE id = ?
  `).run(name.trim(), phone || null, role || null, notes || null, active ? 1 : 0, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  // desasignar servicios primero
  db.prepare('UPDATE services SET employee_id = NULL WHERE employee_id = ?').run(req.params.id);
  const info = db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/summary', (req, res) => {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS services_count,
      COALESCE(SUM(price), 0) AS total_billed,
      COALESCE(SUM(CASE WHEN paid = 1 THEN price ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN paid = 0 THEN price ELSE 0 END), 0) AS total_pending
    FROM services
  `).get();

  const clientsCount = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;

  const byCategory = db.prepare(`
    SELECT category,
      COUNT(*) AS count,
      COALESCE(SUM(price), 0) AS total,
      COALESCE(SUM(CASE WHEN paid = 1 THEN price ELSE 0 END), 0) AS paid,
      COALESCE(SUM(CASE WHEN paid = 0 THEN price ELSE 0 END), 0) AS pending
    FROM services
    GROUP BY category
    ORDER BY total DESC
  `).all();

  const byMonth = db.prepare(`
    SELECT substr(service_date, 1, 7) AS month,
      COUNT(*) AS count,
      COALESCE(SUM(price), 0) AS total,
      COALESCE(SUM(CASE WHEN paid = 1 THEN price ELSE 0 END), 0) AS paid
    FROM services
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all();

  const topClients = db.prepare(`
    SELECT c.id, c.name,
      COUNT(s.id) AS services_count,
      COALESCE(SUM(s.price), 0) AS total_billed,
      COALESCE(SUM(CASE WHEN s.paid = 0 THEN s.price ELSE 0 END), 0) AS total_pending
    FROM clients c
    LEFT JOIN services s ON s.client_id = c.id
    GROUP BY c.id
    HAVING services_count > 0
    ORDER BY total_billed DESC
    LIMIT 5
  `).all();

  const pendingClients = db.prepare(`
    SELECT c.id, c.name,
      COUNT(s.id) AS pending_count,
      COALESCE(SUM(s.price), 0) AS total_pending
    FROM clients c
    JOIN services s ON s.client_id = c.id
    WHERE s.paid = 0
    GROUP BY c.id
    ORDER BY total_pending DESC
    LIMIT 10
  `).all();

  res.json({
    totals: { ...totals, clients_count: clientsCount },
    by_category: byCategory,
    by_month: byMonth.reverse(),
    top_clients: topClients,
    pending_clients: pendingClients
  });
});

module.exports = router;

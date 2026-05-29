const express = require('express');
const db = require('../db');

const router = express.Router();

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function startOfWeek(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay(); // 0=Dom, 1=Lun, ...
  const diff = (day + 6) % 7; // Lunes = 0
  dt.setDate(dt.getDate() - diff);
  return dt;
}

function addDays(d, n) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  dt.setDate(dt.getDate() + n);
  return dt;
}

function rangeTotals(from, to) {
  return db.prepare(`
    SELECT
      COUNT(*) AS count,
      COALESCE(SUM(price), 0) AS billed,
      COALESCE(SUM(CASE WHEN paid = 1 THEN price ELSE 0 END), 0) AS paid
    FROM services
    WHERE service_date >= ? AND service_date <= ?
  `).get(from, to);
}

router.get('/summary', (req, res) => {
  const todayD = new Date();
  const startThisMonth = new Date(todayD.getFullYear(), todayD.getMonth(), 1);
  const endNextMonth = new Date(todayD.getFullYear(), todayD.getMonth() + 2, 0);
  const pendingFrom = toISO(startThisMonth);
  const pendingTo = toISO(endNextMonth);

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS services_count,
      COALESCE(SUM(price), 0) AS total_billed,
      COALESCE(SUM(CASE WHEN paid = 1 THEN price ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN paid = 0 AND service_date >= ? AND service_date <= ? THEN price ELSE 0 END), 0) AS total_pending
    FROM services
  `).get(pendingFrom, pendingTo);

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

  // Comparación semanal (lun-dom)
  const today = new Date();
  const thisWeekStart = startOfWeek(today);
  const thisWeekEnd = addDays(thisWeekStart, 6);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const lastWeekEnd = addDays(thisWeekStart, -1);
  // Mismo día de la semana de la semana pasada (para comparación parcial)
  const dayOffset = Math.floor((today - thisWeekStart) / 86400000);
  const lastWeekSameDow = addDays(lastWeekStart, dayOffset);

  const thisWeek = rangeTotals(toISO(thisWeekStart), toISO(today));
  const thisWeekFull = rangeTotals(toISO(thisWeekStart), toISO(thisWeekEnd));
  const lastWeek = rangeTotals(toISO(lastWeekStart), toISO(lastWeekEnd));
  const lastWeekToSameDow = rangeTotals(toISO(lastWeekStart), toISO(lastWeekSameDow));

  const nextWeekStart = addDays(thisWeekStart, 7);
  const nextWeekEnd = addDays(thisWeekStart, 13);
  const nextWeek = rangeTotals(toISO(nextWeekStart), toISO(nextWeekEnd));

  // Resultado del mes (ingresos - gastos)
  const startThisMonthStr = toISO(startThisMonth);
  const endThisMonth = new Date(todayD.getFullYear(), todayD.getMonth() + 1, 0);
  const endThisMonthStr = toISO(endThisMonth);
  const incomeThisMonth = db.prepare(`
    SELECT
      COALESCE(SUM(price), 0) AS billed,
      COALESCE(SUM(CASE WHEN paid = 1 THEN price ELSE 0 END), 0) AS paid
    FROM services
    WHERE service_date >= ? AND service_date <= ?
  `).get(startThisMonthStr, endThisMonthStr);
  const costsThisMonth = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM costs
    WHERE cost_date >= ? AND cost_date <= ?
  `).get(startThisMonthStr, endThisMonthStr).total;

  res.json({
    totals: { ...totals, clients_count: clientsCount, pending_from: pendingFrom, pending_to: pendingTo },
    by_category: byCategory,
    by_month: byMonth.reverse(),
    top_clients: topClients,
    pending_clients: pendingClients,
    weekly_compare: {
      this_week: {
        from: toISO(thisWeekStart),
        to: toISO(today),
        to_full: toISO(thisWeekEnd),
        ...thisWeek,
        billed_full: thisWeekFull.billed,
        paid_full: thisWeekFull.paid
      },
      last_week: { from: toISO(lastWeekStart), to: toISO(lastWeekEnd), ...lastWeek },
      last_week_to_same_dow: { from: toISO(lastWeekStart), to: toISO(lastWeekSameDow), ...lastWeekToSameDow },
      next_week: { from: toISO(nextWeekStart), to: toISO(nextWeekEnd), ...nextWeek }
    },
    month_result: {
      from: startThisMonthStr,
      to: endThisMonthStr,
      income_billed: incomeThisMonth.billed,
      income_paid: incomeThisMonth.paid,
      costs: costsThisMonth,
      result_billed: incomeThisMonth.billed - costsThisMonth,
      result_paid: incomeThisMonth.paid - costsThisMonth
    }
  });
});

module.exports = router;

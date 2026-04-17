require('dotenv').config();
const db = require('./db');

const existing = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
if (existing > 0 && !process.argv.includes('--force')) {
  console.log(`Ya hay ${existing} clientes. Usá 'node seed.js --force' para agregar igual.`);
  process.exit(0);
}

const clients = [
  { name: 'María González',  phone: '11-2345-6789', email: 'maria@mail.com',  address: 'Av. Siempreviva 742',     notes: 'Quincena par.' },
  { name: 'Carlos Fernández', phone: '11-3456-7890', email: 'carlos@mail.com', address: 'Belgrano 1020',            notes: 'Paga en efectivo.' },
  { name: 'Lucía Rodríguez',  phone: '11-4567-8901', email: 'lucia@mail.com',  address: 'San Martín 300',           notes: '' },
  { name: 'Diego Pérez',      phone: '11-5678-9012', email: 'diego@mail.com',  address: 'Rivadavia 5500, 3° A',     notes: 'Oficina.' },
  { name: 'Ana Martínez',     phone: '11-6789-0123', email: 'ana@mail.com',    address: 'Libertador 2200',          notes: 'Casa con jardín grande.' }
];

const insertClient = db.prepare(`INSERT INTO clients (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)`);
const clientIds = clients.map(c => insertClient.run(c.name, c.phone, c.email, c.address, c.notes).lastInsertRowid);

const today = new Date();
function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const services = [
  { cid: 0, category: 'Jardinería', description: 'Corte de pasto y poda',     date: daysAgo(2),   time: '09:00', price: 18000, paid: 1 },
  { cid: 0, category: 'Jardinería', description: 'Mantenimiento mensual',     date: daysAgo(32),  time: '09:00', price: 18000, paid: 1 },
  { cid: 1, category: 'Limpieza',   description: 'Limpieza profunda cocina',  date: daysAgo(5),   time: '14:00', price: 25000, paid: 0 },
  { cid: 1, category: 'Pintura',    description: 'Pintura living + comedor',  date: daysAgo(40),  time: '08:00', price: 180000, paid: 1 },
  { cid: 2, category: 'Fletes',     description: 'Mudanza chica',             date: daysAgo(10),  time: '10:30', price: 45000, paid: 0 },
  { cid: 2, category: 'Limpieza',   description: 'Limpieza post obra',        date: daysAgo(70),  time: '13:00', price: 60000, paid: 1 },
  { cid: 3, category: 'Pintura',    description: 'Retoque frente oficina',    date: daysAgo(1),   time: '16:00', price: 35000, paid: 0 },
  { cid: 3, category: 'Limpieza',   description: 'Limpieza semanal',          date: daysAgo(8),   time: '11:00', price: 15000, paid: 1 },
  { cid: 3, category: 'Limpieza',   description: 'Limpieza semanal',          date: daysAgo(15),  time: '11:00', price: 15000, paid: 1 },
  { cid: 3, category: 'Limpieza',   description: 'Limpieza semanal',          date: daysAgo(22),  time: '11:00', price: 15000, paid: 0 },
  { cid: 4, category: 'Jardinería', description: 'Diseño y plantado',         date: daysAgo(95),  time: '09:30', price: 120000, paid: 1 },
  { cid: 4, category: 'Jardinería', description: 'Corte + riego',             date: daysAgo(12),  time: '08:30', price: 22000, paid: 0 },
  { cid: 4, category: 'Fletes',     description: 'Traslado de macetas',       date: daysAgo(3),   time: '15:00', price: 12000, paid: 0 },
  { cid: 0, category: 'Jardinería', description: 'Poda programada',           date: daysAgo(-3),  time: '10:00', price: 20000, paid: 0 },
  { cid: 4, category: 'Limpieza',   description: 'Limpieza programada',       date: daysAgo(-5),  time: '14:00', price: 18000, paid: 0 }
];

const insertSvc = db.prepare(`
  INSERT INTO services (client_id, category, description, service_date, service_time, price, paid, paid_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

services.forEach(s => {
  const paidAt = s.paid ? new Date().toISOString() : null;
  insertSvc.run(clientIds[s.cid], s.category, s.description, s.date, s.time, s.price, s.paid, paidAt);
});

console.log(`Seed OK: ${clients.length} clientes y ${services.length} servicios creados.`);

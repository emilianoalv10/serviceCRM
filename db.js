const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'crm.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    map_url TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    service_date TEXT NOT NULL,
    service_time TEXT,
    price REAL NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 0,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_services_client ON services(client_id);
  CREATE INDEX IF NOT EXISTS idx_services_date ON services(service_date);
  CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
`);

// Migraciones idempotentes para bases ya existentes
const clientColumns = db.prepare('PRAGMA table_info(clients)').all().map(r => r.name);
if (!clientColumns.includes('map_url')) {
  db.exec('ALTER TABLE clients ADD COLUMN map_url TEXT');
}

const serviceColumns = db.prepare('PRAGMA table_info(services)').all().map(r => r.name);
if (!serviceColumns.includes('service_time')) {
  db.exec('ALTER TABLE services ADD COLUMN service_time TEXT');
}

module.exports = db;

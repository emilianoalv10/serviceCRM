const fs = require('fs');
const path = require('path');
const db = require('./db');

const KEEP = 2;
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // chequear cada hora si toca

const BACKUP_DIR = path.join(path.dirname(db.UPLOADS_DIR), 'backups');

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('crm-') && f.endsWith('.db'))
    .map(f => {
      const p = path.join(BACKUP_DIR, f);
      const st = fs.statSync(p);
      return { name: f, size: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function rotate() {
  const all = listBackups();
  const toDelete = all.slice(KEEP);
  toDelete.forEach(b => {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch (e) {}
  });
}

async function runBackup() {
  ensureDir();
  const ts = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
  const filename = `crm-${ts}.db`;
  const target = path.join(BACKUP_DIR, filename);
  await db.backup(target);
  rotate();
  const st = fs.statSync(target);
  return { filename, size: st.size, created_at: st.mtime.toISOString() };
}

function lastBackupTime() {
  const all = listBackups();
  return all.length ? new Date(all[0].created_at) : null;
}

async function maybeBackup() {
  const last = lastBackupTime();
  if (!last || (Date.now() - last.getTime()) >= BACKUP_INTERVAL_MS) {
    try {
      const info = await runBackup();
      console.log(`[backup] creado: ${info.filename} (${(info.size/1024).toFixed(1)} KB)`);
    } catch (e) {
      console.error('[backup] falló:', e.message);
    }
  }
}

function start() {
  // primer chequeo demorado para no bloquear el arranque
  setTimeout(maybeBackup, 30 * 1000);
  setInterval(maybeBackup, CHECK_INTERVAL_MS);
}

module.exports = { start, runBackup, listBackups, lastBackupTime, BACKUP_DIR, KEEP, BACKUP_INTERVAL_MS };

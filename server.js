require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.redirect('/login.html');
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    req.session.user = username;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Credenciales inválidas' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ user: req.session.user });
  res.status(401).json({ error: 'No autenticado' });
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use('/api', requireAuth);
app.get('/api/uploads/:filename', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const db = require('./db');
  if (!/^[a-f0-9]{32}\.[a-z0-9]{1,10}$/i.test(req.params.filename)) {
    return res.status(400).json({ error: 'Nombre inválido' });
  }
  const full = path.join(db.UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'No encontrado' });
  res.sendFile(full);
});
app.use('/api/clients', require('./routes/clients'));
app.use('/api/services', require('./routes/services'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/analytics', require('./routes/analytics'));

app.get(['/', '/index.html', '/clients.html', '/services.html', '/agenda.html', '/quotes.html'], requireAuth, (req, res, next) => {
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/diagnostics', requireAuth, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'crm.db');
  let size = null, exists = false, writable = false;
  try { const st = fs.statSync(dbPath); exists = true; size = st.size; } catch (e) {}
  try { fs.accessSync(path.dirname(dbPath), fs.constants.W_OK); writable = true; } catch (e) {}
  const clients = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
  const services = db.prepare('SELECT COUNT(*) AS n FROM services').get().n;
  const photos = db.prepare('SELECT COUNT(*) AS n FROM service_photos').get().n;

  const uploadsDir = db.UPLOADS_DIR;
  let uploadsExists = false, uploadsFiles = 0, uploadsOrphans = 0, uploadsMissing = 0;
  try { uploadsExists = fs.existsSync(uploadsDir); } catch (e) {}
  let fileList = [];
  if (uploadsExists) {
    try { fileList = fs.readdirSync(uploadsDir); uploadsFiles = fileList.length; } catch (e) {}
  }
  const dbFilenames = new Set(db.prepare('SELECT filename FROM service_photos').all().map(r => r.filename));
  uploadsOrphans = fileList.filter(f => !dbFilenames.has(f)).length;
  uploadsMissing = [...dbFilenames].filter(f => !fileList.includes(f)).length;

  res.json({
    db_path: dbPath,
    db_file_exists: exists,
    db_file_bytes: size,
    db_dir_writable: writable,
    warning: dbPath.startsWith('/data/') ? null : '⚠ DB_PATH no apunta a /data/ — los datos NO son persistentes',
    clients,
    services,
    photos_in_db: photos,
    uploads_dir: uploadsDir,
    uploads_dir_exists: uploadsExists,
    uploads_files_on_disk: uploadsFiles,
    uploads_orphan_files: uploadsOrphans,
    uploads_missing_files: uploadsMissing
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`Service CRM escuchando en puerto ${PORT}`);
});

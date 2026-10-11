const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const sanitizeHtml = require('sanitize-html');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Store } = require('./lib/store');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const IS_PROD = process.env.NODE_ENV === 'production';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const store = new Store(DATA_DIR);
const db = store.data;

// ---------------------------------------------------------------------------
// Tajný klíč pro podepisování cookies a heslo administrátora
// ---------------------------------------------------------------------------
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const COOKIE_SECRET =
  process.env.COOKIE_SECRET ||
  (fs.existsSync(SECRET_FILE)
    ? fs.readFileSync(SECRET_FILE, 'utf8').trim()
    : (() => {
        const s = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
        return s;
      })());

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

if (!db.admin.passwordHash) {
  const initial = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  db.admin.passwordHash = hashPassword(initial);
  store.flush();
  if (!process.env.ADMIN_PASSWORD) {
    fs.writeFileSync(path.join(DATA_DIR, 'INITIAL_ADMIN_PASSWORD.txt'), initial + '\n', { mode: 0o600 });
    console.log('\n==============================================');
    console.log(' Výchozí heslo do administrace: ' + initial);
    console.log(' (uloženo také v data/INITIAL_ADMIN_PASSWORD.txt)');
    console.log(' Heslo změníte v Administraci → Nastavení.');
    console.log('==============================================\n');
  }
}

// ---------------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------------
const newId = () => crypto.randomBytes(9).toString('base64url');
const now = () => new Date().toISOString();
const str = (v, max = 10000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const NEWS_SANITIZE = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'a',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'img', 'span', 'iframe', 'hr', 'sub', 'sup',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    iframe: ['src', 'frameborder', 'allowfullscreen', 'allow'],
    span: ['style'],
    p: ['style'],
    h1: ['style'], h2: ['style'], h3: ['style'],
    '*': ['class'],
  },
  allowedClasses: { '*': [/^ql-(align|indent|size|font|video)-?[\w-]*$/, 'ql-video'] },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i],
      'text-align': [/^(left|right|center|justify)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
    }),
  },
};

const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg' };

// Obrázky vložené do editoru jako base64 (kopírování / přetažení) uloží jako soubory.
function extractDataImages(html) {
  return html.replace(/src="data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)"/g, (m, mime, b64) => {
    const name = newId() + IMAGE_EXT[mime];
    fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(b64, 'base64'));
    return `src="/uploads/${name}"`;
  });
}

function cleanNewsHtml(html) {
  return sanitizeHtml(extractDataImages(String(html || '')), NEWS_SANITIZE);
}

function excerptOf(html, len = 180) {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? text.slice(0, len).replace(/\s\S*$/, '') + '…' : text;
}

function firstImage(html) {
  const m = /<img[^>]+src="([^"]+)"/.exec(html || '');
  return m ? m[1] : '';
}

function publicNews(n) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    excerpt: excerptOf(n.content),
    image: n.cover || firstImage(n.content),
    pinned: !!n.pinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

function sortedNews(list) {
  return [...list].sort((a, b) => (b.pinned - a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

// Jednoduchý limiter (paměťový) – brání spamu a hádání hesla.
function rateLimiter(windowMs, max) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (key) => {
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    return n <= max;
  };
}
const loginLimit = rateLimiter(15 * 60 * 1000, 10);
const joinLimit = rateLimiter(60 * 60 * 1000, 20);
const messageLimit = rateLimiter(60 * 1000, 20);

// ---------------------------------------------------------------------------
// Aplikace
// ---------------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '30mb' }));
app.use(cookieParser(COOKIE_SECRET));

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const cookieBase = { httpOnly: true, sameSite: 'lax', secure: IS_PROD, signed: true };

// --- Autentizace administrátora --------------------------------------------
const ADMIN_COOKIE = 'cv_admin';
const ADMIN_TTL = 7 * 24 * 3600 * 1000;

function isAdmin(req) {
  const v = req.signedCookies[ADMIN_COOKIE];
  if (!v) return false;
  const [tag, exp, ver] = String(v).split(':');
  // "ver" zneplatní staré přihlášení po změně hesla.
  return tag === 'admin' && Number(exp) > Date.now() && ver === db.admin.passwordHash.slice(0, 8);
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Nejste přihlášeni.' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (!loginLimit(req.ip)) return res.status(429).json({ error: 'Příliš mnoho pokusů. Zkuste to za chvíli.' });
  if (!verifyPassword(str(req.body.password, 200), db.admin.passwordHash)) {
    return res.status(401).json({ error: 'Špatné heslo.' });
  }
  const value = `admin:${Date.now() + ADMIN_TTL}:${db.admin.passwordHash.slice(0, 8)}`;
  res.cookie(ADMIN_COOKIE, value, { ...cookieBase, maxAge: ADMIN_TTL, path: '/' });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req) }));

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { current, next: nextPw } = req.body;
  if (!verifyPassword(str(current, 200), db.admin.passwordHash)) {
    return res.status(400).json({ error: 'Současné heslo nesouhlasí.' });
  }
  if (str(nextPw, 200).length < 6) return res.status(400).json({ error: 'Nové heslo musí mít alespoň 6 znaků.' });
  db.admin.passwordHash = hashPassword(str(nextPw, 200));
  store.save();
  fs.rmSync(path.join(DATA_DIR, 'INITIAL_ADMIN_PASSWORD.txt'), { force: true });
  const value = `admin:${Date.now() + ADMIN_TTL}:${db.admin.passwordHash.slice(0, 8)}`;
  res.cookie(ADMIN_COOKIE, value, { ...cookieBase, maxAge: ADMIN_TTL, path: '/' });
  res.json({ ok: true });
});

// --- Nahrávání obrázků (včetně GIFů) ---------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, newId() + (IMAGE_EXT[file.mimetype] || '')),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  // SVG jen pro logo; ostatní obrázky (JPG, PNG, GIF, WEBP) kdekoli.
  fileFilter: (req, file, cb) =>
    cb(null, file.mimetype in IMAGE_EXT && (file.mimetype !== 'image/svg+xml' || req.query.logo === '1')),
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Soubor je větší než 15 MB.' : 'Nahrání selhalo.' });
    if (!req.file) return res.status(400).json({ error: 'Podporované jsou obrázky JPG, PNG, GIF a WEBP.' });
    res.json({ url: '/uploads/' + req.file.filename });
  });
});

// --- Veřejná data webu -----------------------------------------------------
app.get('/api/site', (req, res) => {
  const { settings } = db;
  res.json({
    settings,
    news: sortedNews(db.news.filter((n) => n.published)).map(publicNews),
  });
});

// --- Aktuality (administrace) ----------------------------------------------
app.get('/api/admin/news', requireAdmin, (req, res) => {
  res.json(sortedNews(db.news).map((n) => ({ ...publicNews(n), cover: n.cover || '', published: n.published })));
});

function newsFromBody(body) {
  return {
    title: str(body.title, 200) || 'Bez názvu',
    content: cleanNewsHtml(body.content),
    cover: /^\/uploads\/[\w-]+\.\w+$/.test(body.cover || '') ? body.cover : '',
    published: body.published !== false,
    pinned: !!body.pinned,
  };
}

app.post('/api/admin/news', requireAdmin, (req, res) => {
  const item = { id: newId(), ...newsFromBody(req.body), createdAt: now(), updatedAt: now() };
  db.news.push(item);
  store.save();
  res.json({ ...publicNews(item), cover: item.cover, published: item.published });
});

app.put('/api/admin/news/:id', requireAdmin, (req, res) => {
  const item = db.news.find((n) => n.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Aktualita nenalezena.' });
  Object.assign(item, newsFromBody(req.body), { updatedAt: now() });
  store.save();
  res.json({ ...publicNews(item), cover: item.cover, published: item.published });
});

app.delete('/api/admin/news/:id', requireAdmin, (req, res) => {
  const i = db.news.findIndex((n) => n.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Aktualita nenalezena.' });
  db.news.splice(i, 1);
  store.save();
  res.json({ ok: true });
});

// --- Nastavení webu --------------------------------------------------------
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const b = req.body;
  const s = db.settings;
  const url = (v) => (/^https?:\/\//i.test(str(v)) ? str(v, 500) : '');
  const img = (v, fallback) => (/^\/(uploads|img)\/[\w.-]+$/.test(v || '') ? v : fallback);
  Object.assign(s, {
    siteName: str(b.siteName, 100) || s.siteName,
    tagline: str(b.tagline, 300),
    about: cleanNewsHtml(b.about),
    contactEmail: str(b.contactEmail, 200),
    contactPhone: str(b.contactPhone, 50),
    address: str(b.address, 300),
    trainingTimes: str(b.trainingTimes, 1000),
    facebookUrl: url(b.facebookUrl),
    instagramUrl: url(b.instagramUrl),
    logo: img(b.logo, '/img/logo.svg'),
    heroImage: img(b.heroImage, ''),
  });
  store.save();
  res.json(s);
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
// Jméno a e‑mail se ukládají na serveru (data/db.json). Prohlížeč dostane jen
// podepsanou httpOnly cookie s ID uživatele – JavaScript na stránce ji nepřečte
// a nelze ji podvrhnout.
const USER_COOKIE = 'cv_user';
const USER_TTL = 365 * 24 * 3600 * 1000;
const MAX_MESSAGES_PER_GROUP = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function chatUser(req) {
  const id = req.signedCookies[USER_COOKIE];
  return id && db.users[id] ? db.users[id] : null;
}

function requireUser(req, res, next) {
  const user = chatUser(req);
  if (!user) return res.status(401).json({ error: 'Nejdřív zadejte jméno a e‑mail.' });
  req.user = user;
  next();
}

app.get('/api/chat/me', (req, res) => {
  const u = chatUser(req);
  res.json(u ? { name: u.name, email: u.email } : null);
});

app.post('/api/chat/join', (req, res) => {
  if (!joinLimit(req.ip)) return res.status(429).json({ error: 'Příliš mnoho pokusů, zkuste to později.' });
  const name = str(req.body.name, 40);
  const email = str(req.body.email, 200).toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: 'Zadejte jméno (alespoň 2 znaky).' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Zadejte platný e‑mail.' });
  if (!req.body.consent) return res.status(400).json({ error: 'Je potřeba souhlas se zpracováním údajů.' });

  let user = chatUser(req);
  if (user) {
    Object.assign(user, { name, email, lastSeen: now() });
  } else {
    user = { id: newId(), name, email, createdAt: now(), lastSeen: now() };
    db.users[user.id] = user;
  }
  store.save();
  res.cookie(USER_COOKIE, user.id, { ...cookieBase, maxAge: USER_TTL, path: '/' });
  res.json({ name: user.name, email: user.email });
});

app.post('/api/chat/leave', (req, res) => {
  res.clearCookie(USER_COOKIE, { path: '/' });
  res.json({ ok: true });
});

const publicGroup = (g) => ({
  id: g.id,
  name: g.name,
  description: g.description,
  messageCount: (db.messages[g.id] || []).length,
  lastMessageAt: (db.messages[g.id] || []).at(-1)?.createdAt || null,
});

app.get('/api/chat/groups', (req, res) => {
  res.json(db.groups.map(publicGroup));
});

app.get('/api/chat/groups/:id/messages', requireUser, (req, res) => {
  if (!db.groups.some((g) => g.id === req.params.id)) return res.status(404).json({ error: 'Skupina neexistuje.' });
  res.json((db.messages[req.params.id] || []).slice(-100).map(publicMessage));
});

const publicMessage = (m) => ({ id: m.id, name: m.name, text: m.text, createdAt: m.createdAt, userId: m.userId, admin: !!m.admin });

// --- Živé aktualizace přes Server‑Sent Events ------------------------------
const streams = new Map(); // groupId -> Set<res>

function broadcast(groupId, event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of streams.get(groupId) || []) res.write(data);
}

function broadcastAll(event, payload) {
  for (const id of streams.keys()) broadcast(id, event, payload);
}

app.get('/api/chat/groups/:id/stream', requireUser, (req, res) => {
  const id = req.params.id;
  if (!db.groups.some((g) => g.id === id)) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: {"me":"${req.user.id}"}\n\n`);
  if (!streams.has(id)) streams.set(id, new Set());
  streams.get(id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    streams.get(id)?.delete(res);
  });
});

function addMessage(groupId, msg) {
  const list = (db.messages[groupId] ||= []);
  list.push(msg);
  if (list.length > MAX_MESSAGES_PER_GROUP) list.splice(0, list.length - MAX_MESSAGES_PER_GROUP);
  store.save();
  broadcast(groupId, 'message', publicMessage(msg));
}

app.post('/api/chat/groups/:id/messages', requireUser, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: 'Skupina neexistuje.' });
  if (!messageLimit(req.user.id)) return res.status(429).json({ error: 'Píšete moc rychle, chvilku počkejte.' });
  const text = str(req.body.text, 1000);
  if (!text) return res.status(400).json({ error: 'Zpráva je prázdná.' });
  req.user.lastSeen = now();
  const msg = { id: newId(), userId: req.user.id, name: req.user.name, text, createdAt: now() };
  addMessage(group.id, msg);
  res.json(publicMessage(msg));
});

// --- Chat (administrace) ---------------------------------------------------
app.get('/api/admin/groups', requireAdmin, (req, res) => res.json(db.groups.map(publicGroup)));

app.post('/api/admin/groups', requireAdmin, (req, res) => {
  const name = str(req.body.name, 60);
  if (!name) return res.status(400).json({ error: 'Zadejte název skupiny.' });
  const group = { id: newId(), name, description: str(req.body.description, 200), createdAt: now() };
  db.groups.push(group);
  db.messages[group.id] = [];
  store.save();
  res.json(publicGroup(group));
});

app.put('/api/admin/groups/:id', requireAdmin, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: 'Skupina neexistuje.' });
  group.name = str(req.body.name, 60) || group.name;
  group.description = str(req.body.description, 200);
  store.save();
  res.json(publicGroup(group));
});

app.delete('/api/admin/groups/:id', requireAdmin, (req, res) => {
  const i = db.groups.findIndex((g) => g.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Skupina neexistuje.' });
  const [group] = db.groups.splice(i, 1);
  delete db.messages[group.id];
  store.save();
  broadcast(group.id, 'group-deleted', { id: group.id });
  for (const r of streams.get(group.id) || []) r.end();
  streams.delete(group.id);
  res.json({ ok: true });
});

app.get('/api/admin/groups/:id/messages', requireAdmin, (req, res) => {
  res.json((db.messages[req.params.id] || []).map((m) => ({
    ...publicMessage(m),
    email: m.admin ? '' : db.users[m.userId]?.email || '',
  })));
});

app.post('/api/admin/groups/:id/messages', requireAdmin, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: 'Skupina neexistuje.' });
  const text = str(req.body.text, 1000);
  if (!text) return res.status(400).json({ error: 'Zpráva je prázdná.' });
  const msg = { id: newId(), userId: 'admin', name: db.settings.siteName, text, createdAt: now(), admin: true };
  addMessage(group.id, msg);
  res.json(publicMessage(msg));
});

app.delete('/api/admin/groups/:gid/messages/:mid', requireAdmin, (req, res) => {
  const list = db.messages[req.params.gid] || [];
  const i = list.findIndex((m) => m.id === req.params.mid);
  if (i < 0) return res.status(404).json({ error: 'Zpráva nenalezena.' });
  list.splice(i, 1);
  store.save();
  broadcast(req.params.gid, 'message-deleted', { id: req.params.mid });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Statické soubory
// ---------------------------------------------------------------------------
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d',
  setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"),
}));
app.use('/vendor/quill', express.static(path.join(__dirname, 'node_modules', 'quill', 'dist'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Nenalezeno.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'Obsah je příliš velký.' : 'Chyba serveru.' });
});

const server = app.listen(PORT, () => console.log(`Crazy Vranovice běží na http://localhost:${PORT}`));

function shutdown() {
  store.flush();
  for (const set of streams.values()) for (const r of set) r.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

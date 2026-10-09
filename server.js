'use strict';
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'abdulazeezmustapha3156@gmail.com').trim().toLowerCase();
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC_KEY || '';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const SUB_PRICE = Number(process.env.SUBSCRIPTION_PRICE_NGN || 1000);
const SUB_DAYS = Number(process.env.SUBSCRIPTION_DAYS || 30);

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[warn] JWT_SECRET is not set. Using a temporary secret: everyone is logged out on each restart.');
}

const CATEGORIES = ['Clothing', 'Accessories', 'Gadgets', 'Services', 'Other'];
const FEED_PAGE_SIZE = 6;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads'); // public images
const PRIVATE_DIR = path.join(ROOT, 'private'); // premium PDFs: never served statically
[DATA_DIR, UPLOAD_DIR, PRIVATE_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

/* ------------------------------------------------------------------ */
/* Tiny JSON-file database (swap for Postgres/Mongo when you scale)    */
/* ------------------------------------------------------------------ */
const DB_FILE = path.join(DATA_DIR, 'db.json');

const defaults = () => ({
  users: [],
  listings: [],
  library: [],
  banners: [],
  payments: [],
  stats: { total: 0, byDay: {} },
  settings: {
    founder: {
      name: 'Abdulazeez Mustapha',
      title: 'Founder, Skillverse',
      bio: 'Abdulazeez Mustapha is the founder of Skillverse, an app for learning digital skills and trading with people around you.',
      vision: 'One place where you learn a skill, then sell what you make.',
      whatsapp: process.env.ADMIN_PHONE || '',
      email: ADMIN_EMAIL,
      telegram: process.env.TELEGRAM_CHANNEL_URL || '',
      community: process.env.WHATSAPP_COMMUNITY_URL || '',
    },
  },
  seeded: false,
});

let db = defaults();
try {
  const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db = { ...db, ...saved, settings: { founder: { ...db.settings.founder, ...((saved.settings || {}).founder || {}) } } };
} catch (_) {
  /* first run */
}

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const isHttpOrHash = (u) => u === '' || /^https?:\/\/\S+$/i.test(u) || /^#[a-z]+$/i.test(u);

const roleOf = (u) => (String(u.email).toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user');
const isSubscribed = (u) =>
  roleOf(u) === 'admin' || (!!u.subscriptionUntil && new Date(u.subscriptionUntil) > new Date());

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: roleOf(u),
  subscribed: isSubscribed(u),
  subscriptionUntil: u.subscriptionUntil || null,
});

function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '234' + d.slice(1);
  else if (d.length === 10) d = '234' + d;
  return d;
}

const findUser = (id) => db.users.find((u) => u.id === id);
const signToken = (u) => jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: '30d' });

function removeFile(dir, name) {
  if (!name) return;
  fs.unlink(path.join(dir, path.basename(name)), () => {});
}

/* ------------------------------------------------------------------ */
/* Seed: admin account + welcome banner (first run only)               */
/* ------------------------------------------------------------------ */
(function seed() {
  if (!db.users.some((u) => u.email === ADMIN_EMAIL)) {
    let pw = process.env.ADMIN_PASSWORD;
    let generated = false;
    if (!pw || pw.length < 8) {
      pw = crypto.randomBytes(9).toString('base64url');
      generated = true;
    }
    db.users.push({
      id: uid(),
      name: 'Abdulazeez Mustapha',
      email: ADMIN_EMAIL,
      phone: process.env.ADMIN_PHONE || '',
      passHash: bcrypt.hashSync(pw, 11),
      createdAt: nowIso(),
    });
    console.log(`[admin] Created admin account ${ADMIN_EMAIL}`);
    if (generated) console.log(`[admin] Temporary password (shown once): ${pw}`);
  }
  if (!db.seeded) {
    db.banners.push({
      id: uid(),
      title: 'Learn it. Make it. Sell it.',
      text: 'Premium e-books and courses, plus a marketplace where members sell to each other.',
      cta: 'Browse the library',
      link: '#library',
      createdAt: nowIso(),
    });
    db.seeded = true;
  }
  save();
})();

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */
function listingOut(l) {
  const s = findUser(l.sellerId);
  const verified = !!s && roleOf(s) === 'admin';
  return {
    kind: 'listing',
    id: l.id,
    title: l.title,
    description: l.description,
    price: l.price,
    category: l.category,
    image: l.image,
    status: l.status,
    verified,
    featured: !!l.featured || verified,
    featuredFlag: !!l.featured,
    seller: { id: l.sellerId, name: s ? s.name : 'Member', whatsapp: s ? waNumber(s.phone) : '' },
    createdAt: l.createdAt,
  };
}

const libraryOut = (b) => ({
  kind: 'library',
  id: b.id,
  type: b.type,
  title: b.title,
  description: b.description,
  cover: b.cover,
  premium: !!b.premium,
  verified: true,
  featured: true,
  createdAt: b.createdAt,
});

const bannerOut = (b) => ({ kind: 'banner', id: b.id, title: b.title, text: b.text, cta: b.cta, link: b.link });

/* ------------------------------------------------------------------ */
/* Feed algorithm: admin / featured content gets 2 of every 3 slots     */
/* ------------------------------------------------------------------ */
function weave(P, R, B) {
  const pools = { P, R, B };
  const idx = { P: 0, R: 0, B: 0 };
  const out = [];
  let c = 0;
  while (idx.P < P.length || idx.R < R.length || idx.B < B.length) {
    const pref = c % 6 === 5 ? ['B', 'P', 'R'] : c % 3 === 2 ? ['R', 'P', 'B'] : ['P', 'R', 'B'];
    const pick = pref.find((k) => idx[k] < pools[k].length);
    out.push(pools[pick][idx[pick]++]);
    c++;
  }
  return out;
}

const newest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

function feedOrder(filter) {
  const f = String(filter || 'all').toLowerCase();
  let listings = db.listings.filter((l) => l.status === 'approved');
  let library = db.library.slice();
  let banners = db.banners.slice();

  if (f === 'ebook' || f === 'course') {
    listings = [];
    library = library.filter((x) => x.type === f);
    banners = [];
  } else if (f !== 'all') {
    listings = listings.filter((l) => l.category.toLowerCase() === f);
    library = [];
    banners = [];
  }

  const L = listings.map(listingOut);
  const P = [...L.filter((x) => x.verified || x.featured), ...library.map(libraryOut)].sort(newest);
  const R = L.filter((x) => !(x.verified || x.featured)).sort(newest);
  return weave(P, R, banners.sort(newest).map(bannerOut));
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const clientError = (msg) => Object.assign(new Error(msg), { status: 400, expose: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === 'pdf' ? PRIVATE_DIR : UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (EXT[file.mimetype] || '')),
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'pdf') {
    return file.mimetype === 'application/pdf' ? cb(null, true) : cb(clientError('The e-book must be a PDF file.'));
  }
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    ? cb(null, true)
    : cb(clientError('Images must be JPG, PNG or WebP.'));
};

const uploadImage = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const uploadLibrary = multer({ storage, fileFilter, limits: { fileSize: 60 * 1024 * 1024, files: 2 } });

function isRealPdf(file) {
  try {
    const fd = fs.openSync(file.path, 'r');
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    return buf.toString() === '%PDF-';
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* App + middleware                                                    */
/* ------------------------------------------------------------------ */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://js.paystack.co', 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://*.paystack.co', 'https://*.paystack.com'],
        frameSrc: ['https://*.paystack.com', 'https://*.paystack.co'],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

/* Paystack webhook needs the raw body, so it goes before express.json() */
app.post('/api/paystack/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  if (!PAYSTACK_SECRET) return res.sendStatus(503);
  const sig = String(req.headers['x-paystack-signature'] || '');
  const expected = crypto.createHmac('sha512', PAYSTACK_SECRET).update(req.body).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    const evt = JSON.parse(req.body.toString('utf8'));
    if (evt.event === 'charge.success' && evt.data && evt.data.reference) {
      applyPayment(evt.data.reference).catch((e) => console.error('[webhook]', e.message));
    }
  } catch (_) {
    /* ignore malformed payloads */
  }
});

app.use(express.json({ limit: '100kb' }));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});
app.use('/api', apiLimiter);

app.use((req, res, next) => {
  req.user = null;
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try {
      const p = jwt.verify(h.slice(7), JWT_SECRET);
      req.user = findUser(p.sub) || null;
    } catch (_) {
      req.user = null;
    }
  }
  next();
});

const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Log in to continue.', code: 'login_required' });
const requireAdmin = (req, res, next) =>
  req.user && roleOf(req.user) === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => {
  res.json({
    paystackKey: PAYSTACK_PUBLIC,
    price: SUB_PRICE,
    days: SUB_DAYS,
    categories: CATEGORIES,
    founder: db.settings.founder,
  });
});

app.post('/api/visit', (req, res) => {
  db.stats.total += 1;
  const d = today();
  db.stats.byDay[d] = (db.stats.byDay[d] || 0) + 1;
  save();
  res.json({ ok: true });
});

app.get('/api/feed', (req, res) => {
  const page = Math.max(0, parseInt(req.query.page, 10) || 0);
  const order = feedOrder(req.query.filter);
  if (!order.length) return res.json({ items: [], next: null });

  // Enough content: loop the ranked list so the feed never ends.
  if (order.length >= 4) {
    const items = Array.from({ length: FEED_PAGE_SIZE }, (_, i) => {
      const g = page * FEED_PAGE_SIZE + i;
      return { ...order[g % order.length], slot: g };
    });
    return res.json({ items, next: page + 1 });
  }
  // Very little content: show it once instead of repeating the same card.
  const start = page * FEED_PAGE_SIZE;
  const items = order.slice(start, start + FEED_PAGE_SIZE).map((it, i) => ({ ...it, slot: start + i }));
  res.json({ items, next: start + FEED_PAGE_SIZE < order.length ? page + 1 : null });
});

app.get('/api/listings', (req, res) => {
  const mine = req.query.mine === '1';
  if (mine && !req.user) return res.status(401).json({ error: 'Log in to continue.', code: 'login_required' });

  const cat = str(req.query.category, 40).toLowerCase();
  const q = str(req.query.q, 80).toLowerCase();
  let rows = mine
    ? db.listings.filter((l) => l.sellerId === req.user.id)
    : db.listings.filter((l) => l.status === 'approved');
  if (cat && cat !== 'all') rows = rows.filter((l) => l.category.toLowerCase() === cat);
  if (q) rows = rows.filter((l) => (l.title + ' ' + l.description).toLowerCase().includes(q));

  const out = rows.map(listingOut).sort((a, b) => {
    const pa = a.verified || a.featured ? 1 : 0;
    const pb = b.verified || b.featured ? 1 : 0;
    return pb - pa || newest(a, b);
  });
  res.json({ items: out });
});

app.get('/api/library', (req, res) => {
  const type = str(req.query.type, 10).toLowerCase();
  const q = str(req.query.q, 80).toLowerCase();
  let rows = db.library.slice();
  if (type === 'ebook' || type === 'course') rows = rows.filter((x) => x.type === type);
  if (q) rows = rows.filter((x) => (x.title + ' ' + x.description).toLowerCase().includes(q));
  res.json({ items: rows.sort(newest).map(libraryOut) });
});

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */
app.post('/api/auth/register', authLimiter, (req, res) => {
  const name = str(req.body.name, 60);
  const email = str(req.body.email, 120).toLowerCase();
  const phone = str(req.body.phone, 20);
  const password = String(req.body.password || '');

  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15)
    return res.status(400).json({ error: 'Enter a valid WhatsApp number, e.g. 08012345678.' });
  if (password.length < 8 || password.length > 100)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: 'That email is already registered. Log in instead.' });

  const user = {
    id: uid(),
    name,
    email,
    phone,
    passHash: bcrypt.hashSync(password, 11),
    createdAt: nowIso(),
  };
  db.users.push(user);
  save();
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const user = db.users.find((u) => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.passHash))
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.patch('/api/me', requireAuth, (req, res) => {
  const name = str(req.body.name, 60);
  const phone = str(req.body.phone, 20);
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (digits.length < 10 || digits.length > 15)
    return res.status(400).json({ error: 'Enter a valid WhatsApp number, e.g. 08012345678.' });
  req.user.name = name;
  req.user.phone = phone;
  save();
  res.json({ user: publicUser(req.user) });
});

/* ------------------------------------------------------------------ */
/* Marketplace listings                                                */
/* ------------------------------------------------------------------ */
app.post('/api/listings', requireAuth, uploadImage.single('image'), (req, res) => {
  const cleanup = () => req.file && removeFile(UPLOAD_DIR, req.file.filename);
  const title = str(req.body.title, 80);
  const description = str(req.body.description, 1000);
  const price = Math.round(Number(req.body.price));
  const category = CATEGORIES.find((c) => c.toLowerCase() === str(req.body.category, 40).toLowerCase());

  if (!req.file) return res.status(400).json({ error: 'Add a photo of your item.' });
  if (title.length < 3) return cleanup(), res.status(400).json({ error: 'Give your listing a title (at least 3 characters).' });
  if (description.length < 10) return cleanup(), res.status(400).json({ error: 'Describe your item in at least 10 characters.' });
  if (!Number.isFinite(price) || price < 0 || price > 1e9) return cleanup(), res.status(400).json({ error: 'Enter a valid price in naira.' });
  if (!category) return cleanup(), res.status(400).json({ error: 'Choose a category.' });
  if (!req.user.phone) return cleanup(), res.status(400).json({ error: 'Add your WhatsApp number in Profile so buyers can reach you.' });

  const admin = roleOf(req.user) === 'admin';
  const l = {
    id: uid(),
    sellerId: req.user.id,
    title,
    description,
    price,
    category,
    image: '/uploads/' + req.file.filename,
    status: admin ? 'approved' : 'pending',
    featured: admin,
    createdAt: nowIso(),
  };
  db.listings.push(l);
  save();
  res.json({ item: listingOut(l), message: admin ? 'Your listing is live.' : 'Submitted. It will appear once an admin approves it.' });
});

app.delete('/api/listings/:id', requireAuth, (req, res) => {
  const i = db.listings.findIndex((l) => l.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Listing not found.' });
  const l = db.listings[i];
  if (l.sellerId !== req.user.id && roleOf(req.user) !== 'admin') return res.status(403).json({ error: 'You can only delete your own listings.' });
  db.listings.splice(i, 1);
  removeFile(UPLOAD_DIR, l.image);
  save();
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Digital library + paywall                                           */
/* ------------------------------------------------------------------ */
app.get('/api/library/:id/file', (req, res) => {
  const item = db.library.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found.' });

  if (item.premium) {
    if (!req.user) return res.status(401).json({ error: 'Log in to read premium content.', code: 'login_required' });
    if (!isSubscribed(req.user)) return res.status(402).json({ error: 'A subscription is required.', code: 'subscription_required' });
  }
  const file = path.join(PRIVATE_DIR, path.basename(item.pdf));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File is missing on the server.' });

  const safeName = item.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'document';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${req.query.dl === '1' ? 'attachment' : 'inline'}; filename="${safeName}.pdf"`);
  res.sendFile(file);
});

/* ------------------------------------------------------------------ */
/* Paystack                                                            */
/* ------------------------------------------------------------------ */
async function applyPayment(reference, expectEmail) {
  if (!PAYSTACK_SECRET) throw new Error('Payments are not configured.');
  if (db.payments.some((p) => p.reference === reference)) return findUserByPayment(reference);

  const r = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
    headers: { Authorization: 'Bearer ' + PAYSTACK_SECRET },
  });
  const j = await r.json().catch(() => ({}));
  const d = j && j.data;
  if (!r.ok || !j.status || !d || d.status !== 'success') throw new Error('Payment was not successful.');
  if (d.currency !== 'NGN' || d.amount < SUB_PRICE * 100) throw new Error('Payment amount does not match the subscription price.');

  const email = String((d.customer && d.customer.email) || '').toLowerCase();
  if (expectEmail && email !== expectEmail) throw new Error('This payment belongs to a different account.');
  const user = db.users.find((u) => u.email === email);
  if (!user) throw new Error('No account matches this payment.');

  // Re-check after the await: verify + webhook can race, and the reference must only be credited once.
  if (db.payments.some((p) => p.reference === reference)) return user;

  const base = isSubscribed(user) && user.subscriptionUntil ? new Date(user.subscriptionUntil) : new Date();
  user.subscriptionUntil = new Date(base.getTime() + SUB_DAYS * 86400000).toISOString();
  db.payments.push({ reference, userId: user.id, amount: d.amount, at: nowIso() });
  save();
  return user;
}

function findUserByPayment(reference) {
  const p = db.payments.find((x) => x.reference === reference);
  return p ? findUser(p.userId) : null;
}

app.post('/api/paystack/verify', requireAuth, async (req, res) => {
  const reference = str(req.body.reference, 100);
  if (!reference) return res.status(400).json({ error: 'Missing payment reference.' });
  if (!PAYSTACK_SECRET) return res.status(503).json({ error: 'Payments are not set up yet.' });
  try {
    const user = await applyPayment(reference, req.user.email);
    if (!user || user.id !== req.user.id) return res.status(403).json({ error: 'This payment belongs to a different account.' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */
app.get('/api/admin/overview', requireAuth, requireAdmin, (req, res) => {
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
    return { day: d, count: db.stats.byDay[d] || 0 };
  });
  res.json({
    stats: { total: db.stats.total, today: db.stats.byDay[today()] || 0, last7 },
    counts: {
      users: db.users.length,
      live: db.listings.filter((l) => l.status === 'approved').length,
      pending: db.listings.filter((l) => l.status === 'pending').length,
      library: db.library.length,
    },
    users: db.users
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: roleOf(u),
        subscriptionUntil: isSubscribed(u) ? u.subscriptionUntil || null : null,
        createdAt: u.createdAt,
        listings: db.listings.filter((l) => l.sellerId === u.id).length,
      }))
      .sort(newest),
    listings: db.listings.map(listingOut).sort(newest),
    library: db.library.slice().sort(newest).map(libraryOut),
    banners: db.banners.slice().sort(newest).map(bannerOut),
    settings: db.settings,
  });
});

app.patch('/api/admin/listings/:id', requireAuth, requireAdmin, (req, res) => {
  const l = db.listings.find((x) => x.id === req.params.id);
  if (!l) return res.status(404).json({ error: 'Listing not found.' });
  if (req.body.status !== undefined) {
    if (!['approved', 'pending'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
    l.status = req.body.status;
  }
  if (req.body.featured !== undefined) l.featured = !!req.body.featured;
  save();
  res.json({ item: listingOut(l) });
});

app.post(
  '/api/library',
  requireAuth,
  requireAdmin,
  uploadLibrary.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
  ]),
  (req, res) => {
    const files = req.files || {};
    const cover = (files.cover || [])[0];
    const pdf = (files.pdf || [])[0];
    const cleanup = () => {
      if (cover) removeFile(UPLOAD_DIR, cover.filename);
      if (pdf) removeFile(PRIVATE_DIR, pdf.filename);
    };
    const title = str(req.body.title, 100);
    const description = str(req.body.description, 1500);
    const type = req.body.type === 'course' ? 'course' : 'ebook';
    const premium = req.body.premium === 'on' || req.body.premium === 'true' || req.body.premium === '1';

    if (!pdf) return cleanup(), res.status(400).json({ error: 'Attach the PDF file.' });
    if (!isRealPdf(pdf)) return cleanup(), res.status(400).json({ error: 'That file is not a valid PDF.' });
    if (title.length < 3) return cleanup(), res.status(400).json({ error: 'Add a title.' });

    const item = {
      id: uid(),
      type,
      title,
      description,
      cover: cover ? '/uploads/' + cover.filename : null,
      pdf: pdf.filename,
      premium,
      createdAt: nowIso(),
    };
    db.library.push(item);
    save();
    res.json({ item: libraryOut(item) });
  }
);

app.delete('/api/library/:id', requireAuth, requireAdmin, (req, res) => {
  const i = db.library.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found.' });
  const [item] = db.library.splice(i, 1);
  removeFile(PRIVATE_DIR, item.pdf);
  removeFile(UPLOAD_DIR, item.cover);
  save();
  res.json({ ok: true });
});

app.post('/api/admin/banners', requireAuth, requireAdmin, (req, res) => {
  const title = str(req.body.title, 80);
  const text = str(req.body.text, 240);
  const cta = str(req.body.cta, 30);
  const link = str(req.body.link, 300);
  if (title.length < 3) return res.status(400).json({ error: 'Add a banner title.' });
  if (!isHttpOrHash(link)) return res.status(400).json({ error: 'The link must start with https:// or be a section like #library.' });
  const b = { id: uid(), title, text, cta, link, createdAt: nowIso() };
  db.banners.push(b);
  save();
  res.json({ item: bannerOut(b) });
});

app.delete('/api/admin/banners/:id', requireAuth, requireAdmin, (req, res) => {
  const i = db.banners.findIndex((b) => b.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found.' });
  db.banners.splice(i, 1);
  save();
  res.json({ ok: true });
});

app.put('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const next = {
    name: str(b.name, 80),
    title: str(b.title, 80),
    bio: str(b.bio, 1500),
    vision: str(b.vision, 800),
    whatsapp: str(b.whatsapp, 20),
    email: str(b.email, 120),
    telegram: str(b.telegram, 300),
    community: str(b.community, 300),
  };
  if (!next.name) return res.status(400).json({ error: 'Add the founder name.' });
  if (next.email && !isEmail(next.email)) return res.status(400).json({ error: 'Enter a valid contact email.' });
  for (const k of ['telegram', 'community']) {
    if (next[k] && !/^https?:\/\/\S+$/i.test(next[k])) return res.status(400).json({ error: 'Links must start with https://' });
  }
  db.settings.founder = next;
  save();
  res.json({ settings: db.settings });
});

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false, dotfiles: 'deny' }));
app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    setHeaders(res, file) {
      // The service worker and manifest must always be revalidated so updates reach people.
      if (/(sw\.js|manifest\.json)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
      if (file.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
    },
  })
);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : 'Upload failed. Try again.' });
  }
  if (err && err.expose) return res.status(err.status || 400).json({ error: err.message });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Try again.' });
});

app.listen(PORT, () => console.log(`Skillverse running on http://localhost:${PORT}`));

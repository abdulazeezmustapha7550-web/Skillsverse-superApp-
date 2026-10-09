/* Skillverse service worker
   - App shell is precached so the app opens offline.
   - Public feed/listing/library lists: network first, cached copy when offline.
   - Images, fonts, pdf.js: cached as they are used.
   - Auth, admin, payments and PDF files are NEVER cached here. Downloaded
     e-books live in the app's IndexedDB instead. */
const VERSION = 'sv-v1';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';

const SHELL_FILES = [
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon.svg',
];
const PDFJS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];
const PUBLIC_API = /^\/api\/(feed|listings|library|config)$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES);
    const rt = await caches.open(RUNTIME);
    // pdf.js is optional at install time: don't fail the install if the CDN is unreachable.
    await Promise.allSettled(PDFJS.map((u) => rt.add(new Request(u, { mode: 'cors' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, limit) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    cache.put(req, res.clone());
    if (limit) trim(RUNTIME, limit);
  }
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) {
      if (PUBLIC_API.test(url.pathname) && !url.searchParams.has('mine')) event.respondWith(networkFirst(req));
      return; // everything else (auth, admin, files) goes straight to the network
    }
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).catch(() => caches.match('/index.html', { cacheName: SHELL })));
      return;
    }
    if (url.pathname.startsWith('/uploads/')) { event.respondWith(cacheFirst(req, 150)); return; }
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (/(^|\.)(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
    event.respondWith(cacheFirst(req, 150));
  }
});

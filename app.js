(() => {
  'use strict';

  /* ================================================================
     Helpers
  ================================================================ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const first = (n) => String(n || '').split(' ')[0];
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  const ICONS = {
    feed: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    library: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    market: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    founder: '<path d="M5 21V4"/><path d="M5 4h13l-2.5 4 2.5 4H5"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4 3.4-7 7.5-7s7.5 3 7.5 7"/>',
    wa: '<path d="M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4A8 8 0 1 1 20 11.5z"/><path d="M9 9.5c.3 2.4 2.1 4.2 5 5l1.2-1.3-1.8-1-.8.6c-.7-.3-1.4-1-1.7-1.7l.6-.8-1-1.8z"/>',
    share: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    send: '<path d="M21 4 3 11l6 2.5L11.5 20l3-4.5z"/><path d="m9 13.5 12-9.5"/>',
    group: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5c1.9.8 3 2.6 3 5.5"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  };
  const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  /* ================================================================
     State + API
  ================================================================ */
  const state = {
    token: localStorage.getItem('sv_token'),
    user: null,
    config: { paystackKey: '', price: 1000, days: 30, categories: [], founder: {} },
    view: 'feed',
    filters: { feed: 'all', market: 'all', library: 'all' },
    feed: { page: 0, loading: false, done: false },
    pending: null,
  };
  const reg = new Map(); // "kind:id" -> item

  async function api(path, { method = 'GET', body, form, raw } = {}) {
    const headers = {};
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    let payload;
    if (form) payload = form;
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, { method, headers, body: payload }); }
    catch (_) { const e = new Error("You're offline or the server can't be reached."); e.offline = true; throw e; }
    if (raw) return res;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Request failed.'); e.status = res.status; e.code = data.code; throw e; }
    return data;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
  }

  /* ================================================================
     Sheet
  ================================================================ */
  function openSheet(html) {
    $('#sheetBody').innerHTML = '<div class="grab"></div>' + html;
    $('#sheet').classList.add('open');
    $('#sheetBody').scrollTop = 0;
  }
  function closeSheet() { $('#sheet').classList.remove('open'); $('#sheetBody').innerHTML = ''; }

  /* ================================================================
     Shared renderers
  ================================================================ */
  function media(src, title, seed) {
    if (src) return `<img src="${esc(src)}" alt="${esc(title)}" loading="lazy" decoding="async">`;
    return `<div class="ph ph-${hash(seed) % 4}" data-l="${esc((title || '?').trim().charAt(0).toUpperCase())}"></div>`;
  }
  function badge(it) {
    if (it.verified) return `<span class="badge">${ic('check')}Featured / Verified</span>`;
    if (it.featured) return `<span class="badge">${ic('star')}Featured</span>`;
    return '';
  }
  const sellerRow = (it) => `<div class="seller"><span class="av">${esc((it.seller.name || '?').charAt(0).toUpperCase())}</span><span class="n">${esc(it.seller.name)}</span>${it.verified ? ic('check', 'sm') : ''}</div>`;
  const typeLabel = (it) => (it.type === 'course' ? 'Course' : 'E-book');
  const key = (it) => it.kind + ':' + it.id;
  const remember = (it) => { reg.set(key(it), it); return it; };

  /* ---------- feed cards ---------- */
  function listingCard(it) {
    return `<article class="card" data-key="${esc(key(it))}" data-slot="${it.slot}">
      <div class="media">${media(it.image, it.title, it.id)}</div><div class="shade"></div>
      <button class="tap" data-act="open" aria-label="Open ${esc(it.title)}"></button>
      <div class="info glass">
        <div class="tags">${badge(it)}<span class="chip">${esc(it.category)}</span></div>
        <h3>${esc(it.title)}</h3>
        <p>${esc(it.description)}</p>
        <div class="row"><div class="price">${naira(it.price)}</div>${sellerRow(it)}</div>
        <div class="cta">
          <button class="btn primary" data-act="wa">${ic('wa')}Contact via WhatsApp</button>
          <button class="btn ghost sq" data-act="share" aria-label="Share">${ic('share')}</button>
        </div>
      </div></article>`;
  }
  function libraryCard(it) {
    return `<article class="card" data-key="${esc(key(it))}" data-slot="${it.slot}">
      <div class="media">${media(it.cover, it.title, it.id)}</div><div class="shade"></div>
      <button class="tap" data-act="open" aria-label="Open ${esc(it.title)}"></button>
      <div class="info glass">
        <div class="tags">${badge(it)}<span class="chip">${typeLabel(it)}</span>${it.premium ? `<span class="chip">${ic('lock')}Premium</span>` : '<span class="chip">Free</span>'}</div>
        <h3>${esc(it.title)}</h3>
        <p>${esc(it.description)}</p>
        <div class="cta">
          <button class="btn primary" data-act="read">${ic('eye')}Read online</button>
          <button class="btn ghost" data-act="download">${ic('download')}Download</button>
        </div>
      </div></article>`;
  }
  function bannerCard(it) {
    return `<article class="card banner" data-key="${esc(key(it))}" data-slot="${it.slot}">
      <h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ''}
      ${it.cta && it.link ? `<button class="btn" data-act="banner">${esc(it.cta)}</button>` : ''}
    </article>`;
  }
  const renderCard = (it) => (it.kind === 'banner' ? bannerCard(remember(it)) : it.kind === 'library' ? libraryCard(remember(it)) : listingCard(remember(it)));

  /* ---------- tiles ---------- */
  function listingTile(it) {
    remember(it);
    return `<article class="tile" data-key="${esc(key(it))}">
      <button class="thumb" data-act="open" aria-label="Open ${esc(it.title)}">${media(it.image, it.title, it.id)}
        ${it.verified || it.featured ? `<span class="bl badge">${ic('check')}${it.verified ? 'Verified' : 'Featured'}</span>` : ''}</button>
      <div class="t"><h4>${esc(it.title)}</h4><div class="p">${naira(it.price)}</div><span class="muted small">${esc(it.category)}</span></div></article>`;
  }
  function libraryTile(it) {
    remember(it);
    return `<article class="tile" data-key="${esc(key(it))}">
      <button class="cover" data-act="open" aria-label="Open ${esc(it.title)}">${media(it.cover, it.title, it.id)}
        <span class="chip tl">${typeLabel(it)}</span><span class="chip tr">${it.premium ? ic('lock') + 'Premium' : 'Free'}</span></button>
      <div class="t"><h4>${esc(it.title)}</h4>
        <div class="pair"><button class="btn primary sm" data-act="read">Read online</button>
        <button class="btn ghost sm sq" data-act="download" aria-label="Download ${esc(it.title)}">${ic('download', 'sm')}</button></div></div></article>`;
  }

  const emptyBlock = (title, text, btn = '') => `<div class="empty inline"><h3>${title}</h3><p>${text}</p>${btn}</div>`;

  /* ================================================================
     Auth
  ================================================================ */
  function authInner(mode, note) {
    const reg_ = mode === 'register';
    return `<div class="seg"><button class="${reg_ ? '' : 'on'}" data-act="auth-mode" data-mode="login">Log in</button><button class="${reg_ ? 'on' : ''}" data-act="auth-mode" data-mode="register">Create account</button></div>
      ${note ? `<p class="lead">${esc(note)}</p>` : ''}
      <form class="form" data-form="${mode}">
        ${reg_ ? '<div class="field"><label for="a-name">Full name</label><input id="a-name" name="name" type="text" autocomplete="name" required></div>' : ''}
        <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" required></div>
        ${reg_ ? '<div class="field"><label for="a-phone">WhatsApp number</label><input id="a-phone" name="phone" type="tel" autocomplete="tel" placeholder="08012345678" required><span class="hint">Buyers contact you here when you list something.</span></div>' : ''}
        <div class="field"><label for="a-pass">Password</label><input id="a-pass" name="password" type="password" autocomplete="${reg_ ? 'new-password' : 'current-password'}" minlength="${reg_ ? 8 : 1}" required>${reg_ ? '<span class="hint">At least 8 characters.</span>' : ''}</div>
        <button class="btn primary block" type="submit">${reg_ ? 'Create account' : 'Log in'}</button>
      </form>`;
  }
  const authBox = (mode, note) => `<div class="authbox">${authInner(mode, note)}</div>`;
  function openAuth(note, mode = 'login') {
    openSheet(`<h2>${mode === 'register' ? 'Join Skillverse' : 'Welcome back'}</h2>${authBox(mode, note)}`);
  }
  async function onAuth(r) {
    state.token = r.token;
    localStorage.setItem('sv_token', r.token);
    state.user = r.user;
    paintUser();
    closeSheet();
    toast('Welcome, ' + first(r.user.name));
    if (state.view === 'profile') renderProfile();
    const p = state.pending;
    state.pending = null;
    if (p) p();
  }
  function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('sv_token');
    closeAdmin();
    paintUser();
    renderProfile();
    toast('Logged out');
  }
  async function refreshMe() {
    if (!state.token) return;
    try { state.user = (await api('/api/me')).user; }
    catch (e) { if (e.status === 401) { state.token = null; state.user = null; localStorage.removeItem('sv_token'); } }
    paintUser();
  }
  function paintUser() { $('#adminBtn').hidden = !(state.user && state.user.role === 'admin'); }
  const requireLogin = (note, fn) => { if (state.user) return true; state.pending = fn; openAuth(note); return false; };

  /* ================================================================
     Subscription (Paystack)
  ================================================================ */
  function openSubscribe() {
    const { price, days } = state.config;
    openSheet(`<h2>Unlock premium reading</h2><p class="lead">One payment, no auto-renewal.</p>
      <div class="big-price">${naira(price)}</div><div class="muted">for ${days} days of access</div>
      <ul class="perks">
        <li>${ic('check')}Read every premium e-book and course online</li>
        <li>${ic('check')}Download PDFs and read them offline in the app</li>
        <li>${ic('check')}Browsing and the marketplace stay free</li>
      </ul>
      <button class="btn primary block" data-act="pay">Pay ${naira(price)} with Paystack</button>`);
  }
  function pay() {
    const cfg = state.config;
    if (!state.user) return openAuth('Log in to subscribe.');
    if (!cfg.paystackKey) return toast('Payments are not set up yet. Please try again later.');
    if (!window.PaystackPop) return toast("Paystack couldn't load. Check your connection and try again.");
    const ref = 'SV' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const handler = window.PaystackPop.setup({
      key: cfg.paystackKey,
      email: state.user.email,
      amount: cfg.price * 100,
      currency: 'NGN',
      ref,
      metadata: { purpose: 'skillverse-subscription', user_id: state.user.id },
      callback: function (r) { verifyPayment(r.reference); },
      onClose: function () {},
    });
    handler.openIframe();
  }
  async function verifyPayment(reference) {
    toast('Confirming your payment…');
    try {
      const r = await api('/api/paystack/verify', { method: 'POST', body: { reference } });
      state.user = r.user;
      closeSheet();
      toast('Subscription active. Enjoy!');
      if (state.view === 'profile') renderProfile();
      const p = state.pending;
      state.pending = null;
      if (p) p();
    } catch (e) {
      toast(e.message + ' If you were charged, contact support with reference ' + reference + '.');
    }
  }

  /* ================================================================
     Offline storage (IndexedDB) for downloaded e-books
  ================================================================ */
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((resolve, reject) => {
        const r = indexedDB.open('skillverse', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('pdfs', { keyPath: 'id' });
        r.onsuccess = () => { this.db = r.result; resolve(r.result); };
        r.onerror = () => reject(r.error);
      });
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('pdfs', mode);
        const req = fn(t.objectStore('pdfs'));
        t.oncomplete = () => resolve(req && req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    },
    put(rec) { return this.run('readwrite', (s) => s.put(rec)); },
    get(id) { return this.run('readonly', (s) => s.get(id)); },
    all() { return this.run('readonly', (s) => s.getAll()); },
    del(id) { return this.run('readwrite', (s) => s.delete(id)); },
  };

  /* ================================================================
     Library access (the paywall lives here)
  ================================================================ */
  async function accessLibrary(it, mode) {
    if (it.premium) {
      if (!state.user) { state.pending = () => accessLibrary(it, mode); return openAuth('Log in to read premium content.'); }
      if (!state.user.subscribed) { state.pending = () => accessLibrary(it, mode); return openSubscribe(); }
    }
    try {
      toast(mode === 'download' ? 'Downloading…' : 'Opening…');
      const res = await api(`/api/library/${encodeURIComponent(it.id)}/file${mode === 'download' ? '?dl=1' : ''}`, { raw: true });
      if (res.status === 401) { state.pending = () => accessLibrary(it, mode); return openAuth('Log in to read premium content.'); }
      if (res.status === 402) { await refreshMe(); state.pending = () => accessLibrary(it, mode); return openSubscribe(); }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Could not open this file.'); }
      const blob = await res.blob();
      if (mode === 'download') {
        try {
          await idb.put({ id: 'lib:' + it.id, title: it.title, type: it.type, size: blob.size, savedAt: Date.now(), blob });
          if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
        } catch (_) { /* storage full or blocked: the file download below still works */ }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = it.title.replace(/[^\w\- ]+/g, '').trim() + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        toast('Saved. You can also read it offline in the Library tab.');
        if (state.view === 'library') renderDownloads();
      } else {
        openReader(blob, it.title, 'lib:' + it.id);
      }
    } catch (e) { toast(e.message); }
  }

  /* ================================================================
     PDF reader (pdf.js)
  ================================================================ */
  const R = { pdf: null, n: 1, zoom: 1, task: null, key: '' };
  const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  async function openReader(blob, title, k) {
    if (!window.pdfjsLib) return toast("The PDF reader hasn't loaded yet. Connect once to load it, then it works offline.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    $('#reader').classList.add('open');
    $('#rTitle').textContent = title;
    $('#rMsg').hidden = false;
    $('#rMsg').textContent = 'Opening…';
    $('#rCanvas').hidden = true;
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      R.pdf = await window.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
      R.key = k;
      R.zoom = 1;
      const saved = parseInt(localStorage.getItem('sv_pg_' + k), 10);
      R.n = saved >= 1 && saved <= R.pdf.numPages ? saved : 1;
      $('#rCount').textContent = R.pdf.numPages;
      $('#rPage').max = R.pdf.numPages;
      await renderPage();
    } catch (e) {
      $('#rMsg').hidden = false;
      $('#rMsg').textContent = 'This PDF could not be opened. It may be damaged or password-protected.';
    }
  }
  async function renderPage() {
    if (!R.pdf) return;
    if (R.task) { try { R.task.cancel(); } catch (_) {} }
    const page = await R.pdf.getPage(R.n);
    const stage = $('#rStage');
    const base = page.getViewport({ scale: 1 });
    const fit = (stage.clientWidth - 24) / base.width;
    const vp = page.getViewport({ scale: fit * R.zoom });
    const dpr = window.devicePixelRatio || 1;
    const cv = $('#rCanvas');
    cv.width = Math.floor(vp.width * dpr);
    cv.height = Math.floor(vp.height * dpr);
    cv.style.width = vp.width + 'px';
    cv.style.height = vp.height + 'px';
    $('#rMsg').hidden = true;
    cv.hidden = false;
    $('#rPage').value = R.n;
    stage.scrollTop = 0;
    localStorage.setItem('sv_pg_' + R.key, R.n);
    R.task = page.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    try { await R.task.promise; } catch (e) { if (!(e && e.name === 'RenderingCancelledException')) throw e; }
  }
  function readerGo(n) {
    if (!R.pdf) return;
    const next = Math.min(R.pdf.numPages, Math.max(1, n));
    if (next === R.n) return;
    R.n = next;
    renderPage();
  }
  function readerZoom(d) { R.zoom = Math.min(4, Math.max(0.6, +(R.zoom + d).toFixed(2))); renderPage(); }
  function closeReader() {
    $('#reader').classList.remove('open');
    if (R.task) { try { R.task.cancel(); } catch (_) {} }
    if (R.pdf) { R.pdf.destroy(); R.pdf = null; }
  }
  (function readerGestures() {
    const stage = $('#rStage');
    let sx = 0, sy = 0;
    stage.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (R.zoom > 1.05 || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) readerGo(R.n + (dx < 0 ? 1 : -1));
    }, { passive: true });
    $('#rPage').addEventListener('change', (e) => readerGo(parseInt(e.target.value, 10) || R.n));
    window.addEventListener('resize', debounce(() => { if ($('#reader').classList.contains('open')) renderPage(); }, 200));
  })();

  /* ================================================================
     Routing + category pills
  ================================================================ */
  const VIEWS = ['feed', 'library', 'market', 'founder', 'profile'];
  const PILLS = {
    feed: [['all', 'All'], ['clothing', 'Clothing'], ['accessories', 'Accessories'], ['gadgets', 'Gadgets'], ['services', 'Services'], ['ebook', 'E-books'], ['course', 'Courses']],
    market: [['all', 'All'], ['clothing', 'Clothing'], ['accessories', 'Accessories'], ['gadgets', 'Gadgets'], ['services', 'Services'], ['other', 'Other']],
    library: [['all', 'All'], ['ebook', 'E-books'], ['course', 'Courses']],
  };

  function renderPills() {
    const list = PILLS[state.view] || [];
    $('#pills').innerHTML = list.map(([v, l]) => `<button class="pill ${state.filters[state.view] === v ? 'on' : ''}" role="tab" aria-selected="${state.filters[state.view] === v}" data-act="pill" data-v="${v}">${l}</button>`).join('');
  }
  function go(v) {
    if (location.hash.slice(1) === v) route(); else location.hash = v;
  }
  function route() {
    let v = location.hash.slice(1);
    if (!VIEWS.includes(v)) v = 'feed';
    state.view = v;
    $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
    $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    renderPills();
    if (v === 'feed' && !$('#feed').children.length) resetFeed();
    if (v === 'library') loadLibrary();
    if (v === 'market') loadMarket();
    if (v === 'founder') renderFounder();
    if (v === 'profile') renderProfile();
  }

  /* ================================================================
     Feed (infinite)
  ================================================================ */
  let feedObserver;
  function resetFeed() {
    $('#feed').innerHTML = '';
    state.feed = { page: 0, loading: false, done: false };
    $('#feed').scrollTop = 0;
    loadFeed();
  }
  async function loadFeed() {
    const f = state.feed;
    if (f.loading || f.done) return;
    f.loading = true;
    const el = $('#feed');
    try {
      const data = await api(`/api/feed?page=${f.page}&filter=${encodeURIComponent(state.filters.feed)}`);
      if (f !== state.feed) return;
      if (f.page === 0 && !data.items.length) {
        el.innerHTML = `<div class="empty"><h3>Nothing here yet.</h3><p>${state.user && state.user.role === 'admin' ? 'Add e-books in the Admin Dashboard or post an item to get the feed moving.' : 'Be the first to list something, or check back soon for new e-books and courses.'}</p><button class="btn primary" data-act="sell">${ic('plus')}Sell something</button></div>`;
        f.done = true;
        return;
      }
      const cards = data.items.map(renderCard).join('');
      el.insertAdjacentHTML('beforeend', cards);
      f.page = data.next === null ? f.page : data.next;
      if (data.next === null) f.done = true;
      watchEnd();
    } catch (e) {
      if (f === state.feed && !el.children.length) {
        el.innerHTML = `<div class="empty"><h3>${e.offline ? "You're offline." : "Couldn't load the feed."}</h3><p>${esc(e.message)}</p><button class="btn primary" data-act="retry-feed">Try again</button></div>`;
      } else toast(e.message);
    } finally { f.loading = false; }
  }
  function watchEnd() {
    if (!feedObserver) {
      feedObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { feedObserver.unobserve(en.target); loadFeed(); } });
      }, { root: $('#feed'), threshold: 0.4 });
    }
    const cards = $$('#feed .card');
    const target = cards[Math.max(0, cards.length - 2)];
    if (target) feedObserver.observe(target);
  }

  /* ================================================================
     Marketplace
  ================================================================ */
  async function loadMarket() {
    const body = $('#marketBody');
    if (!$('#mSearch')) {
      body.innerHTML = `<div class="search"><input id="mSearch" type="search" placeholder="Search the marketplace" aria-label="Search the marketplace"><button class="btn primary" data-act="sell">${ic('plus')}Sell</button></div><div class="grid" id="mGrid"></div>`;
      $('#mSearch').addEventListener('input', debounce(loadMarket, 300));
    }
    const grid = $('#mGrid');
    try {
      const d = await api(`/api/listings?category=${encodeURIComponent(state.filters.market)}&q=${encodeURIComponent($('#mSearch').value.trim())}`);
      grid.innerHTML = d.items.length ? d.items.map(listingTile).join('') : `<div style="grid-column:1/-1">${emptyBlock('No listings found.', 'Try another category, or list your own item.', `<button class="btn primary" data-act="sell">${ic('plus')}Sell something</button>`)}</div>`;
    } catch (e) { grid.innerHTML = `<div style="grid-column:1/-1">${emptyBlock(e.offline ? "You're offline." : 'Something went wrong.', esc(e.message))}</div>`; }
  }

  /* ---------- sell ---------- */
  function openSell() {
    if (!requireLogin('Log in to list an item for sale.', openSell)) return;
    const cats = (state.config.categories.length ? state.config.categories : ['Clothing', 'Accessories', 'Gadgets', 'Services', 'Other']).map((c) => `<option>${esc(c)}</option>`).join('');
    openSheet(`<h2>Sell something</h2>
      <p class="lead">${state.user.role === 'admin' ? 'Admin listings go live immediately.' : 'Listings are reviewed by an admin before they appear.'}</p>
      <form class="form" data-form="sell">
        <div class="field"><label for="s-img">Photo</label><input id="s-img" name="image" type="file" accept="image/jpeg,image/png,image/webp" required><span class="hint">JPG, PNG or WebP, up to 5 MB.</span></div>
        <div class="field"><label for="s-title">Title</label><input id="s-title" name="title" type="text" maxlength="80" required></div>
        <div class="field"><label for="s-desc">Description</label><textarea id="s-desc" name="description" maxlength="1000" required></textarea></div>
        <div class="field"><label for="s-price">Price (₦)</label><input id="s-price" name="price" type="number" min="0" step="1" inputmode="numeric" required></div>
        <div class="field"><label for="s-cat">Category</label><select id="s-cat" name="category" required>${cats}</select></div>
        <button class="btn primary block" type="submit">Submit listing</button>
      </form>`);
  }

  /* ---------- details ---------- */
  function openItem(it) {
    if (it.kind === 'library') {
      openSheet(`<div class="hero">${media(it.cover, it.title, it.id)}</div>
        <div class="tags">${badge(it)}<span class="chip">${typeLabel(it)}</span>${it.premium ? `<span class="chip">${ic('lock')}Premium</span>` : '<span class="chip">Free</span>'}</div>
        <h2 style="margin-top:10px">${esc(it.title)}</h2><p class="desc">${esc(it.description) || 'No description yet.'}</p>
        <div class="cta" data-key="${esc(key(it))}"><button class="btn primary" data-act="read">${ic('eye')}Read online</button><button class="btn ghost" data-act="download">${ic('download')}Download</button></div>`);
    } else if (it.kind === 'listing') {
      openSheet(`<div class="hero">${media(it.image, it.title, it.id)}</div>
        <div class="tags">${badge(it)}<span class="chip">${esc(it.category)}</span></div>
        <h2 style="margin-top:10px">${esc(it.title)}</h2><div class="price">${naira(it.price)}</div>
        <p class="desc">${esc(it.description)}</p>
        <div class="row" style="margin-bottom:14px">${sellerRow(it)}</div>
        <div class="cta" data-key="${esc(key(it))}"><button class="btn primary" data-act="wa">${ic('wa')}Contact via WhatsApp</button><button class="btn ghost sq" data-act="share" aria-label="Share">${ic('share')}</button></div>`);
    }
  }
  function whatsapp(it) {
    if (!it.seller.whatsapp) return toast("This seller hasn't added a WhatsApp number.");
    const text = `Hi ${first(it.seller.name)}, I'm interested in "${it.title}" (${naira(it.price)}) that I saw on Skillverse.`;
    window.open(`https://wa.me/${it.seller.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
  async function share(it) {
    const url = location.origin + '/#' + (it.kind === 'library' ? 'library' : 'market');
    try {
      if (navigator.share) await navigator.share({ title: it.title, text: `${it.title} on Skillverse`, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied'); }
    } catch (_) { /* cancelled */ }
  }

  /* ================================================================
     Digital library
  ================================================================ */
  async function loadLibrary() {
    const body = $('#libraryBody');
    if (!$('#lGrid')) {
      body.innerHTML = `<button class="btn ghost block" data-act="local-pdf">${ic('phone')}Open a PDF from your phone</button>
        <div class="grid" id="lGrid"></div>
        <div id="dl"></div>`;
    }
    const grid = $('#lGrid');
    try {
      const f = state.filters.library;
      const d = await api(`/api/library${f === 'all' ? '' : '?type=' + f}`);
      grid.innerHTML = d.items.length ? d.items.map(libraryTile).join('') : `<div style="grid-column:1/-1">${emptyBlock('No titles yet.', 'New e-books and courses will show up here.')}</div>`;
    } catch (e) { grid.innerHTML = `<div style="grid-column:1/-1">${emptyBlock(e.offline ? "You're offline." : 'Something went wrong.', esc(e.message) + ' Your saved e-books are below.')}</div>`; }
    renderDownloads();
  }
  async function renderDownloads() {
    const el = $('#dl');
    if (!el) return;
    let rows = [];
    try { rows = (await idb.all()) || []; } catch (_) {}
    rows.sort((a, b) => b.savedAt - a.savedAt);
    el.innerHTML = rows.length
      ? `<h3 class="section-title" style="margin:6px 0 12px">Saved on this phone</h3><div style="display:flex;flex-direction:column;gap:10px">${rows.map((r) => `<div class="listrow" data-id="${esc(r.id)}"><div class="file-ic">${ic('file')}</div><div class="grow"><b>${esc(r.title)}</b><span class="muted small">${fmtSize(r.size)}, works offline</span></div><div class="acts"><button class="btn primary sm" data-act="read-saved">Read</button><button class="btn ghost sm sq" data-act="del-saved" aria-label="Remove ${esc(r.title)} from this phone">${ic('trash', 'sm')}</button></div></div>`).join('')}</div>`
      : '';
  }

  /* ================================================================
     Founder
  ================================================================ */
  function renderFounder() {
    const f = state.config.founder || {};
    const wa = String(f.whatsapp || '').replace(/\D/g, '').replace(/^0/, '234');
    const initials = (f.name || 'S').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const links = [
      wa ? `<a class="btn ghost" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ic('wa')}Message on WhatsApp</a>` : '',
      f.email ? `<a class="btn ghost" href="mailto:${esc(f.email)}">${ic('mail')}${esc(f.email)}</a>` : '',
      f.telegram ? `<a class="btn ghost" href="${esc(f.telegram)}" target="_blank" rel="noopener">${ic('send')}Join the Telegram channel</a>` : '',
      f.community ? `<a class="btn ghost" href="${esc(f.community)}" target="_blank" rel="noopener">${ic('group')}Join the WhatsApp community</a>` : '',
    ].join('');
    $('#founderBody').innerHTML = `<div class="founder-hero">
        <div class="avatar">${esc(initials)}<img src="/founder.jpg" alt="${esc(f.name)}"></div>
        <div><h1>${esc(f.name)}</h1><div class="muted">${esc(f.title)}</div></div></div>
      <div class="panel glass"><h3>About</h3><p>${esc(f.bio)}</p></div>
      <div class="panel glass"><h3>Vision</h3><p>${esc(f.vision)}</p></div>
      ${links ? `<div class="links">${links}</div>` : ''}`;
    const photo = $('#founderBody .avatar img');
    if (photo) photo.addEventListener('error', () => photo.remove());
  }

  /* ================================================================
     Profile + my listings
  ================================================================ */
  async function renderProfile() {
    const body = $('#profileBody');
    if (!state.user) {
      body.innerHTML = `<h2 class="section-title" style="font-size:30px">Your profile</h2><p class="muted">Log in to sell, save listings and unlock premium reading.</p><div class="panel glass">${authBox('login', '')}</div>`;
      return;
    }
    const u = state.user;
    const sub = u.role === 'admin' ? 'Admin: full access' : u.subscribed ? `Premium until ${fmtDate(u.subscriptionUntil)}` : 'Free plan';
    body.innerHTML = `<div class="row"><div style="display:flex;gap:12px;align-items:center;min-width:0"><span class="av" style="width:52px;height:52px;font-size:22px">${esc(u.name.charAt(0).toUpperCase())}</span><div style="min-width:0"><h2 class="section-title">${esc(u.name)}</h2><div class="muted small" style="overflow:hidden;text-overflow:ellipsis">${esc(u.email)}</div></div></div></div>
      <div class="panel glass"><div class="row"><span>Plan</span><span class="status ${u.subscribed ? 'live' : ''}">${esc(sub)}</span></div></div>
      ${u.role === 'admin' ? `<button class="btn primary block" data-act="admin-toggle">${ic('shield')}Open Admin Dashboard</button>` : ''}
      <div class="panel glass"><h3>Contact details</h3>
        <form class="form" data-form="profile">
          <div class="field"><label for="p-name">Full name</label><input id="p-name" name="name" type="text" value="${esc(u.name)}" required></div>
          <div class="field"><label for="p-phone">WhatsApp number</label><input id="p-phone" name="phone" type="tel" value="${esc(u.phone)}" placeholder="08012345678" required><span class="hint">Buyers use this number to reach you.</span></div>
          <button class="btn ghost block" type="submit">Save changes</button></form></div>
      <div class="row"><h3 class="section-title">My listings</h3><button class="btn primary sm" data-act="sell">${ic('plus', 'sm')}New</button></div>
      <div id="myList" style="display:flex;flex-direction:column;gap:10px"><div class="spinner-row">Loading…</div></div>
      <button class="btn ghost block" data-act="logout">Log out</button>`;
    try {
      const d = await api('/api/listings?mine=1');
      $('#myList').innerHTML = d.items.length
        ? d.items.map((it) => `<div class="listrow" data-key="${esc(key(remember(it)))}"><div class="th">${media(it.image, it.title, it.id)}</div><div class="grow"><b>${esc(it.title)}</b><span class="muted small">${naira(it.price)}</span></div><span class="status ${it.status === 'approved' ? 'live' : ''}">${it.status === 'approved' ? 'Live' : 'Awaiting approval'}</span><button class="btn ghost sm sq" data-act="del-listing" aria-label="Delete ${esc(it.title)}">${ic('trash', 'sm')}</button></div>`).join('')
        : emptyBlock('No listings yet.', 'Post clothes, gadgets, accessories or a service you offer.');
    } catch (e) { $('#myList').innerHTML = emptyBlock("Couldn't load your listings.", esc(e.message)); }
  }

  /* ================================================================
     Admin dashboard
  ================================================================ */
  const ADMIN_TABS = [['overview', 'Overview'], ['listings', 'Listings'], ['library', 'Library'], ['banners', 'Banners'], ['users', 'Users'], ['settings', 'Settings']];
  const admin = { tab: 'overview', data: null };

  async function openAdmin() {
    if (!state.user || state.user.role !== 'admin') return;
    $('#admin').classList.add('open');
    await loadAdmin();
  }
  function closeAdmin() { $('#admin').classList.remove('open'); }
  async function loadAdmin() {
    try { admin.data = await api('/api/admin/overview'); renderAdmin(); }
    catch (e) { $('#adminBody').innerHTML = emptyBlock("Couldn't load the dashboard.", esc(e.message)); }
  }
  function renderAdmin() {
    const d = admin.data;
    if (!d) return;
    $('#adminTabs').innerHTML = ADMIN_TABS.map(([v, l]) => `<button class="pill ${admin.tab === v ? 'on' : ''}" data-act="admin-tab" data-v="${v}">${l}${v === 'listings' && d.counts.pending ? ` (${d.counts.pending})` : ''}</button>`).join('');
    const body = $('#adminBody');
    if (admin.tab === 'overview') {
      const max = Math.max(1, ...d.stats.last7.map((x) => x.count));
      body.innerHTML = `<div class="stats">
          <div class="stat"><b>${d.stats.total.toLocaleString()}</b><span>Total visitors</span></div>
          <div class="stat"><b>${d.stats.today.toLocaleString()}</b><span>Visitors today</span></div>
          <div class="stat"><b>${d.counts.users.toLocaleString()}</b><span>Registered users</span></div>
          <div class="stat"><b>${d.counts.live}</b><span>Live listings</span></div>
          <div class="stat"><b>${d.counts.pending}</b><span>Awaiting approval</span></div>
          <div class="stat"><b>${d.counts.library}</b><span>Library titles</span></div></div>
        <div class="panel glass"><h3>Visitors, last 7 days</h3><div class="bars">${d.stats.last7.map((x) => `<div title="${x.count}"><span>${x.count}</span><i style="height:${Math.round((x.count / max) * 70)}px"></i><span>${new Date(x.day + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' })}</span></div>`).join('')}</div></div>`;
    } else if (admin.tab === 'listings') {
      body.innerHTML = d.listings.length ? d.listings.map((it) => `<div class="listrow" data-id="${esc(it.id)}"><div class="th">${media(it.image, it.title, it.id)}</div><div class="grow"><b>${esc(it.title)}</b><span class="muted small">${esc(it.seller.name)}, ${naira(it.price)}, ${esc(it.category)}</span><span><span class="status ${it.status === 'approved' ? 'live' : ''}">${it.status === 'approved' ? 'Live' : 'Pending'}</span></span></div>
        <div class="acts">${it.status === 'pending' ? '<button class="btn primary sm" data-act="adm-approve">Approve</button>' : '<button class="btn ghost sm" data-act="adm-unapprove">Unpublish</button>'}
        <button class="btn ghost sm" data-act="adm-feature" data-on="${it.featuredFlag ? 0 : 1}">${it.featuredFlag ? 'Unfeature' : 'Feature'}</button>
        <button class="btn ghost sm sq" data-act="adm-del-listing" aria-label="Delete ${esc(it.title)}">${ic('trash', 'sm')}</button></div></div>`).join('') : emptyBlock('No listings yet.', 'Member and admin listings appear here.');
    } else if (admin.tab === 'library') {
      body.innerHTML = `<div class="panel glass"><h3>Add an e-book or course</h3>
        <form class="form" data-form="adm-library">
          <div class="field"><label for="l-title">Title</label><input id="l-title" name="title" type="text" required></div>
          <div class="field"><label for="l-desc">Description</label><textarea id="l-desc" name="description"></textarea></div>
          <div class="field"><label for="l-type">Type</label><select id="l-type" name="type"><option value="ebook">E-book</option><option value="course">Course</option></select></div>
          <div class="field"><label for="l-cover">Cover image (optional)</label><input id="l-cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp"></div>
          <div class="field"><label for="l-pdf">PDF file</label><input id="l-pdf" name="pdf" type="file" accept="application/pdf" required></div>
          <label class="check"><input type="checkbox" name="premium" checked> Premium (requires a subscription to read or download)</label>
          <button class="btn primary block" type="submit">Publish</button></form></div>
        ${d.library.map((it) => `<div class="listrow" data-id="${esc(it.id)}"><div class="th">${media(it.cover, it.title, it.id)}</div><div class="grow"><b>${esc(it.title)}</b><span class="muted small">${typeLabel(it)}, ${it.premium ? 'Premium' : 'Free'}</span></div><button class="btn ghost sm sq" data-act="adm-del-library" aria-label="Delete ${esc(it.title)}">${ic('trash', 'sm')}</button></div>`).join('')}`;
    } else if (admin.tab === 'banners') {
      body.innerHTML = `<div class="panel glass"><h3>New banner or announcement</h3>
        <form class="form" data-form="adm-banner">
          <div class="field"><label for="b-title">Headline</label><input id="b-title" name="title" type="text" maxlength="80" required></div>
          <div class="field"><label for="b-text">Message</label><textarea id="b-text" name="text" maxlength="240"></textarea></div>
          <div class="field"><label for="b-cta">Button label (optional)</label><input id="b-cta" name="cta" type="text" maxlength="30"></div>
          <div class="field"><label for="b-link">Button link (optional)</label><input id="b-link" name="link" type="text" placeholder="https://… or #library"><span class="hint">Use https:// for external links, or #library, #market, #founder for sections.</span></div>
          <button class="btn primary block" type="submit">Publish banner</button></form></div>
        ${d.banners.map((b) => `<div class="listrow" data-id="${esc(b.id)}"><div class="grow"><b>${esc(b.title)}</b><span class="muted small">${esc(b.text)}</span></div><button class="btn ghost sm sq" data-act="adm-del-banner" aria-label="Delete banner ${esc(b.title)}">${ic('trash', 'sm')}</button></div>`).join('')}`;
    } else if (admin.tab === 'users') {
      body.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>WhatsApp</th><th>Role</th><th>Premium until</th><th>Listings</th><th>Joined</th></tr></thead><tbody>${d.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone || '-')}</td><td>${esc(u.role)}</td><td>${u.role === 'admin' ? 'Admin' : u.subscriptionUntil ? fmtDate(u.subscriptionUntil) : 'Free'}</td><td>${u.listings}</td><td>${fmtDate(u.createdAt)}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (admin.tab === 'settings') {
      const f = d.settings.founder;
      const fld = (id, label, name, val, type = 'text', hint = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" type="${type}" value="${esc(val)}">${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
      body.innerHTML = `<div class="panel glass"><h3>Founder page</h3>
        <form class="form" data-form="adm-settings">
          ${fld('f-name', 'Name', 'name', f.name)}${fld('f-title', 'Title', 'title', f.title)}
          <div class="field"><label for="f-bio">Bio</label><textarea id="f-bio" name="bio">${esc(f.bio)}</textarea></div>
          <div class="field"><label for="f-vision">Vision</label><textarea id="f-vision" name="vision">${esc(f.vision)}</textarea></div>
          ${fld('f-wa', 'WhatsApp number', 'whatsapp', f.whatsapp, 'tel')}${fld('f-mail', 'Contact email', 'email', f.email, 'email')}
          ${fld('f-tg', 'Telegram channel link', 'telegram', f.telegram, 'url', 'Starts with https://')}${fld('f-com', 'WhatsApp community link', 'community', f.community, 'url', 'Starts with https://')}
          <button class="btn primary block" type="submit">Save founder page</button></form>
        <span class="hint muted small">To show a photo, add a file named founder.jpg to the public folder.</span></div>`;
    }
  }
  async function adminCall(path, opts, okMsg) {
    try { await api(path, opts); if (okMsg) toast(okMsg); await loadAdmin(); resetFeed(); }
    catch (e) { toast(e.message); }
  }

  /* ================================================================
     Forms
  ================================================================ */
  const forms = {
    login: async (f) => onAuth(await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(f)) })),
    register: async (f) => onAuth(await api('/api/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(f)) })),
    sell: async (f) => {
      const r = await api('/api/listings', { method: 'POST', form: new FormData(f) });
      closeSheet();
      toast(r.message);
      if (state.view === 'profile') renderProfile();
      if (state.view === 'market') loadMarket();
      if (state.user.role === 'admin') resetFeed();
    },
    profile: async (f) => {
      const r = await api('/api/me', { method: 'PATCH', body: Object.fromEntries(new FormData(f)) });
      state.user = r.user;
      toast('Profile saved');
      renderProfile();
    },
    'adm-library': async (f) => {
      const fd = new FormData(f);
      if (!fd.get('cover') || !fd.get('cover').size) fd.delete('cover');
      toast('Uploading…');
      await api('/api/library', { method: 'POST', form: fd });
      toast('Published');
      await loadAdmin();
      resetFeed();
    },
    'adm-banner': async (f) => { await api('/api/admin/banners', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); toast('Banner published'); await loadAdmin(); resetFeed(); },
    'adm-settings': async (f) => { await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(f)) }); toast('Founder page saved'); const c = await api('/api/config'); state.config = c; await loadAdmin(); },
  };

  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    try { await forms[f.dataset.form](f); }
    catch (err) { toast(err.message); }
    finally { if (btn) btn.disabled = false; }
  });

  /* ================================================================
     Click delegation
  ================================================================ */
  const itemFor = (el) => { const holder = el.closest('[data-key]'); return holder ? reg.get(holder.dataset.key) : null; };

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const it = itemFor(el);

    switch (act) {
      case 'nav': return go(el.dataset.view);
      case 'pill': {
        state.filters[state.view] = el.dataset.v;
        renderPills();
        if (state.view === 'feed') resetFeed();
        if (state.view === 'market') loadMarket();
        if (state.view === 'library') loadLibrary();
        return;
      }
      case 'sheet-close': return closeSheet();
      case 'open': return it && openItem(it);
      case 'wa': return it && whatsapp(it);
      case 'share': return it && share(it);
      case 'read': return it && accessLibrary(it, 'read');
      case 'download': return it && accessLibrary(it, 'download');
      case 'banner': {
        const link = it && it.link;
        if (!link) return;
        if (link.startsWith('#')) return go(link.slice(1));
        return window.open(link, '_blank', 'noopener');
      }
      case 'sell': return openSell();
      case 'retry-feed': return resetFeed();
      case 'pay': return pay();
      case 'auth-mode': { const box = el.closest('.authbox'); box.innerHTML = authInner(el.dataset.mode, ''); return; }
      case 'logout': return logout();
      case 'local-pdf': return $('#localPdf').click();
      case 'read-saved': {
        const id = el.closest('[data-id]').dataset.id;
        const rec = await idb.get(id);
        return rec ? openReader(rec.blob, rec.title, id) : toast('That file is no longer on this phone.');
      }
      case 'del-saved': {
        await idb.del(el.closest('[data-id]').dataset.id);
        toast('Removed from this phone');
        return renderDownloads();
      }
      case 'del-listing': {
        if (!it || !confirm('Delete this listing? This cannot be undone.')) return;
        try { await api('/api/listings/' + encodeURIComponent(it.id), { method: 'DELETE' }); toast('Listing deleted'); renderProfile(); } catch (err) { toast(err.message); }
        return;
      }
      case 'reader-close': return closeReader();
      case 'r-prev': return readerGo(R.n - 1);
      case 'r-next': return readerGo(R.n + 1);
      case 'r-zoom-in': return readerZoom(0.25);
      case 'r-zoom-out': return readerZoom(-0.25);
      case 'admin-toggle': return $('#admin').classList.contains('open') ? closeAdmin() : openAdmin();
      case 'admin-tab': admin.tab = el.dataset.v; return renderAdmin();
      case 'adm-approve': return adminCall('/api/admin/listings/' + el.closest('[data-id]').dataset.id, { method: 'PATCH', body: { status: 'approved' } }, 'Approved');
      case 'adm-unapprove': return adminCall('/api/admin/listings/' + el.closest('[data-id]').dataset.id, { method: 'PATCH', body: { status: 'pending' } }, 'Unpublished');
      case 'adm-feature': return adminCall('/api/admin/listings/' + el.closest('[data-id]').dataset.id, { method: 'PATCH', body: { featured: el.dataset.on === '1' } }, el.dataset.on === '1' ? 'Featured' : 'Unfeatured');
      case 'adm-del-listing': return confirm('Delete this listing?') && adminCall('/api/listings/' + el.closest('[data-id]').dataset.id, { method: 'DELETE' }, 'Deleted');
      case 'adm-del-library': return confirm('Delete this title and its PDF?') && adminCall('/api/library/' + el.closest('[data-id]').dataset.id, { method: 'DELETE' }, 'Deleted');
      case 'adm-del-banner': return confirm('Delete this banner?') && adminCall('/api/admin/banners/' + el.closest('[data-id]').dataset.id, { method: 'DELETE' }, 'Deleted');
    }
  });

  $('#localPdf').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return toast('Choose a PDF file.');
    openReader(file, file.name.replace(/\.pdf$/i, ''), 'local:' + file.name + ':' + file.size);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#reader').classList.contains('open')) closeReader();
      else if ($('#sheet').classList.contains('open')) closeSheet();
      else if ($('#admin').classList.contains('open')) closeAdmin();
    }
    if ($('#reader').classList.contains('open') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      if (e.key === 'ArrowRight') readerGo(R.n + 1);
      if (e.key === 'ArrowLeft') readerGo(R.n - 1);
    }
  });

  /* ================================================================
     Boot
  ================================================================ */
  function paintIcons() {
    $$('[data-icon]').forEach((el) => { el.innerHTML = ic(el.dataset.icon, el.dataset.cls || ''); });
  }

  async function boot() {
    paintIcons();
    window.addEventListener('hashchange', route);

    // Count one visit per browser session.
    if (!sessionStorage.getItem('sv_visit')) {
      sessionStorage.setItem('sv_visit', '1');
      fetch('/api/visit', { method: 'POST' }).catch(() => {});
    }

    try { state.config = await api('/api/config'); } catch (_) { /* offline: defaults */ }
    await refreshMe();
    route();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }
  boot();
})();

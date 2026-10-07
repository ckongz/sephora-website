/* ===================================================================
   API.JS — single data layer for the whole site.

   Every page talks to data through window.Api. It auto-detects the mode:

     "server"  Express + SQLite backend is running (cd server && npm start)
               -> products, customers, login, orders, subscribers, messages
                  and inquiries are read from / saved to the database via /api/*

     "static"  Plain static hosting (Netlify, GitHub Pages, python -m http.server...)
               -> GET data/products.json + data/customers.json (+ sample orders etc.)
                  and a small demo database kept in the visitor's browser
                  (localStorage): logins are checked against password hashes,
                  orders / sign-ups / admin changes are saved there.

   Pages never need to know which mode is active.
=================================================================== */
(function () {
  const SESSION_KEY = 'sephora_session';
  const DB_KEY = 'sephora_static_db_v2';

  /* ---------- helpers ---------- */
  const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  const ref = p => p + '-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90 + 10);

  /* ---------- session ---------- */
  const getSession = () => readJSON(SESSION_KEY, null);
  const setSession = s => writeJSON(SESSION_KEY, s);
  const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} };

  /* ---------- mode detection (once per page) ---------- */
  let modeP;
  function mode() {
    if (!modeP) modeP = (async () => {
      if (location.protocol === 'file:') return 'static';
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 2500);
        const r = await fetch('api/health', { signal: ctl.signal });
        clearTimeout(t);
        const j = r.ok ? await r.json() : null;
        return j && j.status === 'ok' ? 'server' : 'static';
      } catch (e) { return 'static'; }
    })();
    return modeP;
  }

  async function request(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    const s = getSession();
    if (s && s.token) headers.Authorization = 'Bearer ' + s.token;
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) { const err = new Error((data && data.error) || 'Something went wrong. Please try again.'); err.status = res.status; throw err; }
    return data;
  }
  async function staticJSON(file) {
    const res = await fetch(file);
    if (!res.ok) throw new Error('Could not load ' + file);
    return res.json();
  }

  /* ===================================================================
     STATIC MODE — a small in-browser database (localStorage) that follows
     the same rules as the Express/SQLite server.
  =================================================================== */
  const httpErr = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };
  const maskEmail = e => String(e).replace(/^(.).*(@.*)$/, (_, a, d) => a + '\u2022\u2022\u2022' + d);
  const stockFor = (p, i) => (/low/i.test(p.availability) ? 3 : /out/i.test(p.availability) ? 0 : 25 + ((i * 7) % 40));
  const availOf = n => (n <= 0 ? 'Out of Stock' : n <= 5 ? 'Low Stock' : 'In Stock');
  const nowIso = () => new Date().toISOString();
  const agoIso = d => new Date(Date.now() - d * 86400000).toISOString();

  async function sha256(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return 'plain:' + text;                      // very old / insecure context fallback
  }
  async function pwOk(password, stored) {
    if (!stored) return false;
    if (stored.startsWith('plain:')) return stored === 'plain:' + password;
    if (!(window.crypto && crypto.subtle)) return true;   // cannot verify without WebCrypto
    return (await sha256(password)) === stored;
  }

  let dbP, memDb = null;
  const saveDb = db => { memDb = db; writeJSON(DB_KEY, db); };
  function sdb() {
    if (!dbP) dbP = (async () => {
      const stored = readJSON(DB_KEY, null);
      if (stored && stored.v === 2) return stored;
      const [prods, custs, auth, act] = await Promise.all(
        ['data/products.json', 'data/customers.json', 'data/demo-auth.json', 'data/demo-activity.json'].map(staticJSON));
      const db = { v: 2, seq: 1000, customers: [], products: [], orders: [], messages: [], inquiries: [], subscribers: [], giftcards: [] };
      db.products = prods.map((p, i) => ({ id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, rating: p.rating || 0,
        reviews: p.reviews || 0, description: p.description || '', benefits: p.benefits || [], image: p.image || '', stock: stockFor(p, i) }));
      db.customers = custs.map(c => ({ ...c, role: 'customer', status: 'active' })).concat(auth.staff.map(c => ({ ...c, status: 'active' })))
        .map(c => ({ ...c, hash: auth.hashes[c.email] || null }));
      const byId = id => db.customers.find(c => c.customerId === id);
      const prod = id => db.products.find(p => p.id === id);
      act.orders.forEach(o => {
        const c = byId(o.customerId); if (!c) return;
        const items = o.items.map(([pid, qty]) => ({ p: prod(pid), qty })).filter(l => l.p);
        db.orders.push({ id: db.seq++, ref: o.ref, customerId: c.customerId, name: c.name, email: c.email, address: o.address, status: o.status,
          total: items.reduce((t, l) => t + l.p.price * l.qty, 0), date: agoIso(o.daysAgo),
          items: items.map(l => ({ id: l.p.id, name: l.p.name, price: l.p.price, qty: l.qty })) });
        if (o.status !== 'Cancelled') items.forEach(l => { l.p.stock = Math.max(l.p.stock - l.qty, 0); });
      });
      db.messages = act.messages.map(m => ({ ref: m.ref, name: m.name, email: m.email, subject: m.subject, message: m.message, created_at: agoIso(m.daysAgo) }));
      db.inquiries = act.inquiries.map((q, i) => ({ id: i + 1, productId: q.productId, name: q.name, email: q.email, message: q.message, created_at: agoIso(q.daysAgo) }));
      db.subscribers = act.subscribers.map(s => ({ email: s.email, name: s.email.split('@')[0], created_at: agoIso(s.daysAgo) }));
      db.giftcards = act.giftcards.map(g => ({ code: g.code, amount: g.amount, format: g.format, recipient_name: g.recipientName, sender_name: g.senderName,
        sender_customer_id: g.senderCustomerId, created_at: agoIso(g.daysAgo) }));
      saveDb(db);
      return db;
    })();
    return dbP;
  }

  const cOut = c => ({ customerId: c.customerId, name: c.name, email: c.email, membershipTier: c.membershipTier, points: c.points, joinDate: c.joinDate, role: c.role, status: c.status });
  const pOut = p => ({ id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, rating: p.rating, reviews: p.reviews,
    availability: availOf(p.stock), stock: p.stock, description: p.description, benefits: p.benefits, image: p.image });
  async function sessionCustomer(db) {
    const s = getSession(); if (!s) return null;
    const c = db.customers.find(x => x.email.toLowerCase() === String(s.email).toLowerCase());
    return c && c.status !== 'suspended' ? c : null;
  }

  /** Clears the in-browser demo database (static mode) back to the sample data. */
  async function resetDemo() {
    try { localStorage.removeItem(DB_KEY); } catch (e) {}
    clearSession(); dbP = null; productsCache = null;
  }

  /* ---- static-mode versions of the server's admin routes ---- */
  async function staticAdmin(path, { method = 'GET', body } = {}) {
    const db = await sdb(), me = await sessionCustomer(db);
    if (!me) throw httpErr('Please log in first.', 401);
    if (me.role !== 'admin') throw httpErr('Admin access only.', 403);
    const [res, id] = path.split('/'); const b = body || {};
    const activeAdmins = () => db.customers.filter(c => c.role === 'admin' && c.status === 'active').length;
    const acc = c => { const mine = db.orders.filter(o => o.customerId === c.customerId);
      return { ...cOut(c), orders: mine.length, spent: mine.filter(o => o.status !== 'Cancelled').reduce((t, o) => t + o.total, 0) }; };
    const out = x => { saveDb(db); return x; };

    if (res === 'stats') {
      const live = db.orders.filter(o => o.status !== 'Cancelled');
      const byStatus = {}; db.orders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
      const sold = {}; live.forEach(o => o.items.forEach(i => { sold[i.name] = (sold[i.name] || 0) + i.qty; }));
      return {
        customers: db.customers.filter(c => c.role === 'customer').length, admins: db.customers.filter(c => c.role === 'admin').length,
        orders: db.orders.length, revenue: live.reduce((t, o) => t + o.total, 0), products: db.products.length,
        subscribers: db.subscribers.length, messages: db.messages.length + db.inquiries.length,
        byStatus: Object.entries(byStatus).map(([status, n]) => ({ status, n })),
        recent: db.orders.slice().sort((a, b) => b.id - a.id).slice(0, 6).map(o => ({ ref: o.ref, name: o.name, total: o.total, status: o.status, created_at: o.date })),
        lowStock: db.products.filter(p => p.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 8).map(p => ({ id: p.id, name: p.name, stock: p.stock })),
        top: Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }))
      };
    }

    if (res === 'customers') {
      if (method === 'GET') return db.customers.slice().sort((a, b) => a.role.localeCompare(b.role) || a.joinDate.localeCompare(b.joinDate)).map(acc);
      if (method === 'POST') {
        const name = String(b.name || '').trim(), email = String(b.email || '').trim(), pw = String(b.password || '');
        if (name.length < 2) throw httpErr('Please enter a name.');
        if (!isEmail(email)) throw httpErr('Please enter a valid email address.');
        if (pw.length < 6) throw httpErr('Password must be at least 6 characters.');
        if (db.customers.some(c => c.email.toLowerCase() === email.toLowerCase())) throw httpErr('An account with this email already exists.', 409);
        const role = b.role === 'admin' ? 'admin' : 'customer';
        const c = { customerId: (role === 'admin' ? 'a' : 'c') + Date.now().toString(36), name, email, membershipTier: ['Insider', 'VIB', 'Rouge', 'Staff'].includes(b.membershipTier) ? b.membershipTier : (role === 'admin' ? 'Staff' : 'Insider'),
          points: Math.max(0, Math.floor(Number(b.points) || 0)), joinDate: nowIso().slice(0, 10), role, status: 'active', hash: await sha256(pw) };
        db.customers.push(c); return out(acc(c));
      }
      const c = db.customers.find(x => x.customerId === id);
      if (!c) throw httpErr('Account not found.', 404);
      if (method === 'PUT') {
        const n = { name: b.name === undefined ? c.name : String(b.name).trim(), email: b.email === undefined ? c.email : String(b.email).trim(),
          tier: b.membershipTier === undefined ? c.membershipTier : b.membershipTier, points: b.points === undefined ? c.points : Math.floor(Number(b.points)),
          role: b.role === undefined ? c.role : b.role, status: b.status === undefined ? c.status : b.status };
        if (n.name.length < 2) throw httpErr('Please enter a name.');
        if (!isEmail(n.email)) throw httpErr('Please enter a valid email address.');
        if (!['Insider', 'VIB', 'Rouge', 'Staff'].includes(n.tier)) throw httpErr('Unknown membership tier.');
        if (!Number.isFinite(n.points) || n.points < 0) throw httpErr('Points must be 0 or more.');
        if (!['customer', 'admin'].includes(n.role)) throw httpErr('Unknown role.');
        if (!['active', 'suspended'].includes(n.status)) throw httpErr('Unknown status.');
        if (db.customers.some(x => x !== c && x.email.toLowerCase() === n.email.toLowerCase())) throw httpErr('Another account already uses this email.', 409);
        const loses = c.role === 'admin' && c.status === 'active' && (n.role !== 'admin' || n.status !== 'active');
        if (loses && activeAdmins() <= 1) throw httpErr('You cannot demote or suspend the last active admin.', 409);
        if (c.customerId === me.customerId && (n.role !== 'admin' || n.status !== 'active')) throw httpErr('You cannot demote or suspend your own account.', 409);
        if (b.password) { if (String(b.password).length < 6) throw httpErr('Password must be at least 6 characters.'); c.hash = await sha256(b.password); }
        Object.assign(c, { name: n.name, email: n.email, membershipTier: n.tier, points: n.points, role: n.role, status: n.status });
        return out(acc(c));
      }
      if (method === 'DELETE') {
        if (c.customerId === me.customerId) throw httpErr('You cannot delete your own account.', 409);
        if (c.role === 'admin' && c.status === 'active' && activeAdmins() <= 1) throw httpErr('You cannot delete the last active admin.', 409);
        db.orders.forEach(o => { if (o.customerId === c.customerId) o.customerId = null; });
        db.customers.splice(db.customers.indexOf(c), 1); return out({ success: true });
      }
    }

    if (res === 'orders') {
      if (method === 'GET') return db.orders.slice().sort((a, b) => b.id - a.id);
      const o = db.orders.find(x => String(x.id) === id);
      if (!o) throw httpErr('Order not found.', 404);
      if (method === 'PUT') {
        const st = b.status;
        if (!['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(st)) throw httpErr('Unknown order status.');
        if (o.status === 'Cancelled' && st !== 'Cancelled') throw httpErr('A cancelled order cannot be reopened.', 409);
        if (st === 'Cancelled' && o.status !== 'Cancelled') {
          o.items.forEach(i => { const p = db.products.find(x => x.id === i.id); if (p) p.stock += i.qty; });
          const c = db.customers.find(x => x.customerId === o.customerId); if (c) c.points = Math.max(c.points - Math.floor(o.total), 0);
        }
        o.status = st; return out({ success: true, status: st });
      }
    }

    if (res === 'products') {
      const read = (ex) => {
        const p = { name: b.name === undefined ? ex?.name : String(b.name).trim(), brand: b.brand === undefined ? ex?.brand : String(b.brand).trim(),
          category: b.category === undefined ? ex?.category : String(b.category).trim(), price: b.price === undefined ? ex?.price : Number(b.price),
          stock: b.stock === undefined ? ex?.stock : Math.floor(Number(b.stock)), description: b.description === undefined ? (ex?.description || '') : String(b.description).slice(0, 600),
          image: b.image === undefined ? (ex?.image || '') : String(b.image).slice(0, 400) };
        if (!p.name || p.name.length < 2) throw httpErr('Please enter a product name.');
        if (!p.brand) throw httpErr('Please enter a brand.');
        if (!p.category) throw httpErr('Please enter a category.');
        if (!Number.isFinite(p.price) || p.price < 0) throw httpErr('Price must be 0 or more.');
        if (!Number.isFinite(p.stock) || p.stock < 0) throw httpErr('Stock must be 0 or more.');
        return p;
      };
      if (method === 'GET') return db.products.map(pOut);
      if (method === 'POST') {
        const p = read(); const n = Math.max(0, ...db.products.map(x => parseInt(String(x.id).slice(1), 10) || 0)) + 1;
        const np = { ...p, id: 'p' + String(n).padStart(3, '0'), rating: 0, reviews: 0, benefits: [],
          image: p.image || 'https://placehold.co/700x700/EFE3D3/2a1710?text=' + encodeURIComponent(p.name) };
        db.products.push(np); productsCache = null; return out(pOut(np));
      }
      const p = db.products.find(x => x.id === id);
      if (!p) throw httpErr('Product not found.', 404);
      if (method === 'PUT') { Object.assign(p, read(p)); productsCache = null; return out(pOut(p)); }
      if (method === 'DELETE') {
        if (db.orders.some(o => o.items.some(i => i.id === p.id))) throw httpErr('This product is part of past orders. Set its stock to 0 instead of deleting it.', 409);
        db.products.splice(db.products.indexOf(p), 1); productsCache = null; return out({ success: true });
      }
    }

    if (res === 'inbox') {
      return {
        messages: db.messages.slice().reverse(),
        inquiries: db.inquiries.slice().reverse().map(q => ({ ...q, product: (db.products.find(p => p.id === q.productId) || {}).name || null })),
        subscribers: db.subscribers.slice().reverse(),
        giftcards: db.giftcards.slice().reverse()
      };
    }
    throw httpErr('Endpoint not found.', 404);
  }

  /* ---------- PRODUCTS ---------- */
  let productsCache;
  async function products(force) {
    if (productsCache && !force) return productsCache;
    productsCache = (await mode()) === 'server' ? await request('api/products') : (await sdb()).products.map(pOut);
    // Resolve placeholders and older numbered filenames to the bundled product photos.
    // Keep custom product photos, customer data, stock, and orders unchanged.
    const needsBundledImage = p => /^https?:\/\/placehold\.co\//.test(p.image || '') || p.image === `images/products/${p.id}.png`;
    if (productsCache.some(needsBundledImage)) {
      try {
        const catalog = await staticJSON('data/products.json');
        const byId = new Map(catalog.map(p => [p.id, p]));
        productsCache = productsCache.map(p => {
          const local = byId.get(p.id);
          return local && local.name === p.name && needsBundledImage(p)
            ? { ...p, image: local.image } : p;
        });
      } catch (e) { /* Retain existing images if the bundled catalogue is unavailable. */ }
    }
    return productsCache;
  }

  /* ---------- CUSTOMERS (dataset 2: member directory, emails masked, staff never listed) ---------- */
  async function customers() {
    if ((await mode()) === 'server') return request('api/customers');
    const db = await sdb(), me = await sessionCustomer(db);
    return db.customers.filter(c => c.role === 'customer').map(c => { const o = cOut(c); if (!me || me.customerId !== c.customerId) o.email = maskEmail(o.email); return o; });
  }

  async function signup({ name, email, password }) {
    if ((await mode()) === 'server') {
      const r = await request('api/customers', { method: 'POST', body: { name, email, password } });
      setSession({ email: r.customer.email, name: r.customer.name, customerId: r.customer.customerId, role: r.customer.role, token: r.token });
      return r.customer;
    }
    const db = await sdb();
    name = String(name || '').trim(); email = String(email || '').trim();
    if (name.length < 2) throw httpErr('Please enter your name.');
    if (!isEmail(email)) throw httpErr('Please enter a valid email address.');
    if (String(password || '').length < 6) throw httpErr('Password must be at least 6 characters.');
    if (db.customers.some(c => c.email.toLowerCase() === email.toLowerCase())) throw httpErr('An account with this email already exists.', 409);
    const c = { customerId: 'c' + Date.now().toString(36), name, email, membershipTier: 'Insider', points: 0, joinDate: nowIso().slice(0, 10), role: 'customer', status: 'active', hash: await sha256(password) };
    db.customers.push(c); saveDb(db);
    setSession({ email: c.email, name: c.name, customerId: c.customerId, role: 'customer' });
    return cOut(c);
  }

  async function login({ email, password }) {
    if ((await mode()) === 'server') {
      const r = await request('api/login', { method: 'POST', body: { email, password } });
      setSession({ email: r.customer.email, name: r.customer.name, customerId: r.customer.customerId, role: r.customer.role, token: r.token });
      return r.customer;
    }
    const db = await sdb();
    const c = db.customers.find(x => x.email.toLowerCase() === String(email).trim().toLowerCase());
    if (!c || !(await pwOk(String(password), c.hash))) throw httpErr('Incorrect email or password.', 401);
    if (c.status === 'suspended') throw httpErr('This account has been suspended. Please contact support.', 403);
    setSession({ email: c.email, name: c.name, customerId: c.customerId, role: c.role });
    return cOut(c);
  }

  async function logout() {
    if ((await mode()) === 'server' && getSession()?.token) { try { await request('api/logout', { method: 'POST' }); } catch (e) {} }
    clearSession();
  }

  /** The logged-in account's fresh profile, or null if not logged in. */
  async function me() {
    const s = getSession();
    if (!s) return null;
    if ((await mode()) === 'server') {
      if (!s.token) { clearSession(); return null; }
      try { return await request('api/me'); }
      catch (e) { if (e.status === 401) { clearSession(); return null; } throw e; }
    }
    const c = await sessionCustomer(await sdb());
    if (!c) { clearSession(); return null; }
    return cOut(c);
  }

  /** Where each role lands after logging in. */
  const homeFor = role => (role === 'admin' ? 'admin.html' : 'account.html');

  /** Edit own name / change password. */
  async function updateProfile({ name, currentPassword, newPassword }) {
    if ((await mode()) === 'server') {
      const c = await request('api/me', { method: 'PUT', body: { name, currentPassword, newPassword } });
      const s = getSession(); if (s) setSession({ ...s, name: c.name });
      return c;
    }
    const db = await sdb(), c = await sessionCustomer(db);
    if (!c) throw httpErr('Please log in first.', 401);
    const nm = String(name ?? c.name).trim();
    if (nm.length < 2) throw httpErr('Please enter your name.');
    if (newPassword) {
      if (String(newPassword).length < 6) throw httpErr('New password must be at least 6 characters.');
      if (!(await pwOk(String(currentPassword || ''), c.hash))) throw httpErr('Your current password is incorrect.', 403);
      c.hash = await sha256(newPassword);
    }
    c.name = nm; saveDb(db);
    const s = getSession(); if (s) setSession({ ...s, name: nm });
    return cOut(c);
  }

  async function myGiftCards() {
    if ((await mode()) === 'server') return getSession()?.token ? request('api/me/giftcards') : [];
    const db = await sdb(), c = await sessionCustomer(db);
    return c ? db.giftcards.filter(g => g.sender_customer_id === c.customerId).reverse() : [];
  }

  /** Admin calls: Api.admin('stats'), Api.admin('customers/ID', {method:'PUT', body}). Admin login required (checked by the server, or by the demo database in static mode). */
  async function admin(path, opts) {
    if ((await mode()) === 'server') return request('api/admin/' + path, opts);
    return staticAdmin(path, opts);
  }

  /* ---------- ORDERS ---------- */
  async function placeOrder({ items, name, email, address }) {
    if (!items || !items.length) throw new Error('Your bag is empty.');
    if ((await mode()) === 'server') {
      const r = await request('api/orders', { method: 'POST', body: { items: items.map(i => ({ id: i.id, qty: i.qty })), name, email, address } });
      productsCache = null; // stock changed
      return r;
    }
    const db = await sdb(), me = await sessionCustomer(db);
    name = String(name || me?.name || '').trim(); email = String(email || me?.email || '').trim();
    if (name.length < 2) throw httpErr('Please enter your name.');
    if (!isEmail(email)) throw httpErr('Please enter a valid email address.');
    const lines = items.map(it => {
      const qty = Math.floor(Number(it.qty)), p = db.products.find(x => x.id === String(it.id));
      if (!p) throw httpErr('A product in your bag is no longer available.', 404);
      if (!(qty >= 1 && qty <= 20)) throw httpErr('Invalid quantity for ' + p.name + '.');
      if (p.stock < qty) throw httpErr(p.stock ? `Only ${p.stock} left of ${p.name}.` : `${p.name} is out of stock.`, 409);
      return { p, qty };
    });
    const total = lines.reduce((t, l) => t + l.p.price * l.qty, 0);
    const earned = me ? Math.floor(total) : 0;
    const order = { id: db.seq++, ref: ref('SEP'), customerId: me?.customerId || null, name, email, address: String(address || '').slice(0, 300), total, status: 'Placed', date: nowIso(),
      items: lines.map(l => ({ id: l.p.id, name: l.p.name, price: l.p.price, qty: l.qty })) };
    lines.forEach(l => { l.p.stock -= l.qty; });
    if (me) me.points += earned;
    db.orders.push(order); saveDb(db); productsCache = null;
    return { success: true, ref: order.ref, total, earned, items: lines.length };
  }

  async function myOrders() {
    const s = getSession();
    if (!s) return [];
    if ((await mode()) === 'server') return request('api/orders');
    const db = await sdb(), me = await sessionCustomer(db);
    return me ? db.orders.filter(o => o.customerId === me.customerId).sort((a, b) => b.id - a.id) : [];
  }

  /* ---------- FORMS: newsletter, contact, inquiries, gift cards ---------- */
  async function subscribe(email) {
    if (!isEmail(email)) throw new Error('Please enter a valid email address.');
    if ((await mode()) === 'server') return request('api/subscribe', { method: 'POST', body: { email } });
    const db = await sdb();
    const dup = db.subscribers.some(x => x.email.toLowerCase() === email.toLowerCase());
    if (!dup) { db.subscribers.push({ email, name: email.split('@')[0], created_at: nowIso() }); saveDb(db); }
    return { success: true, alreadySubscribed: dup, message: dup ? "You're already subscribed. Thanks for being a Beauty Insider!" : "You're in! Check your inbox for your welcome offer." };
  }

  async function sendMessage(m) {
    if ((await mode()) === 'server') return request('api/messages', { method: 'POST', body: m });
    const db = await sdb(), r = ref('MSG');
    db.messages.push({ ref: r, name: m.name, email: m.email, subject: m.subject, message: m.message, created_at: nowIso() }); saveDb(db);
    return { success: true, ref: r };
  }

  async function sendInquiry(q) {
    if ((await mode()) === 'server') return request('api/inquiries', { method: 'POST', body: q });
    const db = await sdb();
    db.inquiries.push({ id: db.inquiries.length + 1, productId: q.productId || null, name: q.name, email: q.email, message: q.message, created_at: nowIso() }); saveDb(db);
    return { success: true };
  }

  async function sendGiftCard(g) {
    if ((await mode()) === 'server') return request('api/giftcards', { method: 'POST', body: g });
    const amount = Math.round(Number(g.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 100 || amount > 50000) throw httpErr('Gift card amount must be between \u20b1100 and \u20b150,000.');
    const db = await sdb(), me = await sessionCustomer(db);
    const part = () => Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, '0');
    const code = 'GC-' + part() + '-' + part() + '-' + part();
    db.giftcards.push({ code, amount, format: g.format === 'physical' ? 'physical' : 'email', recipient_name: g.recipientName, sender_name: g.senderName || me?.name || '', sender_customer_id: me?.customerId || null, created_at: nowIso() });
    saveDb(db);
    return { success: true, code, amount };
  }

  window.Api = { mode, products, customers, signup, login, logout, me, placeOrder, myOrders, subscribe, sendMessage, sendInquiry, sendGiftCard, getSession, esc, isEmail, homeFor, updateProfile, myGiftCards, admin, resetDemo };

  /* header account icon -> the right dashboard for whoever is logged in (admin.html or account.html) */
  document.addEventListener('DOMContentLoaded', () => {
    const s = getSession();
    if (!s) return;
    const target = homeFor(s.role);
    document.querySelectorAll('a[aria-label="Account"], .mobile-nav a[href="login.html"]').forEach(a => {
      a.href = target;
      if (a.classList.contains('btn')) a.textContent = s.role === 'admin' ? 'Admin' : 'Account';
    });
  });
})();

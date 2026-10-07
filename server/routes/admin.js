/**
 * routes/admin.js — everything under /api/admin requires a logged-in ADMIN (role check on the server).
 *
 *   GET    /api/admin/stats                 dashboard numbers + recent orders + low stock
 *   GET    /api/admin/customers             all accounts (full emails, role, status, order count, total spent)
 *   POST   /api/admin/customers             create an account {name,email,password,role?,tier?,points?}
 *   PUT    /api/admin/customers/:id         edit {name,email,tier,points,role,status,password?}
 *   DELETE /api/admin/customers/:id         delete an account (their orders are kept, unlinked)
 *   GET    /api/admin/orders                every order with its items
 *   PUT    /api/admin/orders/:id            change status (Placed/Processing/Shipped/Delivered/Cancelled)
 *   GET    /api/admin/products              catalogue incl. stock
 *   POST   /api/admin/products              add a product
 *   PUT    /api/admin/products/:id          edit price / stock / details
 *   DELETE /api/admin/products/:id          remove a product (blocked if it appears in an order)
 *   GET    /api/admin/inbox                 messages, inquiries, subscribers, gift cards
 */
const express = require('express');
const { db, hashPassword, productOut } = require('../db');
const { isEmail, clean, bad, requireAdmin } = require('../util');

const router = express.Router();
router.use(requireAdmin);

const STATUSES = ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const TIERS = ['Insider', 'VIB', 'Rouge', 'Staff'];
const adminCount = () => db.prepare(`SELECT COUNT(*) n FROM customers WHERE role = 'admin' AND status = 'active'`).get().n;

const accountOut = r => ({
  customerId: r.id, name: r.name, email: r.email, membershipTier: r.tier, points: r.points, joinDate: r.join_date,
  role: r.role, status: r.status, orders: r.orders || 0, spent: r.spent || 0
});

/* ---------- dashboard ---------- */
router.get('/stats', (_req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const revenue = one(`SELECT COALESCE(SUM(total),0) v FROM orders WHERE status != 'Cancelled'`).v;
  const byStatus = db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all();
  const recent = db.prepare('SELECT ref,name,total,status,created_at FROM orders ORDER BY id DESC LIMIT 6').all();
  const lowStock = db.prepare('SELECT id,name,stock FROM products WHERE stock <= 5 ORDER BY stock, name LIMIT 8').all();
  const top = db.prepare(`SELECT oi.name, SUM(oi.qty) qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
                          WHERE o.status != 'Cancelled' GROUP BY oi.product_id ORDER BY qty DESC LIMIT 5`).all();
  res.json({
    customers: one(`SELECT COUNT(*) n FROM customers WHERE role = 'customer'`).n,
    admins: one(`SELECT COUNT(*) n FROM customers WHERE role = 'admin'`).n,
    orders: one('SELECT COUNT(*) n FROM orders').n,
    revenue, products: one('SELECT COUNT(*) n FROM products').n,
    subscribers: one('SELECT COUNT(*) n FROM subscribers').n,
    messages: one('SELECT COUNT(*) n FROM messages').n + one('SELECT COUNT(*) n FROM inquiries').n,
    byStatus, recent, lowStock, top
  });
});

/* ---------- accounts ---------- */
router.get('/customers', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(o.id) orders, COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.total END),0) spent
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id ORDER BY c.role, c.join_date`).all();
  res.json(rows.map(accountOut));
});

router.post('/customers', (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), email = clean(b.email, 254);
  const password = typeof b.password === 'string' ? b.password : '';
  const role = b.role === 'admin' ? 'admin' : 'customer';
  const tier = TIERS.includes(b.membershipTier) ? b.membershipTier : (role === 'admin' ? 'Staff' : 'Insider');
  const points = Math.max(0, Math.floor(Number(b.points) || 0));
  if (name.length < 2) return bad(res, 'Please enter a name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  if (password.length < 6) return bad(res, 'Password must be at least 6 characters.');
  if (db.prepare('SELECT 1 FROM customers WHERE email = ?').get(email)) return bad(res, 'An account with this email already exists.', 409);
  const id = (role === 'admin' ? 'a' : 'c') + Date.now().toString(36);
  db.prepare('INSERT INTO customers (id,name,email,password_hash,tier,points,join_date,role,status) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, name, email, hashPassword(password), tier, points, new Date().toISOString().slice(0, 10), role, 'active');
  res.status(201).json(accountOut(db.prepare('SELECT * FROM customers WHERE id = ?').get(id)));
});

router.put('/customers/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return bad(res, 'Account not found.', 404);
  const b = req.body || {};
  const name = b.name === undefined ? row.name : clean(b.name, 80);
  const email = b.email === undefined ? row.email : clean(b.email, 254);
  const tier = b.membershipTier === undefined ? row.tier : b.membershipTier;
  const points = b.points === undefined ? row.points : Math.floor(Number(b.points));
  const role = b.role === undefined ? row.role : b.role;
  const status = b.status === undefined ? row.status : b.status;
  if (name.length < 2) return bad(res, 'Please enter a name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  if (!TIERS.includes(tier)) return bad(res, 'Unknown membership tier.');
  if (!Number.isFinite(points) || points < 0) return bad(res, 'Points must be 0 or more.');
  if (!['customer', 'admin'].includes(role)) return bad(res, 'Unknown role.');
  if (!['active', 'suspended'].includes(status)) return bad(res, 'Unknown status.');
  const dup = db.prepare('SELECT id FROM customers WHERE email = ? AND id != ?').get(email, row.id);
  if (dup) return bad(res, 'Another account already uses this email.', 409);
  /* never let the last active admin lock everyone out */
  const losesAdmin = row.role === 'admin' && row.status === 'active' && (role !== 'admin' || status !== 'active');
  if (losesAdmin && adminCount() <= 1) return bad(res, 'You cannot demote or suspend the last active admin.', 409);
  if (row.id === req.customer.id && (role !== 'admin' || status !== 'active')) return bad(res, 'You cannot demote or suspend your own account.', 409);
  let hash = row.password_hash;
  if (b.password) {
    if (typeof b.password !== 'string' || b.password.length < 6) return bad(res, 'Password must be at least 6 characters.');
    hash = hashPassword(b.password);
  }
  db.prepare('UPDATE customers SET name=?,email=?,tier=?,points=?,role=?,status=?,password_hash=? WHERE id=?')
    .run(name, email, tier, points, role, status, hash, row.id);
  if (status === 'suspended') db.prepare('DELETE FROM sessions WHERE customer_id = ?').run(row.id);
  res.json(accountOut(db.prepare('SELECT * FROM customers WHERE id = ?').get(row.id)));
});

router.delete('/customers/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return bad(res, 'Account not found.', 404);
  if (row.id === req.customer.id) return bad(res, 'You cannot delete your own account.', 409);
  if (row.role === 'admin' && row.status === 'active' && adminCount() <= 1) return bad(res, 'You cannot delete the last active admin.', 409);
  db.transaction(() => {
    db.prepare('UPDATE orders SET customer_id = NULL WHERE customer_id = ?').run(row.id);
    db.prepare('UPDATE gift_cards SET sender_customer_id = NULL WHERE sender_customer_id = ?').run(row.id);
    db.prepare('DELETE FROM customers WHERE id = ?').run(row.id);
  })();
  res.json({ success: true });
});

/* ---------- orders ---------- */
router.get('/orders', (_req, res) => {
  const items = db.prepare('SELECT product_id,name,price,qty FROM order_items WHERE order_id = ?');
  res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all().map(o => ({
    id: o.id, ref: o.ref, customerId: o.customer_id, name: o.name, email: o.email, address: o.address,
    total: o.total, status: o.status, date: o.created_at,
    items: items.all(o.id).map(i => ({ id: i.product_id, name: i.name, price: i.price, qty: i.qty }))
  })));
});

router.put('/orders/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return bad(res, 'Order not found.', 404);
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return bad(res, 'Unknown order status.');
  if (o.status === 'Cancelled' && status !== 'Cancelled') return bad(res, 'A cancelled order cannot be reopened.', 409);
  db.transaction(() => {
    if (status === 'Cancelled' && o.status !== 'Cancelled') {
      /* put the stock back and take the points back */
      db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(o.id)
        .forEach(i => db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id));
      if (o.customer_id) db.prepare('UPDATE customers SET points = MAX(points - ?, 0) WHERE id = ?').run(Math.floor(o.total), o.customer_id);
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, o.id);
  })();
  res.json({ success: true, status });
});

/* ---------- products ---------- */
function readProduct(b, existing) {
  const p = {
    name: b.name === undefined ? existing?.name : clean(b.name, 120),
    brand: b.brand === undefined ? existing?.brand : clean(b.brand, 80),
    category: b.category === undefined ? existing?.category : clean(b.category, 40),
    price: b.price === undefined ? existing?.price : Number(b.price),
    stock: b.stock === undefined ? existing?.stock : Math.floor(Number(b.stock)),
    description: b.description === undefined ? (existing?.description ?? '') : clean(b.description, 600),
    image: b.image === undefined ? (existing?.image ?? '') : clean(b.image, 400)
  };
  if (!p.name || p.name.length < 2) return { error: 'Please enter a product name.' };
  if (!p.brand) return { error: 'Please enter a brand.' };
  if (!p.category) return { error: 'Please enter a category.' };
  if (!Number.isFinite(p.price) || p.price < 0) return { error: 'Price must be 0 or more.' };
  if (!Number.isFinite(p.stock) || p.stock < 0) return { error: 'Stock must be 0 or more.' };
  return { p };
}

router.get('/products', (_req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY id').all().map(productOut)));

router.post('/products', (req, res) => {
  const { p, error } = readProduct(req.body || {});
  if (error) return bad(res, error);
  const next = db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(id,2) AS INTEGER)),0)+1 n FROM products WHERE id GLOB 'p[0-9]*'`).get().n;
  const id = 'p' + String(next).padStart(3, '0');
  db.prepare(`INSERT INTO products (id,name,brand,category,price,rating,reviews,description,benefits,image,stock)
              VALUES (?,?,?,?,?,0,0,?,'[]',?,?)`)
    .run(id, p.name, p.brand, p.category, p.price, p.description, p.image || `https://placehold.co/700x700/EFE3D3/2a1710?text=${encodeURIComponent(p.name)}`, p.stock);
  res.status(201).json(productOut(db.prepare('SELECT * FROM products WHERE id = ?').get(id)));
});

router.put('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return bad(res, 'Product not found.', 404);
  const { p, error } = readProduct(req.body || {}, row);
  if (error) return bad(res, error);
  db.prepare('UPDATE products SET name=?,brand=?,category=?,price=?,stock=?,description=?,image=? WHERE id=?')
    .run(p.name, p.brand, p.category, p.price, p.stock, p.description, p.image, row.id);
  res.json(productOut(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)));
});

router.delete('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return bad(res, 'Product not found.', 404);
  if (db.prepare('SELECT 1 FROM order_items WHERE product_id = ?').get(row.id)) return bad(res, 'This product is part of past orders. Set its stock to 0 instead of deleting it.', 409);
  db.prepare('UPDATE inquiries SET product_id = NULL WHERE product_id = ?').run(row.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
  res.json({ success: true });
});

/* ---------- inbox ---------- */
router.get('/inbox', (_req, res) => {
  res.json({
    messages: db.prepare('SELECT ref,name,email,subject,message,created_at FROM messages ORDER BY id DESC').all(),
    inquiries: db.prepare(`SELECT i.id, i.name, i.email, i.message, i.created_at, p.name product
                           FROM inquiries i LEFT JOIN products p ON p.id = i.product_id ORDER BY i.id DESC`).all(),
    subscribers: db.prepare('SELECT email,name,created_at FROM subscribers ORDER BY created_at DESC').all(),
    giftcards: db.prepare('SELECT code,amount,format,recipient_name,sender_name,created_at FROM gift_cards ORDER BY id DESC').all()
  });
});

module.exports = router;

/**
 * routes/orders.js
 *   POST /api/orders   place an order { items:[{id,qty}], name, email, address }
 *                      - prices are ALWAYS re-read from the database (the client's prices are ignored)
 *                      - stock is checked and decremented in one transaction
 *                      - a logged-in customer (Bearer token) earns 1 point per whole peso
 *   GET  /api/orders   the logged-in customer's orders (Bearer token)
 */
const express = require('express');
const { db } = require('../db');
const { isEmail, clean, bad, requireAuth } = require('../util');

const router = express.Router();

router.post('/', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const name = clean(req.body?.name, 80) || req.customer?.name || '';
  const email = clean(req.body?.email, 254) || req.customer?.email || '';
  const address = clean(req.body?.address, 300);
  if (!items.length || items.length > 50) return bad(res, 'Your bag is empty.');
  if (name.length < 2) return bad(res, 'Please enter your name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');

  const getP = db.prepare('SELECT * FROM products WHERE id = ?');
  const place = db.transaction(() => {
    const lines = [];
    for (const it of items) {
      const qty = Math.floor(Number(it.qty));
      const p = getP.get(String(it.id));
      if (!p) throw Object.assign(new Error('A product in your bag is no longer available.'), { code: 404 });
      if (!(qty >= 1 && qty <= 20)) throw Object.assign(new Error(`Invalid quantity for ${p.name}.`), { code: 400 });
      if (p.stock < qty) throw Object.assign(new Error(p.stock ? `Only ${p.stock} left of ${p.name}.` : `${p.name} is out of stock.`), { code: 409 });
      lines.push({ p, qty });
    }
    const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
    const ref = 'SEP-' + Date.now().toString().slice(-7) + Math.floor(Math.random() * 90 + 10);
    const info = db.prepare('INSERT INTO orders (ref,customer_id,name,email,address,total,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(ref, req.customer?.id || null, name, email, address, total, 'Placed', new Date().toISOString());
    const insItem = db.prepare('INSERT INTO order_items (order_id,product_id,name,price,qty) VALUES (?,?,?,?,?)');
    const dec = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    lines.forEach(l => { insItem.run(info.lastInsertRowid, l.p.id, l.p.name, l.p.price, l.qty); dec.run(l.qty, l.p.id); });
    let earned = 0;
    if (req.customer) {
      earned = Math.floor(total);
      db.prepare('UPDATE customers SET points = points + ? WHERE id = ?').run(earned, req.customer.id);
    }
    return { ref, total, earned, items: lines.length };
  });

  try { res.status(201).json({ success: true, ...place() }); }
  catch (e) { bad(res, e.message, e.code || 500); }
});

router.get('/', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 50').all(req.customer.id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  res.json(orders.map(o => ({
    ref: o.ref, total: o.total, status: o.status, date: o.created_at,
    items: items.all(o.id).map(i => ({ id: i.product_id, name: i.name, price: i.price, qty: i.qty }))
  })));
});

module.exports = router;

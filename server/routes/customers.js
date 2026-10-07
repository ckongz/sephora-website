/**
 * routes/customers.js
 *   GET  /api/customers        member directory (NO passwords or hashes; other members' emails are masked server-side)
 *   GET  /api/customers/:id    single customer
 *   POST /api/customers        sign up  { name, email, password }  -> { token, customer }
 *   POST /api/login            log in   { email, password }        -> { token, customer }
 *   GET  /api/me               current customer (Bearer token)
 */
const express = require('express');
const { db, hashPassword, verifyPassword, customerOut } = require('../db');
const { isEmail, clean, bad, rateLimit, newSession, requireAuth } = require('../util');

const router = express.Router();

/** Other members' emails are masked on the SERVER (j•••@example.com); only the logged-in member sees their own in full. */
const maskEmail = e => String(e).replace(/^(.).*(@.*)$/, (_, a, d) => a + '\u2022\u2022\u2022' + d);
const forViewer = (row, viewer) => {
  const c = customerOut(row);
  if (!viewer || viewer.id !== row.id) c.email = maskEmail(c.email);
  return c;
};

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many attempts, try again in a few minutes.' });

router.get('/', (req, res) => {
  /* public member directory: staff accounts are never listed */
  res.json(db.prepare(`SELECT * FROM customers WHERE role = 'customer' ORDER BY join_date`).all().map(r => forViewer(r, req.customer)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row || (row.role !== 'customer' && req.customer?.id !== row.id)) return bad(res, 'Customer not found.', 404);
  res.json(forViewer(row, req.customer));
});

router.post('/', authLimiter, (req, res) => {
  const name = clean(req.body?.name, 80);
  const email = clean(req.body?.email, 254);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (name.length < 2) return bad(res, 'Please enter your name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  if (password.length < 6) return bad(res, 'Password must be at least 6 characters.');
  if (db.prepare('SELECT 1 FROM customers WHERE email = ?').get(email)) return bad(res, 'An account with this email already exists.', 409);

  const id = 'c' + String(db.prepare('SELECT COUNT(*) n FROM customers').get().n + 1).padStart(3, '0') + Date.now().toString(36).slice(-3);
  db.prepare('INSERT INTO customers (id,name,email,password_hash,tier,points,join_date) VALUES (?,?,?,?,?,?,?)')
    .run(id, name, email, hashPassword(password), 'Insider', 0, new Date().toISOString().slice(0, 10));
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.status(201).json({ token: newSession(id), customer: customerOut(row) });
});

module.exports = router;
module.exports.authRoutes = (app, readAuth) => {
  app.post('/api/login', authLimiter, (req, res) => {
    const email = clean(req.body?.email, 254);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!isEmail(email) || !password) return bad(res, 'Please enter your email and password.');
    const row = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, row.password_hash)) return bad(res, 'Incorrect email or password.', 401);
    if (row.status === 'suspended') return bad(res, 'This account has been suspended. Please contact support.', 403);
    res.json({ token: newSession(row.id), customer: customerOut(row) });
  });
  app.get('/api/me', readAuth, requireAuth, (req, res) => res.json(customerOut(req.customer)));

  /* customers (and admins) can edit their own name and password */
  app.put('/api/me', readAuth, requireAuth, authLimiter, (req, res) => {
    const b = req.body || {};
    const name = b.name === undefined ? req.customer.name : clean(b.name, 80);
    if (name.length < 2) return bad(res, 'Please enter your name.');
    let hash = req.customer.password_hash;
    if (b.newPassword !== undefined && b.newPassword !== '') {
      if (typeof b.newPassword !== 'string' || b.newPassword.length < 6) return bad(res, 'New password must be at least 6 characters.');
      if (!verifyPassword(String(b.currentPassword || ''), req.customer.password_hash)) return bad(res, 'Your current password is incorrect.', 403);
      hash = hashPassword(b.newPassword);
    }
    db.prepare('UPDATE customers SET name = ?, password_hash = ? WHERE id = ?').run(name, hash, req.customer.id);
    res.json(customerOut(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer.id)));
  });

  /* gift cards the logged-in member has bought */
  app.get('/api/me/giftcards', readAuth, requireAuth, (req, res) => {
    res.json(db.prepare('SELECT code,amount,format,recipient_name,created_at FROM gift_cards WHERE sender_customer_id = ? ORDER BY id DESC').all(req.customer.id));
  });
  app.post('/api/logout', readAuth, (req, res) => {
    if (req.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    res.json({ success: true });
  });
};

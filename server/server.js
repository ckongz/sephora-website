/**
 * server.js — Sephora Project backend (Express + SQLite).
 *
 *   GET  /api/health
 *   GET  /api/products[?category&brand&q&inStock]   GET /api/products/:id
 *   GET  /api/customers   GET /api/customers/:id    POST /api/customers (sign up)
 *   POST /api/login       GET /api/me               POST /api/logout
 *   POST /api/orders      GET /api/orders (auth)
 *   PUT  /api/me (edit own profile)   GET /api/me/giftcards
 *   /api/admin/*  (admin role only: stats, customers, orders, products, inbox)
 *   POST /api/subscribe   POST /api/messages        POST /api/inquiries
 *   POST /api/giftcards
 *
 * Run:  cd server && npm install && npm start   ->  http://localhost:3000
 */
const express = require('express');
const path = require('path');
const { db } = require('./db');
const { readAuth, rateLimit, bad } = require('./util');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

/* never serve backend source, the database or dotfiles over HTTP */
app.use((req, res, next) => {
  const p = decodeURIComponent(req.path).toLowerCase();
  if (p.startsWith('/server') || p.endsWith('.db') || p.includes('/.') || p.includes('node_modules')) return res.status(404).end();
  next();
});
app.use(express.static(ROOT, { dotfiles: 'ignore', extensions: ['html'] }));

/* ---- API ---- */
app.use('/api', readAuth);
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 240 }));
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });

app.get('/api/health', (_req, res) => {
  const n = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  res.json({ status: 'ok', database: 'sqlite', products: n('products'), customers: n('customers'), orders: n('orders') });
});
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
require('./routes/customers').authRoutes(app, readAuth);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/orders', writeLimiter, require('./routes/orders'));
app.use('/api/subscribe', writeLimiter, require('./routes/subscribe'));
app.use('/api/giftcards', writeLimiter, require('./routes/giftcards'));
app.use('/api', writeLimiter, require('./routes/contact'));

app.use('/api', (_req, res) => bad(res, 'Endpoint not found.', 404));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return bad(res, 'Invalid JSON body.');
  console.error('[error]', err);
  bad(res, 'Something went wrong on our side.', 500);
});

app.listen(PORT, () => console.log(`Sephora Project server running at http://localhost:${PORT}`));

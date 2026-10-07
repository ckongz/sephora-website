/** util.js — small shared helpers: validation, rate limiting, auth. */
const crypto = require('crypto');
const { db, customerOut } = require('./db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = v => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim());
const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

/** Tiny in-memory rate limiter (per IP, per window). Enough for a demo server. */
function rateLimit({ windowMs, max, message = 'Too many requests, please try again later.' }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const rec = hits.get(key) && hits.get(key).reset > now ? hits.get(key) : { n: 0, reset: now + windowMs };
    rec.n++;
    hits.set(key, rec);
    if (rec.n > max) return bad(res, message, 429);
    next();
  };
}

function newSession(customerId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, customer_id, created_at) VALUES (?,?,?)')
    .run(token, customerId, new Date().toISOString());
  return token;
}

/** Reads "Authorization: Bearer <token>"; sets req.customer if valid. */
function readAuth(req, _res, next) {
  const m = /^Bearer (\w+)$/.exec(req.get('authorization') || '');
  if (m) {
    const row = db.prepare(`SELECT c.* FROM sessions s JOIN customers c ON c.id = s.customer_id WHERE s.token = ?`).get(m[1]);
    if (row && row.status !== 'suspended') { req.customer = row; req.token = m[1]; }
  }
  next();
}
const requireAuth = (req, res, next) => (req.customer ? next() : bad(res, 'Please log in first.', 401));
const requireAdmin = (req, res, next) => {
  if (!req.customer) return bad(res, 'Please log in first.', 401);
  if (req.customer.role !== 'admin') return bad(res, 'Admin access only.', 403);
  next();
};

module.exports = { isEmail, clean, bad, rateLimit, newSession, readAuth, requireAuth, requireAdmin, customerOut };

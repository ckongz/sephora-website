/**
 * routes/contact.js
 *   POST /api/messages    contact form   { name, email, subject, date, message }
 *   POST /api/inquiries   product inquiry { productId, name, email, message }
 */
const express = require('express');
const { db } = require('../db');
const { isEmail, clean, bad } = require('../util');

const router = express.Router();

router.post('/messages', (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), email = clean(b.email, 254), subject = clean(b.subject, 150),
        date = clean(b.date, 10), message = clean(b.message, 600);
  if (name.length < 2) return bad(res, 'Please enter your name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  if (!subject) return bad(res, 'Please enter a subject.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(res, 'Please choose a valid date.');
  if (!message) return bad(res, 'Please enter a message.');
  const ref = 'MSG-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90 + 10);
  db.prepare('INSERT INTO messages (ref,name,email,subject,date,message,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(ref, name, email, subject, date, message, new Date().toISOString());
  res.status(201).json({ success: true, ref });
});

router.post('/inquiries', (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), email = clean(b.email, 254), message = clean(b.message, 600);
  const productId = clean(b.productId, 20);
  if (name.length < 2) return bad(res, 'Please enter your name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  if (!message) return bad(res, 'Please add a short message.');
  if (productId && !db.prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) return bad(res, 'Unknown product.', 404);
  db.prepare('INSERT INTO inquiries (product_id,name,email,message,created_at) VALUES (?,?,?,?,?)')
    .run(productId || null, name, email, message, new Date().toISOString());
  res.status(201).json({ success: true });
});

module.exports = router;

/**
 * routes/giftcards.js
 *   POST /api/giftcards   buy a gift card
 *     { amount, format:'email'|'physical', recipientName, recipientEmail?, shippingAddress?,
 *       senderName, message?, deliveryDate?, promo? }   ->  { success, code, amount }
 * The amount is validated on the server (PHP 100 - 50,000). A logged-in buyer is linked to the card.
 */
const express = require('express');
const crypto = require('crypto');
const { db } = require('../db');
const { isEmail, clean, bad } = require('../util');

const router = express.Router();

const makeCode = () => {
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `GC-${part()}-${part()}-${part()}`;
};

router.post('/', (req, res) => {
  const b = req.body || {};
  const amount = Math.round(Number(b.amount) * 100) / 100;
  const format = b.format === 'physical' ? 'physical' : (b.format === 'email' ? 'email' : '');
  const recipientName = clean(b.recipientName, 80);
  const recipientEmail = clean(b.recipientEmail, 254);
  const shippingAddress = clean(b.shippingAddress, 300);
  const senderName = clean(b.senderName, 80) || req.customer?.name || '';
  const message = clean(b.message, 200);
  const promo = clean(b.promo, 30);
  const deliveryDate = clean(b.deliveryDate, 10);

  if (!Number.isFinite(amount) || amount < 100 || amount > 50000) return bad(res, 'Gift card amount must be between \u20b1100 and \u20b150,000.');
  if (!format) return bad(res, 'Please choose e-gift card or physical card.');
  if (recipientName.length < 2) return bad(res, "Please enter the recipient's name.");
  if (senderName.length < 2) return bad(res, 'Please enter your name.');
  if (format === 'email' && !isEmail(recipientEmail)) return bad(res, "Please enter a valid email for the recipient.");
  if (format === 'physical' && shippingAddress.length < 5) return bad(res, 'Please enter a shipping address.');
  if (deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return bad(res, 'Please choose a valid delivery date.');

  const code = makeCode();
  db.prepare(`INSERT INTO gift_cards
      (code,amount,format,recipient_name,recipient_email,shipping_address,sender_name,sender_customer_id,message,delivery_date,promo,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(code, amount, format, recipientName, format === 'email' ? recipientEmail : null, format === 'physical' ? shippingAddress : null,
         senderName, req.customer?.id || null, message || null, deliveryDate || null, promo || null, new Date().toISOString());
  res.status(201).json({ success: true, code, amount });
});

module.exports = router;

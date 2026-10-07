/**
 * routes/subscribe.js — POST /api/subscribe  { email, name? }
 * Website form -> this route (validate + store in `subscribers`) -> email service -> inbox.
 * The email step is stubbed (see the Nodemailer example below); the data write is real.
 */
const express = require('express');
const { db } = require('../db');
const { isEmail, clean, bad } = require('../util');

const router = express.Router();

router.post('/', (req, res) => {
  const email = clean(req.body?.email, 254);
  const name = clean(req.body?.name, 80);
  if (!isEmail(email)) return bad(res, 'A valid email address is required.');

  const r = db.prepare('INSERT OR IGNORE INTO subscribers (email,name,created_at) VALUES (?,?,?)')
    .run(email, name || email.split('@')[0], new Date().toISOString());

  // --- email service integration (stubbed for the class demo) ---
  // const nodemailer = require('nodemailer');
  // const template = fs.readFileSync(path.join(__dirname,'..','emailTemplates','special-offer.html'),'utf-8');
  // await transporter.sendMail({ from:'"Sephora" <care@sephora-project.com>', to: email,
  //   subject:'Your Beauty Insider Early Access Starts Now', html: template.replace('{{name}}', name || 'Beauty Insider') });
  console.log(`[subscribe] ${r.changes ? 'stored' : 'already subscribed'}: ${email}`);

  res.json({ success: true, alreadySubscribed: r.changes === 0, message: r.changes ? "You're in! Check your inbox for your welcome offer." : "You're already subscribed. Thanks for being a Beauty Insider!" });
});

module.exports = router;

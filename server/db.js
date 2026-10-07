/**
 * db.js — SQLite database (better-sqlite3) for the Sephora Project.
 *
 * Creates the schema on first run and seeds it from:
 *   ../data/products.json              (product catalogue)
 *   ./seed/customers.seed.json         (demo admin + customer accounts; passwords are hashed with scrypt)
 *
 * Usage:
 *   require('./db')            -> returns the open database
 *   node db.js --reset         -> delete and rebuild the database from the seed files
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'sephora.db');
const PRODUCTS_JSON = path.join(__dirname, '..', 'data', 'products.json');
const CUSTOMERS_SEED = path.join(__dirname, 'seed', 'customers.seed.json');

/* ---------- password hashing (scrypt, no extra dependency) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

function open(reset = false) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (reset && fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      rating REAL DEFAULT 0,
      reviews INTEGER DEFAULT 0,
      description TEXT,
      benefits TEXT DEFAULT '[]',
      image TEXT,
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'Insider',
      points INTEGER NOT NULL DEFAULT 0,
      join_date TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      customer_id TEXT REFERENCES customers(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Placed',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      name TEXT NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL CHECK (qty > 0)
    );

    CREATE TABLE IF NOT EXISTS subscribers (
      email TEXT PRIMARY KEY COLLATE NOCASE,
      name TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT REFERENCES products(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gift_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL CHECK (amount >= 100),
      format TEXT NOT NULL CHECK (format IN ('email','physical')),
      recipient_name TEXT NOT NULL,
      recipient_email TEXT,
      shipping_address TEXT,
      sender_name TEXT NOT NULL,
      sender_customer_id TEXT REFERENCES customers(id),
      message TEXT,
      delivery_date TEXT,
      promo TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      date TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  /* migrate databases created before roles existed */
  const cols = db.prepare('PRAGMA table_info(customers)').all().map(c => c.name);
  if (!cols.includes('role')) db.exec(`ALTER TABLE customers ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'`);
  if (!cols.includes('status')) db.exec(`ALTER TABLE customers ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);

  seed(db);
  return db;
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) n FROM products').get().n === 0 && fs.existsSync(PRODUCTS_JSON)) {
    const items = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf-8'));
    const ins = db.prepare(`INSERT INTO products (id,name,brand,category,price,rating,reviews,description,benefits,image,stock)
                            VALUES (@id,@name,@brand,@category,@price,@rating,@reviews,@description,@benefits,@image,@stock)`);
    db.transaction(() => items.forEach((p, i) => ins.run({
      id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price,
      rating: p.rating || 0, reviews: p.reviews || 0, description: p.description || '',
      benefits: JSON.stringify(p.benefits || []), image: p.image || '',
      // stock is the source of truth for the "availability" label shown in the shop
      stock: /low/i.test(p.availability) ? 3 : /out/i.test(p.availability) ? 0 : 25 + ((i * 7) % 40)
    })))();
    console.log(`[db] seeded ${items.length} products`);
  }
  if (db.prepare('SELECT COUNT(*) n FROM customers').get().n === 0 && fs.existsSync(CUSTOMERS_SEED)) {
    const rows = JSON.parse(fs.readFileSync(CUSTOMERS_SEED, 'utf-8'));
    const ins = db.prepare(`INSERT INTO customers (id,name,email,password_hash,tier,points,join_date,role,status)
                            VALUES (?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => rows.forEach(c => ins.run(
      c.customerId, c.name, c.email, hashPassword(c.password || 'beauty123'),
      c.membershipTier || 'Insider', c.points || 0, c.joinDate, c.role || 'customer', c.status || 'active'
    )))();
    console.log(`[db] seeded ${rows.length} accounts (passwords hashed)`);
    seedDemoActivity(db);
  }
  /* older databases with no admin yet: make sure the demo admin can always log in */
  if (!db.prepare(`SELECT 1 FROM customers WHERE role = 'admin'`).get() && fs.existsSync(CUSTOMERS_SEED)) {
    const ins = db.prepare(`INSERT OR IGNORE INTO customers (id,name,email,password_hash,tier,points,join_date,role,status) VALUES (?,?,?,?,?,?,?,'admin','active')`);
    JSON.parse(fs.readFileSync(CUSTOMERS_SEED, 'utf-8')).filter(c => c.role === 'admin')
      .forEach(c => ins.run(c.customerId, c.name, c.email, hashPassword(c.password), c.membershipTier || 'Staff', 0, c.joinDate));
  }
}

/* Sample orders / messages / inquiries / subscribers / gift cards (shared with static mode: ../data/demo-activity.json). */
function seedDemoActivity(db) {
  const file = path.join(__dirname, '..', 'data', 'demo-activity.json');
  if (!fs.existsSync(file) || db.prepare('SELECT COUNT(*) n FROM orders').get().n > 0) return;
  const A = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const iso = d => new Date(Date.now() - d * 86400000).toISOString();
  const prod = id => db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  const cust = id => db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  const insO = db.prepare('INSERT INTO orders (ref,customer_id,name,email,address,total,status,created_at) VALUES (?,?,?,?,?,?,?,?)');
  const insI = db.prepare('INSERT INTO order_items (order_id,product_id,name,price,qty) VALUES (?,?,?,?,?)');
  const dec = db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?');
  db.transaction(() => {
    A.orders.forEach(o => {
      const c = cust(o.customerId); if (!c) return;
      const rows = o.items.map(([pid, qty]) => ({ p: prod(pid), qty })).filter(l => l.p);
      const total = rows.reduce((t, l) => t + l.p.price * l.qty, 0);
      const info = insO.run(o.ref, o.customerId, c.name, c.email, o.address, total, o.status, iso(o.daysAgo));
      rows.forEach(l => { insI.run(info.lastInsertRowid, l.p.id, l.p.name, l.p.price, l.qty); if (o.status !== 'Cancelled') dec.run(l.qty, l.p.id); });
    });
    const m = db.prepare('INSERT INTO messages (ref,name,email,subject,date,message,created_at) VALUES (?,?,?,?,?,?,?)');
    A.messages.forEach(x => m.run(x.ref, x.name, x.email, x.subject, iso(x.daysAgo).slice(0, 10), x.message, iso(x.daysAgo)));
    const q = db.prepare('INSERT INTO inquiries (product_id,name,email,message,created_at) VALUES (?,?,?,?,?)');
    A.inquiries.forEach(x => q.run(x.productId, x.name, x.email, x.message, iso(x.daysAgo)));
    const sub = db.prepare('INSERT OR IGNORE INTO subscribers (email,name,created_at) VALUES (?,?,?)');
    A.subscribers.forEach(x => sub.run(x.email, x.email.split('@')[0], iso(x.daysAgo)));
    const g = db.prepare(`INSERT INTO gift_cards (code,amount,format,recipient_name,recipient_email,sender_name,sender_customer_id,message,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    A.giftcards.forEach(x => g.run(x.code, x.amount, x.format, x.recipientName, x.recipientEmail, x.senderName, x.senderCustomerId, x.message, iso(x.daysAgo)));
  })();
  console.log('[db] seeded sample orders, messages, inquiries, subscribers and a gift card');
}

/* ---------- row -> API shape helpers (match the old JSON shape the front end expects) ---------- */
function availabilityFromStock(stock) {
  if (stock <= 0) return 'Out of Stock';
  if (stock <= 5) return 'Low Stock';
  return 'In Stock';
}
function productOut(r) {
  return {
    id: r.id, name: r.name, brand: r.brand, category: r.category, price: r.price,
    rating: r.rating, reviews: r.reviews, availability: availabilityFromStock(r.stock),
    stock: r.stock, description: r.description, benefits: JSON.parse(r.benefits || '[]'), image: r.image
  };
}
function customerOut(r) {
  return {
    customerId: r.id, name: r.name, email: r.email, membershipTier: r.tier,
    points: r.points, joinDate: r.join_date, role: r.role || 'customer', status: r.status || 'active'
  };
}

if (require.main === module) {
  const db = open(process.argv.includes('--reset'));
  console.log('[db] ready at', DB_PATH);
  db.close();
} else {
  module.exports = { db: open(), hashPassword, verifyPassword, productOut, customerOut, availabilityFromStock };
}

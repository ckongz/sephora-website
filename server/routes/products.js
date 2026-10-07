/**
 * routes/products.js
 *   GET /api/products            list (optional filters: ?category= &brand= &q= &inStock=1)
 *   GET /api/products/:id        single product (404 if unknown)
 */
const express = require('express');
const { db, productOut } = require('../db');
const { bad } = require('../util');

const router = express.Router();

router.get('/', (req, res) => {
  const { category, brand, q, inStock } = req.query;
  const where = [], args = [];
  if (category && category !== 'All') { where.push('category = ? COLLATE NOCASE'); args.push(String(category)); }
  if (brand) { where.push('brand = ? COLLATE NOCASE'); args.push(String(brand)); }
  if (q) {
    where.push('(name LIKE ? OR brand LIKE ? OR category LIKE ? OR description LIKE ?)');
    const like = `%${String(q).slice(0, 80)}%`; args.push(like, like, like, like);
  }
  if (inStock === '1' || inStock === 'true') where.push('stock > 0');
  const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
  res.json(db.prepare(sql).all(...args).map(productOut));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return bad(res, 'Product not found.', 404);
  res.json(productOut(row));
});

module.exports = router;

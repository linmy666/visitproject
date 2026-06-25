/**
 * Seed examples/sample.db with a tiny Northwind-style schema.
 *
 * Run with:  node scripts/seed-example-db.js
 * Output:    examples/sample.db
 *
 * The schema mirrors what a real legacy enterprise system looks like:
 *   - users (people)
 *   - orders (transactions)
 *   - products (catalog)
 *   - line_items (order detail)
 *
 * The CLI demo in README uses this file:
 *   visitproject db --type sqlite --conn sqlite:examples/sample.db --print
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const out = path.join(__dirname, "..", "examples", "sample.db");
fs.mkdirSync(path.dirname(out), { recursive: true });

const db = new Database(out);
db.pragma("foreign_keys = ON");
db.exec(`
  DROP TABLE IF EXISTS line_items;
  DROP TABLE IF EXISTS orders;
  DROP TABLE IF EXISTS products;
  DROP TABLE IF EXISTS users;

  CREATE TABLE users (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT
  );
  CREATE TABLE products (
    sku TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY NOT NULL,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE line_items (
    id INTEGER PRIMARY KEY NOT NULL,
    order_id INTEGER NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (sku) REFERENCES products(sku)
  );

  INSERT INTO users (id, name, email) VALUES
    (1, 'alice', 'alice@example.com'),
    (2, 'bob',   'bob@example.com'),
    (3, 'carol', 'carol@example.com');

  INSERT INTO products (sku, name, price, stock) VALUES
    ('SKU-001', 'Mechanical keyboard', 89.99, 42),
    ('SKU-002', 'USB-C hub',          29.50, 110),
    ('SKU-003', 'Standing desk mat',  45.00, 18);

  INSERT INTO orders (id, user_id, total, status, created_at) VALUES
    (1, 1, 119.49, 'shipped',  '2026-06-01T10:00:00Z'),
    (2, 2,  29.50, 'pending',  '2026-06-22T08:30:00Z'),
    (3, 3,  45.00, 'cancelled','2026-06-23T15:45:00Z');

  INSERT INTO line_items (id, order_id, sku, quantity) VALUES
    (1, 1, 'SKU-001', 1),
    (2, 1, 'SKU-002', 1),
    (3, 2, 'SKU-002', 1),
    (4, 3, 'SKU-003', 1);
`);
db.close();
console.log(`wrote ${out}`);
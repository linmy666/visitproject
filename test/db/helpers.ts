/**
 * Test helpers for the db module.
 *
 * Provides pre-populated in-memory SQLite fixtures plus a thin wrapper
 * adapter that uses better-sqlite3 directly (the same native binding the
 * SqliteAdapter does). This lets us seed tables before wiring the adapter.
 */
import Database from "better-sqlite3";
import { SqliteAdapter } from "../../src/db/sqlite.js";
import type { ColumnInfo, TableSchema } from "../../src/db/schema.js";

/**
 * Canonical 3-column fixture for unit tests that don't need real data:
 * users(id, name, email).
 */
export function usersSchema(): TableSchema {
  const columns: ColumnInfo[] = [
    { name: "id", type: "integer", notNull: true, defaultValue: undefined, primaryKey: true },
    { name: "name", type: "text",   notNull: true, defaultValue: undefined, primaryKey: false },
    { name: "email", type: "text",  notNull: false, defaultValue: undefined, primaryKey: false },
  ];
  return { name: "users", columns };
}

/**
 * Richer fixture (orders) for SELECT / UPDATE / DELETE tests.
 */
export function ordersSchema(): TableSchema {
  return {
    name: "orders",
    columns: [
      { name: "id", type: "integer", notNull: true, defaultValue: undefined, primaryKey: true },
      { name: "total", type: "real",  notNull: true, defaultValue: undefined, primaryKey: false },
      { name: "status", type: "text", notNull: true, defaultValue: "'pending'", primaryKey: false },
    ],
  };
}

/**
 * Build an in-memory :memory: database with seed data using better-sqlite3
 * directly (not via SqliteAdapter) — this lets fixtures initialise tables
 * before the adapter takes over.
 */
export function createSeededSqlite(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT
    );
    INSERT INTO users (id, name, email) VALUES
      (1, 'alice', 'alice@example.com'),
      (2, 'bob',   'bob@example.com'),
      (3, 'carol', NULL);

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    INSERT INTO orders (id, total, status) VALUES
      (1, 100.0, 'pending'),
      (2, 250.0, 'pending'),
      (3, 50.0,  'shipped'),
      (4, 999.0, 'cancelled');
  `);

  return db;
}

/**
 * Wrap an existing better-sqlite3 Database in a SqliteAdapter-like wrapper
 * that bypasses open()/close() (the underlying connection is already open).
 *
 * The "sentinel" trick: SqliteAdapter has a private _db that open() sets.
 * We assign it directly via a cast. The adapter's open() is a no-op because
 * _open is false the first time — but we'd still need it idempotent.
 *
 * Cleanest path: subclass SqliteAdapter with a no-op open/close.
 */
export class SeededSqliteAdapter extends SqliteAdapter {
  constructor(db: Database.Database) {
    super("sqlite:");
    // Force the adapter into "open" state by injecting the database.
    (this as any)._db = db;
    (this as any)._open = true;
  }

  override async open(): Promise<void> {
    // intentionally empty — connection injected via constructor
    return;
  }

  override async close(): Promise<void> {
    // intentionally empty — defer to caller who created the Database
    return;
  }
}

/**
 * Convenience: open a fresh seeded adapter.
 */
export async function createTestAdapter(): Promise<SeededSqliteAdapter> {
  const db = createSeededSqlite();
  return new SeededSqliteAdapter(db);
}

/**
 * visitproject — SQLite adapter.
 *
 * Implements DbAdapter using better-sqlite3 (synchronous, zero-dependencies).
 * This is the default / demo adapter. Stage 2.5 adds mysql2 and pg.
 */
import Database from "better-sqlite3";
import type {
  DbAdapter,
  SelectResult,
  Row,
} from "./adapter.js";
import {
  DbError,
} from "./adapter.js";
import {
  parseColumnInfo,
  validateIdentifier,
  type TableSchema,
} from "./schema.js";

/**
 * Connection string format: `sqlite:/absolute/path.db` or `./relative.db`.
 * We normalise to an absolute path before passing to better-sqlite3.
 */
function parseSqliteUri(uri: string): string {
  const prefix = "sqlite:";
  if (!uri.startsWith(prefix)) {
    throw new DbError(
      `Invalid SQLite URI: '${uri}'. Expected 'sqlite:/path/to/file.db'`,
      "CONNECTION_FAILED",
    );
  }
  let path = uri.slice(prefix.length);
  // Empty after prefix → in-memory (":memory:")
  if (!path) return ":memory:";
  // Relative path → resolve from CWD
  if (!path.startsWith("/")) {
    path = process.cwd() + "/" + path;
  }
  return path;
}

/**
 * SQLite implementation of the DbAdapter contract.
 */
export class SqliteAdapter implements DbAdapter {
  private _db: Database.Database | null = null;
  private _open = false;

  constructor(private readonly _uri: string) {
    // Just store the URI; actual connection happens in open()
  }

  get kind(): "sqlite" {
    return "sqlite";
  }

  async open(): Promise<void> {
    if (this._open) return; // idempotent
    try {
      const path = parseSqliteUri(this._uri);
      this._db = new Database(path); // default options
      // Enable foreign keys (SQLite defaults off)
      this._db.pragma("foreign_keys = ON");
      this._open = true;
    } catch (e) {
      throw new DbError(
        `Failed to open SQLite: ${this._uri}`,
        "CONNECTION_FAILED",
        e,
      );
    }
  }

  async close(): Promise<void> {
    if (!this._open || !this._db) return;
    this._db.close();
    this._db = null;
    this._open = false;
  }

  isOpen(): boolean {
    return this._open;
  }

  async listTables(): Promise<string[]> {
    this._ensureOpen();
    // Exclude internal SQLite tables: sqlite_sequence, sqlite_stat*, etc.
    const stmt = this._db!.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `);
    const rows = stmt.all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  async describeTable(table: string): Promise<TableSchema> {
    this._ensureOpen();
    validateIdentifier(table, "table");

    // Verify table exists
    const tables = await this.listTables();
    if (!tables.includes(table)) {
      throw new DbError(`Table '${table}' does not exist`, "UNKNOWN_TABLE");
    }

    // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
    const stmt = this._db!.prepare(`PRAGMA table_info("${table}")`);
    const raw = stmt.all() as Parameters<typeof parseColumnInfo>[0][];

    const columns = raw.map(parseColumnInfo);
    return { name: table, columns };
  }

  async select(
    table: string,
    where: string,
    params: ReadonlyArray<unknown>,
    limit: number,
  ): Promise<SelectResult> {
    this._ensureOpen();
    validateIdentifier(table, "table");

    // Clamp limit to [1, 1,000]
    const cappedLimit = Math.min(1_000, Math.max(1, limit));

    // Build query — fetch limit+1 rows so we can detect truncation cheaply.
    const baseSql = `SELECT * FROM "${table}"`;
    const sql = where
      ? `${baseSql} WHERE ${where} LIMIT ?`
      : `${baseSql} LIMIT ?`;

    const stmt = this._db!.prepare(sql);
    // Fetch one extra row beyond the limit to detect truncation
    const truncatedLimit = cappedLimit + 1;
    const boundParams = [...params, truncatedLimit];
    const rows = stmt.all(...boundParams) as Row[];

    // Truncate to the user's limit; the extra row signals that more exist.
    const truncated = rows.length > cappedLimit;
    if (truncated) {
      rows.length = cappedLimit;
    }

    return {
      rows,
      rowCount: rows.length,
      truncated,
    };
  }

  async insert(table: string, values: Record<string, unknown>): Promise<number> {
    this._ensureOpen();
    validateIdentifier(table, "table");

    const columns = Object.keys(values);
    if (columns.length === 0) {
      throw new DbError("INSERT requires at least one column", "QUERY_REJECTED");
    }
    for (const col of columns) {
      validateIdentifier(col, "column");
    }

    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO "${table}" (${columns.join(", ")}) VALUES (${placeholders})`;

    const stmt = this._db!.prepare(sql);
    const result = stmt.run(...Object.values(values));

    // SQLite returns lastInsertRowid as a bigint; coerce to number
    return Number(result.lastInsertRowid);
  }

  async update(
    table: string,
    values: Record<string, unknown>,
    where: string,
    params: ReadonlyArray<unknown>,
  ): Promise<number> {
    this._ensureOpen();
    validateIdentifier(table, "table");

    const columns = Object.keys(values);
    if (columns.length === 0) {
      throw new DbError("UPDATE requires at least one column", "QUERY_REJECTED");
    }
    for (const col of columns) {
      validateIdentifier(col, "column");
    }

    const setClause = columns.map((col) => `"${col}" = ?`).join(", ");
    const sql = `UPDATE "${table}" SET ${setClause} WHERE ${where}`;

    const stmt = this._db!.prepare(sql);
    const result = stmt.run(...Object.values(values), ...params);

    return result.changes;
  }

  async delete(
    table: string,
    where: string,
    params: ReadonlyArray<unknown>,
  ): Promise<number> {
    this._ensureOpen();
    validateIdentifier(table, "table");

    if (!where) {
      throw new DbError("DELETE requires a WHERE clause", "QUERY_REJECTED");
    }

    const sql = `DELETE FROM "${table}" WHERE ${where}`;
    const stmt = this._db!.prepare(sql);
    const result = stmt.run(...params);

    return result.changes;
  }

  private _ensureOpen(): void {
    if (!this._open || !this._db) {
      throw new DbError(
        "Database not open. Call adapter.open() first.",
        "CONNECTION_FAILED",
      );
    }
  }
}
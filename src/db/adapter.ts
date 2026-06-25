/**
 * visitproject — DB adapter contract.
 *
 * Every concrete database (SQLite, MySQL, PostgreSQL, ...) implements
 * DbAdapter. The MCP tool generator (mcp-tools.ts) and the safety gateway
 * depend ONLY on this interface — they never see the underlying driver.
 *
 * Why an interface? Three reasons:
 *   1. Tests can swap a real DB for a fake one without touching better-sqlite3.
 *   2. Stage 2.5 (mysql/pg adapters) is a pure additive change.
 *   3. The MCP tool generator can be unit-tested with a hand-rolled fake.
 */

import type { TableSchema, ColumnInfo } from "./schema.js";

/**
 * Result row. We use `unknown` instead of `any` on purpose — the MCP layer
 * must validate / coerce before exposing values to a language model.
 */
export type Row = Record<string, unknown>;

/**
 * A bounded SELECT result. `truncated = true` means the database had more
 * rows than `limit`; the safety gateway uses this to warn the LLM.
 */
export interface SelectResult {
  rows: Row[];
  rowCount: number;
  truncated: boolean;
}

/**
 * Identifier kinds we support. Each adapter maps these to its native
 * "is this name valid?" check (e.g. SQLite allows most identifiers,
 * MySQL reserves some, PostgreSQL lowercases unquoted names).
 */
export type IdentifierKind = "table" | "column";

export class DbError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CONNECTION_FAILED"
      | "UNKNOWN_TABLE"
      | "UNKNOWN_COLUMN"
      | "INVALID_IDENTIFIER"
      | "QUERY_REJECTED"
      | "DRIVER_ERROR",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DbError";
  }
}

/**
 * The contract every concrete database adapter must satisfy.
 *
 * Lifetime: open() → ... → close(). Adapters are NOT thread-safe; the
 * CLI / server layer is responsible for one adapter per process.
 */
export interface DbAdapter {
  /** Human-readable label, e.g. "sqlite", "mysql", "postgres". */
  readonly kind: string;

  /**
   * Sanity-check + acquire a native connection. Must throw DbError
   * (code=CONNECTION_FAILED) on failure. Idempotent — calling open()
   * twice is allowed and is a no-op.
   */
  open(): Promise<void>;

  /** Release the native connection. Safe to call multiple times. */
  close(): Promise<void>;

  /** True between a successful open() and the first close(). */
  isOpen(): boolean;

  /**
   * List all user-defined tables (sqlite_master type='table', excluding
   * sqlite_sequence and other internal tables).
   */
  listTables(): Promise<string[]>;

  /**
   * Return schema for one table. Throws DbError(UNKNOWN_TABLE) if absent.
   * Throws DbError(INVALID_IDENTIFIER) on malformed table names.
   */
  describeTable(table: string): Promise<TableSchema>;

  /**
   * Parameterised SELECT. The adapter is responsible for binding `params`
   * safely — string concatenation is FORBIDDEN. The caller passes an
   * already-validated `where` clause as a string template with `?` for
   * placeholders; the adapter binds `params` to those placeholders.
   *
   * @param where SQL fragment after WHERE, e.g. "id = ? AND status = ?".
   *              Empty string means "no WHERE".
   * @param params positional values to bind to `?` placeholders.
   * @param limit  hard cap on rows returned (default 100, max 1000).
   */
  select(
    table: string,
    where: string,
    params: ReadonlyArray<unknown>,
    limit: number,
  ): Promise<SelectResult>;

  /**
   * Parameterised INSERT. Returns the inserted rowid / serial id.
   */
  insert(table: string, values: Record<string, unknown>): Promise<number>;

  /**
   * Parameterised UPDATE. Returns affected row count.
   */
  update(
    table: string,
    values: Record<string,unknown>,
    where: string,
    params: ReadonlyArray<unknown>,
  ): Promise<number>;

  /**
   * Parameterised DELETE. Returns affected row count.
   */
  delete(
    table: string,
    where: string,
    params: ReadonlyArray<unknown>,
  ): Promise<number>;
}

/**
 * Re-export the column type so adapters don't have to dig into schema.ts.
 */
export type { ColumnInfo, TableSchema };

/**
 * visitproject — Database schema introspection.
 *
 * Works only with SQLite in this stage. MySQL / PostgreSQL
 * will be added in stage 2.5 with different SQL dialects.
 *
 * Design goals:
 *   - No external dependency on a DB driver (pure TypeScript types).
 *   - Schema objects are immutable after creation.
 *   - The MCP tool generator consumes this, not raw SQL.
 */

import { DbError } from "./adapter.js";

/**
 * SQLite column type. We normalize to a small vocabulary that covers
 * most practical use cases. If a DB returns something exotic, we map it
 * to "text" and trust the runtime to coerce.
 *
 * Why only these? MCP JSON Schema only has a handful of primitive types.
 * We collapse the 20+ SQLite types (VARCHAR, TEXT, INT, INTEGER, BIGINT,
 * REAL, DOUBLE, BLOB, BOOLEAN, ...) into 5 for simplicity.
 */
export type SqliteColumnType =
  | "integer"   // INTEGER, INT, BIGINT, SMALLINT, TINYINT
  | "real"      // REAL, DOUBLE, FLOAT, NUMERIC (with scale)
  | "text"      // TEXT, VARCHAR, CHAR, CLOB
  | "blob"      // BLOB, BINARY
  | "boolean";  // BOOLEAN (SQLite treats as integer 0/1)

/**
 * One column in a table.
 */
export interface ColumnInfo {
  /** Column name exactly as stored in the DB. */
  name: string;
  /** Normalised SQLite type. */
  type: SqliteColumnType;
  /** True if the column is NOT NULL, or is a PRIMARY KEY. */
  notNull: boolean;
  /** Default value expression, or undefined. */
  defaultValue: string | undefined;
  /** True if this is the PRIMARY KEY column. */
  primaryKey: boolean;
}

/**
 * Full table schema — columns, indexes, foreign keys (future).
 */
export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
}

/**
 * Parse a SQLite PRAGMA table_info result row into our domain type.
 * This function lives here (not in sqlite.ts) because it's pure logic.
 *
 * Raw PRAGMA returns:
 *   [cid, name, type, notnull, dflt_value, pk]
 *
 * Example:
 *   [0, "id", "INTEGER", 1, null, 1]
 *   [1, "name", "VARCHAR(100)", 0, "'unknown'", 0]
 */
export function parseColumnInfo(raw: {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}): ColumnInfo {
  const type = normaliseColumnType(raw.type);
  return {
    name: raw.name,
    type,
    notNull: raw.notnull === 1,
    defaultValue: raw.dflt_value ?? undefined,
    primaryKey: raw.pk === 1,
  };
}

/**
 * Convert a raw SQLite type string (case-insensitive) into our enum.
 */
export function normaliseColumnType(rawType: string): SqliteColumnType {
  const upper = rawType.toUpperCase();

  if (upper.includes("INT")) return "integer";
  if (upper.includes("REAL") || upper.includes("DOUBLE") || upper.includes("FLOAT") || upper.includes("NUMERIC") || upper.includes("DECIMAL")) return "real";
  if (upper.includes("BLOB") || upper.includes("BINARY")) return "blob";
  if (upper.includes("BOOL")) return "boolean";

  // Default: text covers VARCHAR, CHAR, TEXT, CLOB, ...
  return "text";
}

/**
 * Validate a table or column name. We reject anything that isn't a
 * simple identifier (ASCII letters/digits/underscores, not starting
 * with a digit). This is stricter than SQLite but protects against
 * accidental SQL injection in MCP tool names.
 *
 * @throws DbError(IDENTIFIER_INVALID) if the name is malformed.
 */
export function validateIdentifier(name: string, kind: "table" | "column"): void {
  // Allow a-z, A-Z, 0-9, underscore, dollar sign (MySQL folks love $)
  const pattern = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;
  if (!pattern.test(name)) {
    throw new DbError(
      `Invalid ${kind} name: '${name}'. Expected ASCII identifier.`,
      "INVALID_IDENTIFIER",
    );
  }
}
/**
 * visitproject — Safe query builder.
 *
 * Core principle: NEVER concatenate raw user / LLM input into SQL.
 * Always go through a structured WhereClause which:
 *   - Has a fixed set of operators (eq, ne, lt, lte, gt, gte, in, like)
 *   - Validates identifiers against a whitelist (table columns)
 *   - Generates SQL with `?` placeholders + a separate params array.
 *
 * The caller invokes:
 *   const where = buildWhere(clause, columns, MAX_PARAMS);
 *   await adapter.select(table, where.sql, where.params, limit);
 *
 * If the LLM sends garbage like { "1=1 OR 1=1" } we reject it before
 * touching the database. If the LLM sends a valid clause with a column
 * that doesn't exist, we reject it too.
 */
import { DbError } from "./adapter.js";
import type { ColumnInfo } from "./schema.js";
import { validateIdentifier } from "./schema.js";

/** Operators we accept. `like` is case-sensitive substring. */
export type WhereOp =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "like";

/** A single condition. Operator semantics defined per-op below. */
export interface WhereCondition {
  /** Column name. Must be in the supplied whitelist. */
  column: string;
  op: WhereOp;
  /** Right-hand-side value. For `in`, this must be an array. */
  value: unknown;
}

/**
 * Conjunction — we only support AND (not OR). This is intentional:
 * OR branches are a common SQL-injection smuggling vector
 * (e.g. `WHERE x = 'a' OR x = 'a' -- ...`). If we need OR later,
 * we can extend with proper AST-level validation.
 */
export interface WhereClause {
  and?: WhereCondition[];
}

export interface BuiltWhere {
  /** SQL fragment after "WHERE", e.g. "status = ? AND age > ?". Empty = no WHERE. */
  sql: string;
  /** Positional values to bind to the `?` placeholders in `sql`. */
  params: unknown[];
}

/**
 * Maximum number of params we'll bind. SQLite defaults to 100, and with
 * 5 conditions × max 7 placeholder per IN, we'd hit 35 — leave headroom.
 */
export const MAX_PARAMS = 64;

/**
 * Build a parameterised WHERE clause from structured input.
 *
 * @param clause     Structured conditions from the LLM.
 * @param columns    Whitelist of valid columns (use describeTable to get this).
 * @param maxParams  Hard ceiling on total placeholders (default 64).
 * @throws DbError(INVALID_IDENTIFIER) if a condition references a non-whitelisted column.
 * @throws DbError(QUERY_REJECTED) for malformed input.
 */
export function buildWhere(
  clause: WhereClause | undefined,
  columns: ReadonlyArray<ColumnInfo>,
  maxParams: number = MAX_PARAMS,
): BuiltWhere {
  if (!clause || !clause.and || clause.and.length === 0) {
    return { sql: "", params: [] };
  }

  // Build a set for O(1) lookup of valid column names
  const validColumns = new Set(columns.map((c) => c.name));

  const fragments: string[] = [];
  const params: unknown[] = [];

  for (const cond of clause.and) {
    // 1. Validate column against whitelist
    if (!validColumns.has(cond.column)) {
      throw new DbError(
        `Unknown column: '${cond.column}'. Must be one of: ${[...validColumns].join(", ")}`,
        "UNKNOWN_COLUMN",
      );
    }

    // 2. Re-validate identifier syntax (defense in depth — should never fail)
    validateIdentifier(cond.column, "column");

    // 3. Build fragment + params per operator
    const fragment = buildFragment(cond, params);

    if (params.length > maxParams) {
      throw new DbError(
        `Query exceeds ${maxParams} parameter limit`,
        "QUERY_REJECTED",
      );
    }

    fragments.push(fragment);
  }

  return {
    sql: fragments.join(" AND "),
    params,
  };
}

/**
 * Helper: append fragment for one condition, mutate `params` array.
 * Returns the SQL fragment for that condition (without AND).
 */
function buildFragment(cond: WhereCondition, params: unknown[]): string {
  const { column, op, value } = cond;

  switch (op) {
    case "eq":
      if (value === null || value === undefined) {
        throw new DbError(
          `eq operator requires non-null value for column '${column}'`,
          "QUERY_REJECTED",
        );
      }
      params.push(value);
      return `"${column}" = ?`;

    case "ne":
      params.push(value);
      return `"${column}" != ?`;

    case "lt":
      params.push(value);
      return `"${column}" < ?`;

    case "lte":
      params.push(value);
      return `"${column}" <= ?`;

    case "gt":
      params.push(value);
      return `"${column}" > ?`;

    case "gte":
      params.push(value);
      return `"${column}" >= ?`;

    case "like": {
      // Force value to be a string (or coerce) — like only makes sense on text
      if (typeof value !== "string") {
        throw new DbError(
          `like operator requires a string value for column '${column}'`,
          "QUERY_REJECTED",
        );
      }
      params.push(value);
      return `"${column}" LIKE ?`;
    }

    case "in": {
      if (!Array.isArray(value)) {
        throw new DbError(
          `in operator requires an array value for column '${column}'`,
          "QUERY_REJECTED",
        );
      }
      if (value.length === 0) {
        throw new DbError(
          `in operator requires non-empty array for column '${column}'`,
          "QUERY_REJECTED",
        );
      }
      for (const item of value) params.push(item);
      const placeholders = value.map(() => "?").join(", ");
      return `"${column}" IN (${placeholders})`;
    }

    default: {
      // Exhaustive check: if a new operator is added, the compiler will error
      const _exhaustive: never = op;
      throw new DbError(
        `Unknown operator: '${String(_exhaustive)}'`,
        "QUERY_REJECTED",
      );
    }
  }
}

/**
 * Used by callers that don't know the column whitelist yet (e.g. CLI).
 * This is a fast O(1) check against a Set built once per table.
 */
export function buildColumnWhitelist(columns: ReadonlyArray<ColumnInfo>): Set<string> {
  return new Set(columns.map((c) => c.name));
}
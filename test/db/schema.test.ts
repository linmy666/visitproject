/**
 * Schema parsing tests — covers the pure-TypeScript logic in schema.ts.
 */
import {
  parseColumnInfo,
  normaliseColumnType,
  validateIdentifier,
} from "../../src/db/schema.js";
import { DbError } from "../../src/db/adapter.js";

describe("normaliseColumnType", () => {
  it("maps INTEGER family to integer", () => {
    expect(normaliseColumnType("INTEGER")).toBe("integer");
    expect(normaliseColumnType("INT")).toBe("integer");
    expect(normaliseColumnType("BIGINT")).toBe("integer");
    expect(normaliseColumnType("int")).toBe("integer"); // case-insensitive
  });

  it("maps REAL family to real", () => {
    expect(normaliseColumnType("REAL")).toBe("real");
    expect(normaliseColumnType("DOUBLE")).toBe("real");
    expect(normaliseColumnType("FLOAT")).toBe("real");
    expect(normaliseColumnType("NUMERIC(10,2)")).toBe("real");
    expect(normaliseColumnType("DECIMAL")).toBe("real");
  });

  it("maps BLOB family to blob", () => {
    expect(normaliseColumnType("BLOB")).toBe("blob");
    expect(normaliseColumnType("BINARY")).toBe("blob");
  });

  it("maps BOOL family to boolean", () => {
    expect(normaliseColumnType("BOOLEAN")).toBe("boolean");
    expect(normaliseColumnType("bool")).toBe("boolean");
  });

  it("falls back to text for unknown types", () => {
    expect(normaliseColumnType("VARCHAR(100)")).toBe("text");
    expect(normaliseColumnType("TEXT")).toBe("text");
    expect(normaliseColumnType("CHAR(10)")).toBe("text");
    expect(normaliseColumnType("CLOB")).toBe("text");
  });
});

describe("parseColumnInfo", () => {
  it("parses a complete PRAGMA row", () => {
    const result = parseColumnInfo({
      cid: 0,
      name: "id",
      type: "INTEGER",
      notnull: 1,
      dflt_value: null,
      pk: 1,
    });
    expect(result.name).toBe("id");
    expect(result.type).toBe("integer");
    expect(result.notNull).toBe(true);
    expect(result.primaryKey).toBe(true);
    expect(result.defaultValue).toBeUndefined();
  });

  it("returns defaultValue as string when present", () => {
    const result = parseColumnInfo({
      cid: 1,
      name: "status",
      type: "TEXT",
      notnull: 0,
      dflt_value: "'pending'",
      pk: 0,
    });
    expect(result.defaultValue).toBe("'pending'");
    expect(result.notNull).toBe(false);
    expect(result.primaryKey).toBe(false);
  });
});

describe("validateIdentifier", () => {
  it("accepts simple ASCII identifiers", () => {
    expect(() => validateIdentifier("users", "table")).not.toThrow();
    expect(() => validateIdentifier("order_id", "column")).not.toThrow();
    expect(() => validateIdentifier("price$usd", "column")).not.toThrow();
    expect(() => validateIdentifier("_internal", "table")).not.toThrow();
  });

  it("rejects identifiers with spaces", () => {
    expect(() => validateIdentifier("my users", "table")).toThrow(DbError);
  });

  it("rejects identifiers starting with a digit", () => {
    expect(() => validateIdentifier("1_user", "table")).toThrow(DbError);
  });

  it("rejects SQL-like injection attempts", () => {
    expect(() => validateIdentifier("users; DROP TABLE", "table")).toThrow(DbError);
    expect(() => validateIdentifier("users--", "table")).toThrow(DbError);
    expect(() => validateIdentifier("users/*", "table")).toThrow(DbError);
  });

  it("rejects identifiers with hyphens (SQL injection risk)", () => {
    expect(() => validateIdentifier("user-id", "table")).toThrow(DbError);
  });

  it("throws with INVALID_IDENTIFIER code", () => {
    try {
      validateIdentifier("bad name", "table");
      fail("Expected DbError");
    } catch (e) {
      expect(e).toBeInstanceOf(DbError);
      expect((e as DbError).code).toBe("INVALID_IDENTIFIER");
    }
  });
});
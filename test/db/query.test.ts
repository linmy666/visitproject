/**
 * Query builder tests — covers buildWhere() and parameter whitelisting.
 */
import { buildWhere, MAX_PARAMS } from "../../src/db/query.js";
import { DbError } from "../../src/db/adapter.js";
import { ordersSchema } from "./helpers.js";

const cols = ordersSchema().columns;

describe("buildWhere — empty inputs", () => {
  it("returns empty SQL + empty params for undefined clause", () => {
    const out = buildWhere(undefined, cols);
    expect(out.sql).toBe("");
    expect(out.params).toEqual([]);
  });

  it("returns empty SQL + empty params for empty `and` array", () => {
    const out = buildWhere({ and: [] }, cols);
    expect(out.sql).toBe("");
    expect(out.params).toEqual([]);
  });
});

describe("buildWhere — operators", () => {
  it("eq pushes a value and renders = ?", () => {
    const out = buildWhere({ and: [{ column: "id", op: "eq", value: 1 }] }, cols);
    expect(out.sql).toBe(`"id" = ?`);
    expect(out.params).toEqual([1]);
  });

  it("lt / gt render with < / >", () => {
    const out = buildWhere(
      { and: [{ column: "total", op: "gt", value: 100 }] },
      cols,
    );
    expect(out.sql).toBe(`"total" > ?`);
    expect(out.params).toEqual([100]);
  });

  it("like requires a string", () => {
    const out = buildWhere(
      { and: [{ column: "status", op: "like", value: "pen%" }] },
      cols,
    );
    expect(out.sql).toBe(`"status" LIKE ?`);
    expect(out.params).toEqual(["pen%"]);
  });

  it("like rejects non-string", () => {
    expect(() =>
      buildWhere(
        { and: [{ column: "status", op: "like", value: 42 }] },
        cols,
      ),
    ).toThrow(/like.*string/);
  });

  it("in expands to a placeholder list", () => {
    const out = buildWhere(
      { and: [{ column: "status", op: "in", value: ["pending", "shipped"] }] },
      cols,
    );
    expect(out.sql).toBe(`"status" IN (?, ?)`);
    expect(out.params).toEqual(["pending", "shipped"]);
  });

  it("in rejects an empty array", () => {
    expect(() =>
      buildWhere(
        { and: [{ column: "status", op: "in", value: [] }] },
        cols,
      ),
    ).toThrow(/non-empty/);
  });

  it("in rejects non-array value", () => {
    expect(() =>
      buildWhere(
        { and: [{ column: "status", op: "in", value: "pending" }] },
        cols,
      ),
    ).toThrow(/array/);
  });
});

describe("buildWhere — safety", () => {
  it("rejects unknown columns", () => {
    expect(() =>
      buildWhere(
        { and: [{ column: "DROP TABLE", op: "eq", value: 1 }] },
        cols,
      ),
    ).toThrow(DbError);
  });

  it("rejects columns not in the whitelist", () => {
    try {
      buildWhere(
        { and: [{ column: "ssn", op: "eq", value: "123" }] },
        cols,
      );
      fail("should have thrown");
    } catch (e) {
      expect((e as DbError).code).toBe("UNKNOWN_COLUMN");
    }
  });

  it("multi-condition AND is rendered correctly", () => {
    const out = buildWhere(
      {
        and: [
          { column: "status", op: "eq", value: "pending" },
          { column: "total", op: "gte", value: 100 },
        ],
      },
      cols,
    );
    expect(out.sql).toBe(`"status" = ? AND "total" >= ?`);
    expect(out.params).toEqual(["pending", 100]);
  });

  it("queries > MAX_PARAMS are rejected", () => {
    // Build 100 conditions — limit is MAX_PARAMS=64.
    const conditions: { column: string; op: "eq"; value: number }[] = [];
    for (let i = 0; i < 100; i++) {
      conditions.push({ column: "id", op: "eq", value: i });
    }
    expect(() => buildWhere({ and: conditions }, cols)).toThrow(/parameter limit/);
  });
});

describe("MAX_PARAMS", () => {
  it("is 64", () => {
    expect(MAX_PARAMS).toBe(64);
  });
});

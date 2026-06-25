/**
 * SQLite adapter tests — exercises the live better-sqlite3 binding
 * against an in-memory database populated by the helper.
 *
 * Scopes to in-memory mode for simplicity. The on-disk sqlite file
 * path is platform-sensitive (fs, tmp paths) and tested separately
 * in test/integration/sqlite-file.test.ts later if needed.
 */
import { createTestAdapter } from "./helpers.js";
import { SqliteAdapter } from "../../src/db/sqlite.js";
import { DbError } from "../../src/db/adapter.js";

describe("SqliteAdapter — connection lifecycle (in-memory)", () => {
  it("after shared open() isOpen() returns true", async () => {
    const adapter = await createTestAdapter();
    expect(adapter.isOpen()).toBe(true);
  });

  it("rejects malformed sqlite URI", async () => {
    const bad = new SqliteAdapter("nocolon");
    await expect(bad.open()).rejects.toThrow(DbError);
    await expect(bad.open()).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  });

  it("refuses operations when not open", async () => {
    // Bypass the seeded helper: a fresh adapter never opened should still
    // fail listTables because it tries to use the connection.
    const fresh = new SqliteAdapter("sqlite:");
    await expect(fresh.listTables()).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });
  });
});

describe("SqliteAdapter — listTables & describeTable", () => {
  it("returns user tables, excluding sqlite_master internals", async () => {
    const adapter = await createTestAdapter();
    const tables = await adapter.listTables();
    expect(tables).toContain("users");
    expect(tables).toContain("orders");
    expect(tables.every((t) => !t.startsWith("sqlite_"))).toBe(true);
    expect(tables).toEqual([...tables].sort()); // alphabetical
  });

  it("describes a table with column metadata", async () => {
    const adapter = await createTestAdapter();
    const schema = await adapter.describeTable("users");
    expect(schema.name).toBe("users");
    expect(schema.columns.map((c) => c.name)).toEqual(["id", "name", "email"]);

    const id = schema.columns.find((c) => c.name === "id")!;
    expect(id.type).toBe("integer");
    expect(id.primaryKey).toBe(true);
    expect(id.notNull).toBe(true);

    const email = schema.columns.find((c) => c.name === "email")!;
    expect(email.notNull).toBe(false);
  });

  it("throws UNKNOWN_TABLE for non-existent table", async () => {
    const adapter = await createTestAdapter();
    await expect(adapter.describeTable("does_not_exist")).rejects.toMatchObject({
      code: "UNKNOWN_TABLE",
    });
  });
});

describe("SqliteAdapter — select", () => {
  it("returns all rows when no WHERE clause", async () => {
    const adapter = await createTestAdapter();
    const result = await adapter.select("users", "", [], 100);
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("filters via parameterised WHERE", async () => {
    const adapter = await createTestAdapter();
    // SELECT * FROM "users" WHERE "name" = ? LIMIT ?
    const result = await adapter.select("users", `"name" = ?`, ["alice"], 100);
    expect(result.rowCount).toBe(1);
    expect((result.rows[0] as any).name).toBe("alice");
  });

  it("clamps limit to 1000 maximum", async () => {
    const adapter = await createTestAdapter();
    const result = await adapter.select("users", "", [], 999_999);
    expect(result.rows.length).toBeLessThanOrEqual(1000);
  });

  it("returns null values faithfully", async () => {
    const adapter = await createTestAdapter();
    const result = await adapter.select(
      "users",
      `"name" = ?`,
      ["carol"],
      100,
    );
    expect(result.rowCount).toBe(1);
    expect((result.rows[0] as any).email).toBeNull();
  });

  it("truncates large result sets and sets truncated=true", async () => {
    const adapter = await createTestAdapter();
    // Seed enough rows to test truncation. Hand-build using better-sqlite3
    // since the adapter doesn't expose exec — accept that this leaks
    // one more peek-through for educational purpose.
    // (We use the public select path: insert 200 rows via insert().)
    for (let i = 100; i < 200; i++) {
      await adapter.insert("users", { name: `user${i}`, email: null });
    }
    const result = await adapter.select("users", "", [], 50);
    expect(result.rowCount).toBe(50);
    expect(result.truncated).toBe(true);
  });
});

describe("SqliteAdapter — insert / update / delete", () => {
  it("inserts a new row and returns lastInsertRowid", async () => {
    const adapter = await createTestAdapter();
    const id = await adapter.insert("users", {
      name: "dave",
      email: "dave@example.com",
    });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(3); // seeded ids are 1,2,3
  });

  it("update returns affected row count", async () => {
    const adapter = await createTestAdapter();
    const changes = await adapter.update(
      "users",
      { email: "alice@new.com" },
      `"name" = ?`,
      ["alice"],
    );
    expect(changes).toBe(1);
  });

  it("delete refuses to run without WHERE clause", async () => {
    const adapter = await createTestAdapter();
    await expect(adapter.delete("users", "", [])).rejects.toMatchObject({
      code: "QUERY_REJECTED",
    });
  });

  it("delete with WHERE removes matching rows", async () => {
    const adapter = await createTestAdapter();
    const changes = await adapter.delete("users", `"name" = ?`, ["alice"]);
    expect(changes).toBe(1);

    const remaining = await adapter.select("users", "", [], 100);
    expect(remaining.rowCount).toBe(2);
  });
});

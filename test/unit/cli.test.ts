/**
 * Smoke + functional test for the CLI parser.
 *
 * Stage 1: prove commander parses our three subcommands and their flags.
 * Stage 2: prove the `db` subcommand actually opens a SQLite database,
 *           introspects its tables, and emits MCP tool schemas.
 */

import { buildProgram, main } from "../../src/cli/index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("CLI scaffold (stage 1)", () => {
  test("buildProgram returns a Command with the three subcommands", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("db");
    expect(names).toContain("watch");
    expect(names).toContain("start");
  });

  test("main returns 0 with no subcommand (prints help)", async () => {
    // No subcommand is allowed; commander prints help and we exit 0.
    const spy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await main(["node", "visitproject"]);
    spy.mockRestore();
    expect(code).toBe(0);
  });

  test("main parses watch --dir --type", () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    return main(["node", "visitproject", "watch", "--dir", "/tmp/drop", "--type", "csv"])
      .then(() => {
        spy.mockRestore();
        expect(out.join("")).toContain("dir=/tmp/drop");
        expect(out.join("")).toContain("type=csv");
      });
  });

  test("main parses start --config", () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    return main(["node", "visitproject", "start", "--config", "./visitproject.json"])
      .then(() => {
        spy.mockRestore();
        expect(out.join("")).toContain("config=./visitproject.json");
      });
  });

  test("--version returns 0 and prints the package version", async () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    const code = await main(["node", "visitproject", "--version"]);
    spy.mockRestore();
    expect(code).toBe(0);
    expect(out.join("")).toContain("0.2.0");
  });
});

describe("CLI `db` subcommand (stage 2 — real DB-to-MCP)", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeAll(() => {
    // Build a real SQLite file with two tables so the CLI has something
    // to introspect. better-sqlite3 is the same engine the CLI uses.
    // We import it lazily so the unit test can still run even if the
    // native binding fails to load (would surface a clearer error).
    tmpDir = mkdtempSync(join(tmpdir(), "vp-cli-test-"));
    dbPath = join(tmpDir, "cli-test.db");
    // Write a minimal SQLite header + a real table using better-sqlite3.
    // We use the in-process binding so we don't need the CLI to seed.
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        email TEXT
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY NOT NULL,
        total REAL NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO users (id, name, email) VALUES (1, 'alice', 'a@x.com');
      INSERT INTO orders (id, total, status) VALUES (1, 100.0, 'pending');
    `);
    db.close();
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("--print dumps MCP tool JSON for every table", async () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    const code = await main([
      "node",
      "visitproject",
      "db",
      "--type",
      "sqlite",
      "--conn",
      `sqlite:${dbPath}`,
      "--print",
    ]);
    spy.mockRestore();
    const joined = out.join("");
    expect(code).toBe(0);
    // Count top-level "name": "db_*" entries via positive matches only
    const topLevelNames = joined.match(/"name":\s*"db_[a-z_]+"/g) || [];
    // 2 tables × 4 tools = 8 tools
    expect(topLevelNames).toHaveLength(8);
    expect(joined).toContain("db_select_users");
    expect(joined).toContain("db_insert_orders");
    expect(joined).toContain("db_delete_users");
  });

  test("--tables filter narrows the tool list", async () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    const code = await main([
      "node",
      "visitproject",
      "db",
      "--type",
      "sqlite",
      "--conn",
      `sqlite:${dbPath}`,
      "--tables",
      "users",
      "--print",
    ]);
    spy.mockRestore();
    const joined = out.join("");
    expect(code).toBe(0);
    // Only the 4 `users` tools should appear
    const topLevelNames = joined.match(/"name":\s*"db_[a-z_]+"/g) || [];
    expect(topLevelNames).toHaveLength(4);
    expect(joined).toContain("db_select_users");
    expect(joined).not.toContain("db_select_orders");
  });

  test("default (no --print) emits a human summary", async () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    const code = await main([
      "node",
      "visitproject",
      "db",
      "--type",
      "sqlite",
      "--conn",
      `sqlite:${dbPath}`,
    ]);
    spy.mockRestore();
    const joined = out.join("");
    expect(code).toBe(0);
    expect(joined).toContain("8 MCP tool(s) generated");
    expect(joined).toContain("db_select_users");
  });

  test("unsupported type returns non-zero", async () => {
    const err: string[] = [];
    const spy = jest.spyOn(process.stderr, "write").mockImplementation((s) => {
      err.push(String(s));
      return true;
    });
    // Suppress stdout too so we don't pollute test output
    const outSpy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await main([
      "node",
      "visitproject",
      "db",
      "--type",
      "mongodb", // not supported in stage 2
      "--conn",
      "mongodb://x",
    ]);
    spy.mockRestore();
    outSpy.mockRestore();
    expect(code).not.toBe(0);
    expect(err.join("")).toMatch(/Unsupported database type/);
  });
});
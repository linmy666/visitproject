#!/usr/bin/env node
/**
 * visitproject CLI entry point.
 *
 * Subcommands:
 *
 *   visitproject db --type <mysql|postgres|sqlite> --conn <str> --tables <a,b,c>
 *       Reverse-engineer a database schema and expose each table as a
 *       standard MCP tool. Stage 2 ships SQLite; MySQL/PostgreSQL in 2.5.
 *
 *   visitproject watch --dir <path> --type <csv|xlsx>
 *       Watch a local drop folder and expose new files as MCP resources.
 *       Stage 3.
 *
 *   visitproject start --config <path>
 *       Start an MCP server that aggregates all configured sources over the
 *       stdio transport. Stage 4.
 *
 *   visitproject --version / --help  → standard CLI flags
 *
 * Why commander:
 *   - De-facto standard for Node CLIs, zero-config TS types via @types/commander
 *   - Built-in help generation (we get `visitproject db --help` for free)
 *   - Plays nicely with `bin` in package.json so `npm i -g visitproject` works
 */

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SqliteAdapter,
  toolsForAdapter,
  type DbAdapter,
} from "../db/index.js";

interface PackageJson {
  name: string;
  version: string;
  description: string;
}

/**
 * Resolve the project root by walking up from the current file until we
 * find a directory containing package.json. Works for both the dev layout
 * (src/cli/index.ts) and the built layout (dist/cli/index.js).
 */
function findProjectRoot(startDir: string): string {
  let dir = startDir;
  // Bound the loop so a broken fs layout doesn't infinite-loop.
  for (let i = 0; i < 8; i += 1) {
    try {
      readFileSync(join(dir, "package.json"), "utf-8");
      return dir;
    } catch {
      const parent = join(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
  return startDir;
}

function readPackageJson(): PackageJson {
  // Try a few relative paths first; fall back to walking up.
  const here = __dirname;
  const candidates = [
    join(here, "..", "..", "package.json"),   // dist/cli/ → root (built)
    join(here, "..", "package.json"),         // dist/ → root
    join(here, "package.json"),               // src/cli/ (dev)
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as PackageJson;
    } catch {
      // try next
    }
  }
  const root = findProjectRoot(here);
  try {
    return JSON.parse(
      readFileSync(join(root, "package.json"), "utf-8"),
    ) as PackageJson;
  } catch {
    // Fallback so the CLI never crashes on package.json lookup
    return {
      name: "visitproject",
      version: "0.0.0-unknown",
      description: "visitproject CLI",
    };
  }
}

function buildProgram(): Command {
  const pkg = readPackageJson();
  const program = new Command();

  program
    .name(pkg.name)
    .version(pkg.version)
    .description(pkg.description)
    .showHelpAfterError();

  // --- visitproject db -----------------------------------------------------------
  program
    .command("db")
    .description(
      "Reverse-engineer a database and expose tables as MCP tools (stage 2)",
    )
    .requiredOption(
      "-t, --type <type>",
      "Database type: mysql | postgres | sqlite",
    )
    .requiredOption(
      "-c, --conn <conn>",
      "Connection string (e.g. 'sqlite:./data.db' or 'postgres://user:pw@host/db')",
    )
    .option(
      "--tables <list>",
      "Comma-separated table names to expose (default: all user tables)",
      "",
    )
    .option("--print", "Print generated MCP tool schemas as JSON and exit", false)
    .action(async (opts: DbOptions) => {
      // Stage 2: real implementation. Wire DB type → adapter, then
      // generate MCP tool schemas from table introspection.
      // Note: we catch errors inside the action and write to stderr
      // explicitly — commander 12's parseAsync does NOT propagate action
      // rejections, so a thrown Error becomes an UnhandledPromiseRejection.
      let adapter;
      try {
        adapter = await openAdapter(opts.type, opts.conn);
      } catch (e) {
        // eslint-disable-next-line no-console
        process.stderr.write(`[visitproject] ${(e as Error).message}\n`);
        process.exitCode = 1;
        return;
      }

      try {
        const tools = await toolsForAdapter(adapter);
        // Apply --tables filter if provided (comma-separated)
        const requested = opts.tables
          ? new Set(opts.tables.split(",").map((s) => s.trim()).filter(Boolean))
          : null;
        const filtered = requested
          ? tools.filter((t) => {
              // tool name: db_select_<table>, db_insert_<table>, etc.
              const parts = t.name.split("_");
              // table name = everything after the verb
              const tableName = parts.slice(2).join("_");
              return requested.has(tableName);
            })
          : tools;

        if (opts.print) {
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(filtered, null, 2));
          return;
        }

        // Default: human-readable summary
        // eslint-disable-next-line no-console
        console.log(
          `[stage 2] ${filtered.length} MCP tool(s) generated for ${opts.type}://${opts.conn.replace(/^sqlite:/, "")}`,
        );
        for (const t of filtered) {
          // eslint-disable-next-line no-console
          console.log(`  • ${t.name}  — ${t.description}`);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        process.stderr.write(`[visitproject] ${(e as Error).message}\n`);
        process.exitCode = 1;
        return;
      } finally {
        await adapter.close();
      }
    });

  // --- visitproject watch --------------------------------------------------------
  program
    .command("watch")
    .description(
      "Watch a directory and expose new files as MCP resources (stage 3)",
    )
    .requiredOption("-d, --dir <dir>", "Directory to watch for new files")
    .option(
      "--type <type>",
      "File types to ingest: csv | xlsx | both",
      "both",
    )
    .option("--once", "Scan existing files once and exit", false)
    .action((opts: WatchOptions) => {
      // eslint-disable-next-line no-console
      console.log(
        `[stage 3 placeholder] watch command parsed: dir=${opts.dir} type=${opts.type} once=${String(opts.once)}`,
      );
      // eslint-disable-next-line no-console
      console.log(
        "[stage 3] File-watcher pipeline not yet implemented. See https://github.com/linmy666/visitproject/issues",
      );
    });

  // --- visitproject start ---------------------------------------------------------
  program
    .command("start")
    .description(
      "Start the MCP server aggregating all configured sources (stage 4)",
    )
    .option("-c, --config <path>", "Path to a JSON config file", "./visitproject.json")
    .action((opts: StartOptions) => {
      // eslint-disable-next-line no-console
      console.log(`[stage 4 placeholder] start command parsed: config=${opts.config}`);
      // eslint-disable-next-line no-console
      console.log(
        "[stage 4] Stdio MCP server + TUI gateway not yet implemented.",
      );
    });

  return program;
}

// --- option interfaces -----------------------------------------------------

interface DbOptions {
  type: string;
  conn: string;
  tables: string;
  print: boolean;
}

interface WatchOptions {
  dir: string;
  type: string;
  once: boolean;
}

interface StartOptions {
  config?: string;
}

// --- adapter factory -------------------------------------------------------

/**
 * Stage 2 only supports sqlite. Stage 2.5 will add mysql + postgres.
 * We centralise the dispatch so the user-facing flag is the same regardless.
 */
async function openAdapter(type: string, conn: string): Promise<DbAdapter> {
  if (type === "sqlite") {
    const adapter = new SqliteAdapter(conn);
    await adapter.open();
    return adapter;
  }
  throw new Error(
    `Unsupported database type '${type}'. ` +
      `Stage 2 supports: sqlite. Stage 2.5 will add mysql, postgres.`,
  );
}

// --- entry ------------------------------------------------------------------

/**
 * Parse argv and return the commander exit code (0 normally).
 *
 * Tests import this directly. We intentionally do NOT call process.exit()
 * inside `main` because that would terminate the jest worker before our
 * assertions run. The shebang at the top of the file invokes us via
 * `process.exit(main(process.argv))` in the bottom guard.
 */
async function main(argv: readonly string[]): Promise<number> {
  const program = buildProgram();
  // By default, commander calls process.exit() on errors / --help.
  // We override that so tests can inspect the parsed state. The shebang
  // entry-point at the bottom of this file restores the exit behaviour.
  program.exitOverride();
  try {
    // parseAsync returns a Promise that resolves after all subcommand
    // actions (including async ones) have completed. Using the sync
    // parse() would let async actions throw UnhandledPromiseRejection.
    await program.parseAsync(argv as string[]);
  } catch (err) {
    // commander throws CommanderError on --help / --version / unknown
    // command. Return 0 for the informational flags, 1 for real errors.
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code: string }).code;
      if (
        code === "commander.helpDisplayed" ||
        code === "commander.help" ||
        code === "commander.version" ||
        code === "commander.helpReplaced"
      ) {
        return 0;
      }
      return 1;
    }
    throw err;
  }
  // Subcommand actions may have set process.exitCode directly (commander 12
  // does not propagate action rejections through parseAsync). Honour that.
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}

// Run only when invoked directly (allows `import { main } from './cli'` in tests)
if (require.main === module) {
  main(process.argv).then((code) => {
    process.exit(code);
  });
}

export { buildProgram, main, readPackageJson };
export type { DbOptions, WatchOptions, StartOptions };
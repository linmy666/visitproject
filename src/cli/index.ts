#!/usr/bin/env node
/**
 * mcpify CLI entry point.
 *
 * Subcommands (stubs in v0.1.0, real implementations in later stages):
 *
 *   mcpify db --type <mysql|postgres|sqlite> --conn <str> --tables <a,b,c>
 *       Reverse-engineer a database schema and expose each table as a
 *       standard MCP tool. Implemented in stage 2.
 *
 *   mcpify watch --dir <path> --type <csv|xlsx>
 *       Watch a local drop folder and expose new files as MCP resources.
 *       Implemented in stage 3.
 *
 *   mcpify start --config <path>
 *       Start an MCP server that aggregates all configured sources over the
 *       stdio transport. Implemented in stage 4.
 *
 *   mcpify --version / --help  → standard CLI flags
 *
 * Why commander:
 *   - De-facto standard for Node CLIs, zero-config TS types via @types/commander
 *   - Built-in help generation (we get `mcpify db --help` for free)
 *   - Plays nicely with `bin` in package.json so `npm i -g mcpify` works
 */

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
      name: "mcpify",
      version: "0.0.0-unknown",
      description: "mcpify CLI",
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

  // --- mcpify db -----------------------------------------------------------
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
    .action((opts: DbOptions) => {
      // Implemented in stage 2.
      // For stage 1 we just acknowledge the flags are wired up correctly.
      // eslint-disable-next-line no-console
      console.log(
        `[stage 1] db command parsed: type=${opts.type} conn=${opts.conn} tables=${opts.tables} print=${String(opts.print)}`,
      );
      // eslint-disable-next-line no-console
      console.log(
        "[stage 1] DB-to-MCP conversion will be implemented in stage 2.",
      );
    });

  // --- mcpify watch --------------------------------------------------------
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
        `[stage 1] watch command parsed: dir=${opts.dir} type=${opts.type} once=${String(opts.once)}`,
      );
      // eslint-disable-next-line no-console
      console.log(
        "[stage 1] File-watcher pipeline will be implemented in stage 3.",
      );
    });

  // --- mcpify start ---------------------------------------------------------
  program
    .command("start")
    .description(
      "Start the MCP server aggregating all configured sources (stage 4)",
    )
    .option("-c, --config <path>", "Path to a JSON config file", "./mcpify.json")
    .action((opts: StartOptions) => {
      // eslint-disable-next-line no-console
      console.log(`[stage 1] start command parsed: config=${opts.config}`);
      // eslint-disable-next-line no-console
      console.log(
        "[stage 1] The stdio MCP server + TUI gateway will be implemented in stage 4.",
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

// --- entry ------------------------------------------------------------------

/**
 * Parse argv and return the commander exit code (0 normally).
 *
 * Tests import this directly. We intentionally do NOT call process.exit()
 * inside `main` because that would terminate the jest worker before our
 * assertions run. The shebang at the top of the file invokes us via
 * `process.exit(main(process.argv))` in the bottom guard.
 */
function main(argv: readonly string[]): number {
  const program = buildProgram();
  // By default, commander calls process.exit() on errors / --help.
  // We override that so tests can inspect the parsed state. The shebang
  // entry-point at the bottom of this file restores the exit behaviour.
  program.exitOverride();
  try {
    program.parse(argv as string[]);
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
  return 0;
}

// Run only when invoked directly (allows `import { main } from './cli'` in tests)
if (require.main === module) {
  const code = main(process.argv);
  process.exit(code);
}

export { buildProgram, main, readPackageJson };
export type { DbOptions, WatchOptions, StartOptions };
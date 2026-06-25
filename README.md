# visitproject

> **Convert legacy enterprise systems into standard MCP servers for AI agents.**
> Point `visitproject` at a database, get a `tools/list` of every table exposed
> as a parameterised MCP tool. No SQL, no ad-hoc glue code, no `; DROP TABLE` risks.

```text
   visitproject - DB-to-MCP adapter for AI agents
   =============================================
        DB-TO-MCP     FILE-TO-MCP    MCP-SERVER-OVER-STDIO
        (stage 2 ✅)  (stage 3)      (stage 4 + TUI gateway)
```

## What is visitproject?

Most enterprise systems (WMS, OMS, TMS, BMS, ERPs) are decades old: closed
databases, file drops, no public APIs. AI agents can't talk to them without
a custom integration for every system.

**visitproject** is the opposite: a single CLI that points at a database
and emits a standards-compliant
[Model Context Protocol](https://modelcontextprotocol.io/) `tools/list` —
one MCP tool per table operation, all parameterised, all safe.

| Stage | Command | Status |
|-------|---------|--------|
| 1 | `visitproject db --type <sqlite\|mysql\|postgres> --conn <str>` (scaffold) | ✅ shipped |
| 2 | `visitproject db ...` — full DB-to-MCP, parameterised queries, MCP JSON Schema | ✅ shipped (this release) |
| 3 | `visitproject watch --dir <path> --type <csv\|xlsx>` — File-to-MCP | 🔜 |
| 4 | `visitproject start --config <path>` — stdio MCP server + TUI + safety gateway | 🔜 |

## Stage 2 quickstart — DB-to-MCP in 30 seconds

```bash
git clone https://github.com/linmy666/visitproject
cd visitproject
npm install --include=dev
npm run build

# Generate the example database
node scripts/seed-example-db.js
# → wrote examples/sample.db (4 tables: users, products, orders, line_items)

# Emit MCP tool JSON for every table in the database
node dist/cli/index.js db --type sqlite --conn sqlite:examples/sample.db --print | head -40

# Or get a human-readable summary
node dist/cli/index.js db --type sqlite --conn sqlite:examples/sample.db
# → [stage 2] 16 MCP tool(s) generated for sqlite://examples/sample.db
#     • db_select_line_items   — Read rows from table 'line_items'. …
#     • db_insert_line_items   — Insert one row into table 'line_items'.
#     • db_update_line_items   — Update rows in table 'line_items' matching …
#     • db_delete_line_items   — Delete rows from table 'line_items' matching …
#     • db_select_orders       — Read rows from table 'orders'. …
#     … (16 tools total: 4 tables × 4 operations)
```

### Filtering to a subset of tables

```bash
node dist/cli/index.js db --type sqlite --conn sqlite:examples/sample.db \
  --tables users,orders --print
# → only db_{select,insert,update,delete}_{users,orders} appear (8 tools)
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  L4  TUI Dashboard + AI Safety Gateway     [stage 4]              │
│      (blessed dashboard, real-time MCP traffic, Y/N circuit-     │
│       breaker before any write tool fires)                       │
├──────────────────────────────────────────────────────────────────┤
│  L3  MCP Server on stdio                  [stage 4]              │
│      (@modelcontextprotocol/sdk Server + transport)              │
├──────────────────────────────────────────────────────────────────┤
│  L2  Resource Pipeline (File-to-MCP)      [stage 3]              │
│      (chokidar watcher → CSV/XLSX parse → MCP Resources)         │
├──────────────────────────────────────────────────────────────────┤
│  L1  DB-to-MCP Adapter                    [stage 2 ✅]           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐     │
│  │ SqliteAdapter│  │ buildWhere() │  │ toolsForAdapter()    │     │
│  │ (better-sql3)│  │ (whitelist) │  │ → JSON Schema + name │     │
│  └─────────────┘  └──────────────┘  └──────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### Safety guarantees (stage 2)

1. **Parameterised queries everywhere.** `buildWhere()` produces
   `?`-placeholder SQL with a parallel `params` array. Identifiers go
   through a strict ASCII whitelist (`/^[a-zA-Z_][a-zA-Z0-9_$]*$/`).
2. **No raw `; DROP TABLE` style attacks.** A condition referencing a
   non-whitelisted column throws `DbError(UNKNOWN_COLUMN)`. A column
   with `;` or `--` or a hyphen fails `validateIdentifier()` with
   `DbError(INVALID_IDENTIFIER)`.
3. **Bounded reads.** `SELECT` always appends `LIMIT ?` (clamped to
   1-1000). Truncation is signalled to the LLM via
   `SelectResult.truncated = true`.
4. **No naked `DELETE` / `UPDATE`.** Both require a `where` clause;
   empty `where` is rejected with `DbError(QUERY_REJECTED)`.
5. **`MAX_PARAMS = 64`** hard cap on total placeholders per query.

## Tests

```bash
npm test
```

**59/59 tests passing** across 5 suites:

- `test/db/schema.test.ts` — 13 tests for SQLite type parsing + identifier
  whitelist (covers injection attack vectors)
- `test/db/sqlite.test.ts` — 15 tests for SqliteAdapter (connection lifecycle,
  listTables, describeTable, select/insert/update/delete)
- `test/db/query.test.ts` — 14 tests for buildWhere (all operators,
  whitelist enforcement, MAX_PARAMS, like/in edge cases)
- `test/db/mcp-tools.test.ts` — 8 tests for toolsForTable and toolsForAdapter
  (per-table tool count, JSON Schema shape, enums, integration)
- `test/unit/cli.test.ts` — 9 tests for commander wiring (stage 1 smoke
  tests + stage 2 db subcommand end-to-end via a seeded SQLite file)

## Module layout

```
src/
├── cli/
│   └── index.ts          # commander entry point
├── db/                   # stage 2: DB-to-MCP
│   ├── adapter.ts        # DbAdapter interface (SQL injection boundary)
│   ├── schema.ts         # PRAGMA table_info parsing + type normalisation
│   ├── sqlite.ts         # SqliteAdapter (better-sqlite3)
│   ├── query.ts          # buildWhere() — parameterised WHERE builder
│   ├── mcp-tools.ts      # table → McpTool[] (JSON Schema)
│   └── index.ts          # public surface (barrel)
├── filewatch/            # stage 3: File-to-MCP (placeholder)
├── server/               # stage 4: stdio MCP server (placeholder)
├── tui/                  # stage 4: blessed TUI (placeholder)
└── util/
```

## Requirements

- Node.js ≥ 18
- TypeScript 5.6+ (build only)
- npm 9+
- Native build toolchain (Xcode CLT on macOS) — required by `better-sqlite3`

If `npm install` is run with `--ignore-scripts` and you later need
better-sqlite3, run `npm run build-release` inside `node_modules/better-sqlite3`.

## Roadmap

- ✅ **Stage 1**: scaffold, CLI skeleton, tests
- ✅ **Stage 2** (this release): DB-to-MCP — introspect tables, generate
  MCP Tool JSON, parameterise queries (no SQL injection), MySQL/PostgreSQL
  adapters in 2.5
- 🔜 **Stage 3**: File-to-MCP — chokidar watcher + CSV/XLSX parser
- 🔜 **Stage 4**: Stdio MCP server + blessed TUI dashboard + Y/N
  circuit-breaker for write tools

## License

MIT. See [`LICENSE`](LICENSE).

## Contact

Lin Ruihan — [chuiniu@me.com](mailto:chuiniu@me.com) — [github.com/linmy666](https://github.com/linmy666)

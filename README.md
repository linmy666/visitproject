# mcpify

> **Convert legacy supply chain systems into standard MCP servers for AI agents.**
> Turn closed databases and file-drop folders into a CLI-driven middleware that
> exposes them as `@modelcontextprotocol/sdk`-compliant tools and resources.

```text
   mcpify - convert legacy supply chain systems into MCP servers
   ==============================================================
        DB-TO-MCP     FILE-TO-MCP    MCP-SERVER-OVER-STDIO
        (stage 2)     (stage 3)      (stage 4 + TUI gateway)
```

## What is mcpify?

Most supply chain systems (WMS, OMS, TMS, BMS) are decades old: closed
databases, CSV file drops from old ERPs, no public APIs. AI agents
cannot talk to them without a custom integration for every system.

**mcpify** is the opposite: a single CLI that points at a database or
folder and emits a standards-compliant
[Model Context Protocol](https://modelcontextprotocol.io/) server on
stdio. Any modern AI agent (Claude Code, Cursor, custom LangGraph
apps, madcop v0.5) can connect to it instantly.

## Subcommands (stages 1–4)

| Stage | Command | Status |
|-------|---------|--------|
| 1 | `mcpify db --type <mysql\|postgres\|sqlite> --conn <str> --tables <a,b,c>` | ✅ scaffold |
| 2 | `mcpify db ...` (full DB-to-MCP) | 🔜 stage 2 |
| 3 | `mcpify watch --dir <path> --type <csv\|xlsx>` | 🔜 stage 3 |
| 4 | `mcpify start --config <path>` (stdio MCP server + TUI dashboard + safety gateway) | 🔜 stage 4 |

Stage 1 ships the project skeleton, dependency pinning, strict
TypeScript build, commander-driven CLI parser, and unit tests for the
three subcommands. Stages 2-4 layer real functionality on top.

## Architecture (planned, 4 layers)

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
│  L1  DB-to-MCP Adapter                    [stage 2]              │
│      (schema introspection → SQL parameterisation → MCP Tools)  │
└──────────────────────────────────────────────────────────────────┘
```

## Quick start (stage 1)

```bash
git clone https://github.com/linmy666/mcpify
cd mcpify
npm install
npm run build
node dist/cli/index.js --version     # → 0.1.0
node dist/cli/index.js db --help
```

## Tests

```bash
npm test
```

6 stage-1 tests cover: program construction, version flag, help exit,
and flag parsing for all three subcommands.

## Requirements

- Node.js ≥ 18
- TypeScript 5.6+ (build only)
- npm 9+

## Roadmap

- ✅ **Stage 1** (this release): scaffold, CLI skeleton, tests
- 🔜 **Stage 2**: DB-to-MCP — introspect tables, generate MCP Tool JSON,
  parameterise queries (no SQL injection), handle MySQL / PostgreSQL / SQLite
- 🔜 **Stage 3**: File-to-MCP — chokidar watcher + CSV/XLSX parser
- 🔜 **Stage 4**: Stdio MCP server + blessed TUI dashboard + Y/N
  circuit-breaker for write tools

## License

MIT. See [`LICENSE`](LICENSE).

## Contact

Lin Ruihan · chuiniu@me.com
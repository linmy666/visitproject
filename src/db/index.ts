/**
 * visitproject — DB module public surface.
 *
 * Importers should go through this barrel:
 *   import { SqliteAdapter, toolsForAdapter, buildWhere } from "../db/index.js";
 *
 * Not via deep paths; lets us refactor internals without touching consumers.
 */

export type {
  DbAdapter,
  Row,
  SelectResult,
  IdentifierKind,
} from "./adapter.js";
export { DbError } from "./adapter.js";

export type {
  ColumnInfo,
  TableSchema,
  SqliteColumnType,
} from "./schema.js";
export {
  parseColumnInfo,
  normaliseColumnType,
  validateIdentifier,
} from "./schema.js";

export type {
  WhereOp,
  WhereCondition,
  WhereClause,
  BuiltWhere,
} from "./query.js";
export { buildWhere, buildColumnWhitelist, MAX_PARAMS } from "./query.js";

export type {
  McpTool,
  McpToolInputSchema,
  McpPropertySchema,
} from "./mcp-tools.js";
export {
  toolsForTable,
  toolsForAdapter,
} from "./mcp-tools.js";

export { SqliteAdapter } from "./sqlite.js";

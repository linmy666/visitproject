/**
 * visitproject — MCP Tool generator.
 *
 * For every user-defined table, generates:
 *   - db_select_<table>      (read rows)
 *   - db_insert_<table>      (write row)
 *   - db_update_<table>      (modify rows by condition)
 *   - db_delete_<table>      (remove rows by condition)
 *
 * Each tool has a JSON Schema describing its inputs, following MCP's
 * tools/list protocol. The MCP server (stage 4) consumes these.
 *
 * Why generate from schema, not hand-write? Two reasons:
 *   1. Adding a new table = 0 lines of MCP plumbing.
 *   2. Types stay in sync with the DB by construction.
 */
import type { DbAdapter } from "./adapter.js";
import type { ColumnInfo, TableSchema } from "./schema.js";

/**
 * MCP tool input schema. We use a strict subset of JSON Schema Draft 7
 * that JSON Schema Draft 2020-12 also accepts.
 */
export interface McpToolInputSchema {
  type: "object";
  properties: Record<string, McpPropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpPropertySchema {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  description?: string;
  enum?: unknown[];
  items?: McpPropertySchema;
  // Nested object: an object property can have its own properties.
  properties?: Record<string, McpPropertySchema>;
  required?: string[];
  // Default value allowed in some MCP schemas (we surface the limit default).
  default?: unknown;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * A fully-described MCP tool — exactly the shape mcp servers return
 * in tools/list responses.
 */
export interface McpTool {
  /** Globally unique tool name, e.g. "db_select_orders". */
  name: string;
  /** Human-readable description (English, for the LLM). */
  description: string;
  /** JSON Schema describing accepted input. */
  inputSchema: McpToolInputSchema;
}

/**
 * Generate all four tools for one table.
 */
export function toolsForTable(table: TableSchema): McpTool[] {
  return [
    selectTool(table),
    insertTool(table),
    updateTool(table),
    deleteTool(table),
  ];
}

/**
 * Generate tools for every table in the database.
 */
export async function toolsForAdapter(adapter: DbAdapter): Promise<McpTool[]> {
  await adapter.open();
  try {
    const tableNames = await adapter.listTables();
    const allTools: McpTool[] = [];
    for (const name of tableNames) {
      const schema = await adapter.describeTable(name);
      allTools.push(...toolsForTable(schema));
    }
    return allTools;
  } finally {
    await adapter.close();
  }
}

/**
 * Map a SQLite column type to a JSON Schema property.
 */
function columnToProperty(col: ColumnInfo): McpPropertySchema {
  switch (col.type) {
    case "integer":
      return { type: "integer", description: `Integer column '${col.name}'` };
    case "real":
      return { type: "number", description: `Numeric column '${col.name}'` };
    case "boolean":
      return { type: "boolean", description: `Boolean column '${col.name}'` };
    case "blob":
      return { type: "string", description: `Binary column '${col.name}' (base64-encoded)` };
    case "text":
    default:
      return { type: "string", description: `Text column '${col.name}'` };
  }
}

/**
 * db_select_<table>: filter rows by optional WHERE clause.
 */
function selectTool(table: TableSchema): McpTool {
  const columnProps: Record<string, McpPropertySchema> = {};
  for (const col of table.columns) {
    columnProps[col.name] = {
      ...columnToProperty(col),
      description: `Filter on column '${col.name}'`,
    };
  }

  return {
    name: `db_select_${table.name}`,
    description: `Read rows from table '${table.name}'. Returns at most 'limit' rows.`,
    inputSchema: {
      type: "object",
      properties: {
        where: {
          type: "object",
          description: "Optional AND-only WHERE clause.",
          properties: {
            and: {
              type: "array",
              description: "Conditions combined with AND.",
              items: {
                type: "object",
                properties: {
                  column: {
                    type: "string",
                    description: "Column name (whitelist enforced at runtime).",
                    enum: table.columns.map((c) => c.name),
                  },
                  op: {
                    type: "string",
                    enum: ["eq", "ne", "lt", "lte", "gt", "gte", "in", "like"],
                  },
                  value: {
                    description: "Comparison value. For 'in', must be an array.",
                  },
                },
                required: ["column", "op", "value"],
              },
            },
          },
        },
        limit: {
          type: "integer",
          description: "Maximum rows to return (1-1000). Defaults to 100.",
          minimum: 1,
          maximum: 1000,
          default: 100,
        },
      },
    },
  };
}

/**
 * db_insert_<table>: insert one row.
 */
function insertTool(table: TableSchema): McpTool {
  const properties: Record<string, McpPropertySchema> = {};
  const required: string[] = [];

  for (const col of table.columns) {
    properties[col.name] = columnToProperty(col);
    // SQLite: PRIMARY KEY is implicit unless AUTOINCREMENT — let's require
    // every non-PK column. The DB will compute the PK if it's INTEGER PRIMARY KEY.
    if (!col.primaryKey) {
      required.push(col.name);
    }
  }

  return {
    name: `db_insert_${table.name}`,
    description: `Insert one row into table '${table.name}'.`,
    inputSchema: {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    },
  };
}

/**
 * db_update_<table>: modify rows matching WHERE.
 *
 * Note: 'where' is required to prevent accidental mass-updates.
 */
function updateTool(table: TableSchema): McpTool {
  const properties: Record<string, McpPropertySchema> = {};
  for (const col of table.columns) {
    properties[col.name] = columnToProperty(col);
  }

  return {
    name: `db_update_${table.name}`,
    description: `Update rows in table '${table.name}' matching the WHERE clause. Returns affected row count.`,
    inputSchema: {
      type: "object",
      properties: {
        values: {
          type: "object",
          description: "Column → new value mapping.",
          properties,
        },
        where: {
          type: "object",
          description: "Required AND-only WHERE clause to scope which rows to update.",
          properties: {
            and: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  column: { type: "string", enum: table.columns.map((c) => c.name) },
                  op: {
                    type: "string",
                    enum: ["eq", "ne", "lt", "lte", "gt", "gte", "in", "like"],
                  },
                  value: {},
                },
                required: ["column", "op", "value"],
              },
            },
          },
        },
      },
      required: ["values", "where"],
      additionalProperties: false,
    },
  };
}

/**
 * db_delete_<table>: remove rows matching WHERE. WHERE is required.
 */
function deleteTool(table: TableSchema): McpTool {
  return {
    name: `db_delete_${table.name}`,
    description: `Delete rows from table '${table.name}' matching the WHERE clause. Returns affected row count.`,
    inputSchema: {
      type: "object",
      properties: {
        where: {
          type: "object",
          description: "Required AND-only WHERE clause. Refuses to run without scope.",
          properties: {
            and: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  column: { type: "string", enum: table.columns.map((c) => c.name) },
                  op: {
                    type: "string",
                    enum: ["eq", "ne", "lt", "lte", "gt", "gte", "in", "like"],
                  },
                  value: {},
                },
                required: ["column", "op", "value"],
              },
            },
          },
        },
      },
      required: ["where"],
      additionalProperties: false,
    },
  };
}
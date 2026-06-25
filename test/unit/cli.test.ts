/**
 * Smoke test for the CLI parser.
 *
 * Stage 1 only proves that commander parses our three subcommands and
 * their flags correctly. Real DB / file-watch / MCP-server behaviour
 * lands in stages 2-4, with their own dedicated tests.
 */

import { buildProgram, main } from "../../src/cli/index";

describe("CLI scaffold (stage 1)", () => {
  test("buildProgram returns a Command with the three subcommands", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("db");
    expect(names).toContain("watch");
    expect(names).toContain("start");
  });

  test("main returns 0 with no subcommand (prints help)", () => {
    // No subcommand is allowed; commander prints help and we exit 0.
    const spy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = main(["node", "mcpify"]);
    spy.mockRestore();
    expect(code).toBe(0);
  });

  test("main parses db --type --conn --tables without throwing", () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    const code = main([
      "node",
      "mcpify",
      "db",
      "--type",
      "sqlite",
      "--conn",
      "sqlite:./x.db",
      "--tables",
      "a,b,c",
    ]);
    spy.mockRestore();
    const joined = out.join("");
    expect(code).toBe(0);
    expect(joined).toContain("type=sqlite");
    expect(joined).toContain("conn=sqlite:./x.db");
    expect(joined).toContain("tables=a,b,c");
  });

  test("main parses watch --dir --type", () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    main(["node", "mcpify", "watch", "--dir", "/tmp/drop", "--type", "csv"]);
    spy.mockRestore();
    expect(out.join("")).toContain("dir=/tmp/drop");
    expect(out.join("")).toContain("type=csv");
  });

  test("main parses start --config", () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    main(["node", "mcpify", "start", "--config", "./mcpify.json"]);
    spy.mockRestore();
    expect(out.join("")).toContain("config=./mcpify.json");
  });

  test("--version returns 0 and prints the package version", () => {
    const out: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    });
    const code = main(["node", "mcpify", "--version"]);
    spy.mockRestore();
    expect(code).toBe(0);
    expect(out.join("")).toContain("0.1.0");
  });
});
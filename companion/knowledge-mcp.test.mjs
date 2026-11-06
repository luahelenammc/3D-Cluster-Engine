import test from "node:test";
import assert from "node:assert/strict";
import { createMcpServer, validateSnapshot } from "./knowledge-mcp.mjs";

const snapshot = {
  snapshotVersion: "1.0", datasetId: "synthetic", revision: 2, generatedAt: "2026-11-06",
  warning: "Explicit synthetic export",
  pages: [
    { id: "wiki:a", title: "Aurora", body: "Aurora financia Boreal.", status: "sourced", backlinks: [],
      citations: [{ path: "a.md", fingerprint: "sha256-1234567", quote: "Aurora financia Boreal." }] },
    { id: "wiki:b", title: "Boreal", body: "Boreal é coordenado por Aurora.", status: "sourced",
      backlinks: ["a"], citations: [] },
  ],
};
test("MCP serves read-only tools with no source/exec/write path", () => {
  const mcp = createMcpServer(snapshot);
  const list = mcp.handle({ id: 1, method: "tools/list" }).result.tools.map((t) => t.name);
  assert.deepEqual(list, ["overview", "search", "read_page", "backlinks", "find_path"]);
  assert.equal(mcp.handle({ id: 2, method: "tools/call", params: { name: "search", arguments: { query: "Aurora" } } }).result.isError, false);
  assert.equal(mcp.handle({ id: 3, method: "tools/call", params: { name: "find_path", arguments: { from: "wiki:a", to: "wiki:b" } } }).result.isError, false);
  assert.equal(mcp.handle({ id: 4, method: "tools/call", params: { name: "write_file" } }).error.code, -32000);
  assert.equal(mcp.handle({ id: 5, method: "tools/call", params: { name: "read_page", arguments: { pageId: "../../secret" } } }).error.code, -32000);
  assert.deepEqual(mcp.handle({ method: "notifications/initialized" }), null);
});
test("Rejects malformed and excessive portable snapshots", () => {
  assert.throws(() => validateSnapshot({ ...snapshot, pages: [...snapshot.pages, snapshot.pages[0]] }), /Página inválida/);
  assert.throws(() => validateSnapshot({ ...snapshot, pages: [{ ...snapshot.pages[0], body: "x".repeat(5000) }] }), /Página inválida/);
});

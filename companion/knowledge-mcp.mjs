import { readFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

function ensure(value, message) { if (!value) throw new Error(message); }
export function validateSnapshot(input) {
  ensure(input && typeof input === "object" && !Array.isArray(input), "Snapshot inválido.");
  ensure(input.snapshotVersion === "1.0" && typeof input.datasetId === "string" && Array.isArray(input.pages) && input.pages.length <= 2000, "Schema de snapshot inválido.");
  const ids = new Set();
  for (const p of input.pages) {
    ensure(p && typeof p.id === "string" && !ids.has(p.id) && typeof p.title === "string"
      && p.title.length <= 300 && typeof p.body === "string" && p.body.length <= 4500
      && Array.isArray(p.backlinks) && p.backlinks.length <= 200
      && Array.isArray(p.citations) && p.citations.length <= 30, "Página inválida.");
    ids.add(p.id);
  }
  return input;
}
function words(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}
function summary(text, size = 750) { return String(text).slice(0, size); }
export function createMcpServer(input) {
  const snapshot = validateSnapshot(input);
  const pages = new Map(snapshot.pages.map((p) => [p.id, p]));
  const tools = [
    { name: "overview", description: "Read-only totals and revision of an explicitly exported LMS3D wiki snapshot.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "search", description: "Search titles and excerpts of the exported wiki, without network or writes.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } }, required: ["query"], additionalProperties: false } },
    { name: "read_page", description: "Read a bounded derived page by exact ID, with citation references.", inputSchema: { type: "object", properties: { pageId: { type: "string" } }, required: ["pageId"], additionalProperties: false } },
    { name: "backlinks", description: "Read incoming page IDs from the exported snapshot.", inputSchema: { type: "object", properties: { pageId: { type: "string" } }, required: ["pageId"], additionalProperties: false } },
    { name: "find_path", description: "Find a shortest path on exported backlinks (not a claim of causation).", inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, maxHops: { type: "integer", minimum: 1, maximum: 8 } }, required: ["from", "to"], additionalProperties: false } },
  ];
  function dispatch(name, args = {}) {
    ensure(args && typeof args === "object" && !Array.isArray(args), "Argumentos inválidos.");
    if (name === "overview") return { datasetId: snapshot.datasetId, revision: snapshot.revision, pages: pages.size, generatedAt: snapshot.generatedAt, caution: snapshot.warning };
    if (name === "search") {
      const query = String(args.query || "").slice(0, 250);
      ensure(query.trim(), "Consulta vazia.");
      const tokens = [...new Set(words(query))].slice(0, 24);
      return snapshot.pages.map((p) => ({ id: p.id, title: p.title, status: p.status, excerpt: summary(p.body, 270),
        score: tokens.reduce((s, t) => s + (words(p.title).includes(t) ? 5 : 0) + (words(p.body).includes(t) ? 1 : 0), 0) }))
        .filter((p) => p.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, Math.min(20, Math.max(1, Number(args.limit || 8))));
    }
    if (name === "read_page") {
      const p = pages.get(String(args.pageId || ""));
      ensure(p, "Página não encontrada no snapshot.");
      return { id: p.id, title: p.title, status: p.status, body: p.body,
        citations: p.citations.map((c) => ({ path: c.path, fingerprint: c.fingerprint, quote: summary(c.quote, 350) })) };
    }
    if (name === "backlinks") {
      const p = pages.get(String(args.pageId || ""));
      ensure(p, "Página não encontrada.");
      return { pageId: p.id, backlinks: p.backlinks.map((id) => "wiki:" + id).filter((id) => pages.has(id)) };
    }
    if (name === "find_path") {
      const from = String(args.from || ""), to = String(args.to || "");
      ensure(pages.has(from) && pages.has(to), "Página inicial ou final desconhecida.");
      const adj = new Map([...pages].map(([id]) => [id, []]));
      for (const p of pages.values()) for (const fromNode of p.backlinks) {
        const id = "wiki:" + fromNode;
        if (adj.has(id)) adj.get(id).push(p.id);
      }
      const queue = [[from]], cap = Math.min(8, Math.max(1, Number(args.maxHops || 6)));
      while (queue.length) {
        const path = queue.shift();
        if (path.at(-1) === to) return { found: true, path, unverifiedSemanticPath: true };
        if (path.length > cap) continue;
        for (const next of adj.get(path.at(-1)) || []) if (!path.includes(next)) queue.push([...path, next]);
      }
      return { found: false, path: [], reason: "Nenhuma conexão no snapshot parcial." };
    }
    throw new Error("Ferramenta não permitida.");
  }
  function handle(message) {
    const { id, method, params } = message || {};
    if (!method || typeof method !== "string") return id === undefined ? null : { jsonrpc: "2.0", id, error: { code: -32600, message: "Requisição inválida." } };
    if (method.startsWith("notifications/")) return null;
    try {
      if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "lms3d-knowledge-readonly", version: "0.4.0" } } };
      if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
      if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
      if (method === "tools/call") {
        const data = dispatch(params?.name, params?.arguments || {});
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data) }], isError: false } };
      }
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Método desconhecido." } };
    } catch (err) {
      return { jsonrpc: "2.0", id, error: { code: -32000, message: String(err.message).slice(0, 350) } };
    }
  }
  return { handle, tools };
}
async function main() {
  const path = process.env.LMS3D_MCP_SNAPSHOT;
  ensure(path && /\.json$/i.test(path), "Configure LMS3D_MCP_SNAPSHOT para o snapshot JSON exportado deliberadamente.");
  const file = await stat(path);
  ensure(file.isFile() && file.size <= 8 * 1024 * 1024, "Snapshot excede 8 MiB ou não é arquivo.");
  const server = createMcpServer(JSON.parse(await readFile(path, "utf-8")));
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    try {
      if (line.length > 16000) throw new Error("Mensagem excede 16 KiB.");
      const result = server.handle(JSON.parse(line));
      if (result) process.stdout.write(JSON.stringify(result) + "\n");
    } catch (error) { process.stderr.write("MCP: " + String(error.message).slice(0, 140) + "\n"); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(String(error.message).slice(0, 350) + "\n"); process.exitCode = 1; });
}

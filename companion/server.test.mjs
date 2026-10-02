import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBridgeServer } from "./server.mjs";

const servers = new Set();

async function withServer(mode, run, options = {}) {
  const server = createBridgeServer({ mode, env: { BRIDGE_ALLOWED_ORIGINS: "http://localhost:5173", ...options.env }, fetchImpl: options.fetchImpl || fetch });
  servers.add(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); servers.delete(server); }
}

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve) => server.close(resolve))));
  servers.clear();
});

describe("optional AI bridge", () => {
  it("exposes provider-independent health without revealing credentials", async () => {
    await withServer("mock", async (base) => {
      const response = await fetch(`${base}/health`);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.providerConfigured, true);
      assert.equal(body.capabilities.directGraphWrite, false);
      assert.equal(JSON.stringify(body).includes("API_KEY"), false);
    });
  });

  it("returns a schema-valid mock query answer bound to packet evidence", async () => {
    await withServer("mock", async (base) => {
      const packet = { packetVersion: "1.0", query: "why", datasetId: "d", createdAt: new Date().toISOString(), nodes: [{ nodeId: "n1", label: "One", cluster: "root", score: 1, excerpt: "One" }], sources: [{ sourceId: "s1", path: "a.md", fingerprint: "sha256:12345678", excerpt: "Evidence", score: 1 }], constraints: [] };
      const response = await fetch(`${base}/v1/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ packet }) });
      const answer = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(answer.nodeIds, ["n1"]);
      assert.equal(answer.sourceRefs[0].sourceId, "s1");
    });
  });

  it("rejects requests from an unconfigured origin", async () => {
    await withServer("mock", async (base) => {
      const response = await fetch(`${base}/health`, { headers: { origin: "https://evil.example" } });
      assert.equal(response.status, 403);
    });
  });

  it("keeps provider credentials absent from the browser facing health contract", async () => {
    const server = createBridgeServer({ mode: "provider", env: { BRIDGE_ALLOWED_ORIGINS: "http://localhost:5173", AI_PROVIDER_API_KEY: "secret", AI_PROVIDER_MODEL: "model", AI_PROVIDER_BASE_URL: "https://provider.example" } });
    servers.add(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    try {
      const body = await fetch(`http://127.0.0.1:${address.port}/health`).then((response) => response.json());
      assert.equal(body.providerConfigured, true);
      assert.equal(JSON.stringify(body).includes("secret"), false);
    } finally { await new Promise((resolve) => server.close(resolve)); servers.delete(server); }
  });

  it("requires the configured client token and allows the browser preflight", async () => {
    await withServer("mock", async (base) => {
      const denied = await fetch(`${base}/health`);
      assert.equal(denied.status, 401);
      const options = await fetch(`${base}/v1/query`, { method: "OPTIONS", headers: { origin: "http://localhost:5173", "access-control-request-headers": "authorization,content-type" } });
      assert.equal(options.status, 204);
      assert.match(options.headers.get("access-control-allow-headers"), /authorization/i);
      const allowed = await fetch(`${base}/health`, { headers: { authorization: "Bearer local-access" } });
      assert.equal(allowed.status, 200);
    }, { env: { BRIDGE_CLIENT_TOKEN: "local-access" } });
  });

  it("rejects a provider proposal whose evidence is outside the submitted source manifest", async () => {
    const proposal = {
      proposalVersion: "1.0", proposalId: "provider-result", datasetId: "demo", createdAt: new Date().toISOString(), compiler: "ai-bridge", summary: "test",
      operations: [{ operationId: "add-x", kind: "add-cluster", cluster: { id: "x", label: "X" }, confidence: 0.7, epistemicStatus: "derived", rationale: "test evidence binding", evidence: [{ sourceId: "not-submitted", path: "other.md", fingerprint: "sha256:12345678", quote: "text", derivation: "derived" }] }],
    };
    const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(proposal) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    await withServer("provider", async (base) => {
      const now = new Date().toISOString();
      const manifest = { manifestVersion: "1.0", adapter: "markdown-vault", vaultId: "vault-12345678", createdAt: now, fingerprint: "sha256:12345678", capabilities: { read: true, diff: true, stableIds: true, anchors: true, directWrite: false, patchExport: true, renameAwareness: true }, sources: [{ sourceId: "s1", adapter: "markdown-vault", path: "a.md", title: "A", fingerprint: "sha256:12345678", headings: [], tags: [], frontmatter: {}, links: [], content: "source", byteLength: 6, provenance: { kind: "user-selected-local-file", capturedAt: now } }] };
      const response = await fetch(`${base}/v1/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataset: { meta: { id: "demo" }, nodes: [], links: [], clusters: [] }, manifest, changedSourceIds: ["s1"] }) });
      assert.equal(response.status, 422);
      assert.match((await response.json()).error, /Evidence binding failed/);
    }, { env: { AI_PROVIDER_API_KEY: "server-secret", AI_PROVIDER_MODEL: "model", AI_PROVIDER_BASE_URL: "https://provider.example" }, fetchImpl });
  });
});

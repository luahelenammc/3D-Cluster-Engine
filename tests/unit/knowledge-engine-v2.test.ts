import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { GraphDataset, RuntimeGraph } from "../../src/core/types";
import type { SourceManifest } from "../../src/second-mind/types";
import ledgerSchema from "../../schema/knowledge-ledger.schema.json";
import { aggregateClusterProjection } from "../../src/knowledge-engine/aggregation";
import { ledgerFromGraph } from "../../src/knowledge-engine/ledger";
import { buildKnowledgeQueryPacketV2, lexicalStructuralScore } from "../../src/knowledge-engine/retrieval";

const evidence = { sourceId: "source:concepts.md", path: "concepts.md", fingerprint: "sha256-12345678", quote: "A iniciativa Aurora financia Boreal.", derivation: "explicit" as const };
const manifest: SourceManifest = {
  manifestVersion: "1.0", adapter: "markdown-vault", vaultId: "test", createdAt: "2026-11-06T15:00:00.000Z", fingerprint: "manifest-12345678",
  capabilities: { read: true, diff: true, stableIds: true, anchors: true, directWrite: false, patchExport: true, renameAwareness: true },
  sources: [{ sourceId: evidence.sourceId, path: evidence.path, adapter: "markdown-vault", title: "Conceitos", fingerprint: evidence.fingerprint,
    headings: [], tags: [], links: [], frontmatter: {}, content: "# Conceitos\nA iniciativa Aurora financia Boreal.",
    byteLength: 47, provenance: { kind: "user-selected-local-file", capturedAt: "2026-11-06T15:00:00.000Z" } }],
};
const dataset: GraphDataset = {
  schemaVersion: "1.1", meta: { id: "test-v2", title: "Teste independente", version: "1.0.0" },
  clusters: [{ id: "c1", label: "Cluster A" }, { id: "c2", label: "Cluster B" }],
  nodes: [{ id: "a", label: "Aurora", cluster: "c1" }, { id: "b", label: "Boreal", cluster: "c2" }, { id: "c", label: "Isolada", cluster: "c2" }],
  links: [{ id: "ab", source: "a", target: "b", type: "finance", directed: true, metadata: { relation: "financia", secondMind: { evidence: [evidence], epistemicStatus: "explicit" } } }],
};

describe("Knowledge Engine v2 quality gates", () => {
  it("returns a citation-bound path and abstains from disconnected source", () => {
    const ledger = ledgerFromGraph(dataset, manifest);
    const packet = buildKnowledgeQueryPacketV2(dataset, manifest, "Aurora financiamento", ledger.assertions, { selectedNodeId: "a", targetNodeId: "b" });
    expect(packet.packetVersion).toBe("2.0");
    expect(packet.nodes.some((item) => item.nodeId === "a")).toBe(true);
    expect(packet.paths[0].links).toEqual(["ab"]);
    expect(packet.paths[0].evidence[0].citations[0].sourceId).toBe(evidence.sourceId);
    expect(packet.constraints.some((item) => item.includes("embeddings não"))).toBe(true);
    const disconnected = buildKnowledgeQueryPacketV2(dataset, manifest, "Aurora", ledger.assertions, { selectedNodeId: "c", targetNodeId: "a" });
    expect(disconnected.paths[0].found).toBe(false);
  });
  it("makes unrelated names rank below meaningful local matches", () => {
    expect(lexicalStructuralScore("Aurora", "Projeto Aurora")).toBeGreaterThan(lexicalStructuralScore("Aurora", "Caneta preta"));
  });
  it("creates reversible cluster supernodes without mutating the input", () => {
    const graph: RuntimeGraph = { nodes: dataset.nodes.map((node) => ({ ...node })), links: dataset.links.map((link) => ({ ...link })) };
    const before = JSON.stringify(graph);
    const projection = aggregateClusterProjection(graph, dataset.clusters);
    expect(projection.graph.nodes).toHaveLength(2);
    expect(projection.graph.links).toHaveLength(1);
    expect(projection.membership["lod:c1"]).toEqual(["a"]);
    expect(projection.membership["lod:c2"]).toEqual(["b", "c"]);
    expect(JSON.stringify(graph)).toBe(before);
    expect(projection.graph.links[0].metadata?.knowledgeLOD).toMatchObject({ collapsedLinkCount: 1 });
  });
  it("validates a real sidecar record with the versioned public JSON schema", () => {
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(ledgerSchema);
    const ledger = ledgerFromGraph(dataset, manifest);
    expect(validate(ledger), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...ledger, ledgerVersion: "0.0" })).toBe(false);
    expect(validate({ ...ledger, assertions: [{ ...ledger.assertions[0], confidence: 2 }] })).toBe(false);
  });
});

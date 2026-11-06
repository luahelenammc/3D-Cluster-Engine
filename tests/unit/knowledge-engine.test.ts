import { describe, expect, it } from "vitest";
import type { GraphDataset } from "../../src/core/types";
import type { GraphDeltaProposal, SourceManifest } from "../../src/second-mind/types";
import { applyGraphDelta } from "../../src/second-mind/proposals";
import { chunkManifest, planIncrementalExtraction } from "../../src/knowledge-engine/chunks";
import { createBridgeSemanticExtractor } from "../../src/knowledge-engine/extraction";
import { buildObsidianVaultExport, exportGraphML, previewGraphifyImport } from "../../src/knowledge-engine/interoperability";
import { auditLedger, evaluateAssertion, ledgerFromGraph, ledgerFromProposal, validateEvidence } from "../../src/knowledge-engine/ledger";
import { findKnowledgePath, pathEvidenceCoverage } from "../../src/knowledge-engine/paths";
import { detectAssertionContradictions, suggestEntityMerges } from "../../src/knowledge-engine/reconcile";
import { analyzeTopology } from "../../src/knowledge-engine/topology";
import { createLocalZip } from "../../src/knowledge-engine/zip";

const evidence = { sourceId: "source:notes/a.md", path: "notes/a.md", fingerprint: "sha256-valid-12345678", anchor: "origem", quote: "Aurora apoia Boreal.", derivation: "explicit" as const };
const manifest: SourceManifest = {
  manifestVersion: "1.0", adapter: "markdown-vault", vaultId: "synthetic-vault", createdAt: "2026-11-06T00:00:00.000Z", fingerprint: "manifest-20261106",
  capabilities: { read: true, diff: true, stableIds: true, anchors: true, directWrite: false, patchExport: true, renameAwareness: true },
  sources: [{
    sourceId: evidence.sourceId, adapter: "markdown-vault", path: evidence.path, title: "Origem", fingerprint: evidence.fingerprint,
    headings: [{ depth: 1, text: "Origem", anchor: "origem" }], tags: [], frontmatter: {}, links: [],
    content: "# Origem\nAurora apoia Boreal.\nBoreal coordena Cobalto.",
    byteLength: 55, provenance: { kind: "user-selected-local-file", capturedAt: "2026-11-06T00:00:00.000Z" },
  }],
};
const dataset: GraphDataset = {
  schemaVersion: "1.1", meta: { id: "synthetic-kge", title: "Corpus fictício", version: "1.0.0" },
  clusters: [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }],
  nodes: [
    { id: "a", label: "Aurora", cluster: "alpha" },
    { id: "b", label: "Boreal", cluster: "alpha" },
    { id: "c", label: "Cobalto", cluster: "beta" },
  ],
  links: [
    { id: "ab", source: "a", target: "b", type: "supports", directed: true, metadata: { relation: "apoia", secondMind: { evidence: [evidence], epistemicStatus: "explicit", confidence: 0.93 } } },
    { id: "bc", source: "b", target: "c", type: "coordinates", directed: true },
  ],
};
const proposal: GraphDeltaProposal = {
  proposalVersion: "1.0", proposalId: "p1", datasetId: "synthetic-kge", createdAt: "2026-11-06T00:00:00.000Z",
  compiler: "ai-bridge", summary: "Proposta sintética sem dados pessoais.",
  operations: [{
    operationId: "new-edge", kind: "add-link",
    link: { id: "ac", source: "a", target: "c", type: "supports", directed: true, metadata: { relation: "financia" } },
    confidence: 0.84, epistemicStatus: "inferred",
    rationale: "Relação candidata para testar preservação de proveniência.",
    evidence: [evidence],
  }],
};

describe("Knowledge Engine: evidence sovereignty", () => {
  it("verifies exact source and fingerprint, rejecting stale or fabricated citations", () => {
    expect(validateEvidence(evidence, manifest)).toEqual([]);
    expect(validateEvidence({ ...evidence, fingerprint: "wrong-hash" }, manifest)).toContain("Fingerprint ou caminho divergente da fonte atual.");
    expect(validateEvidence({ ...evidence, quote: "Texto inexistente." }, manifest)).toContain("Citação não encontrada literalmente na fonte atual.");
    expect(validateEvidence({ ...evidence, lineStart: 1, lineEnd: 1 }, manifest)).toContain("Citação fora do intervalo de linhas declarado.");
  });
  it("leaves old graph links unsupported instead of granting invented evidence", () => {
    const ledger = ledgerFromGraph(dataset, manifest);
    expect(ledger.assertions).toHaveLength(2);
    expect(auditLedger(ledger, manifest).verified).toBe(1);
    expect(auditLedger(ledger, manifest).unsupported + auditLedger(ledger, manifest).stale).toBe(1);
  });
  it("keeps a link's source evidence after explicit GraphDelta acceptance", () => {
    const next = applyGraphDelta(dataset, proposal, ["new-edge"], manifest);
    const link = next.links.find((item) => item.id === "ac");
    expect(link?.metadata?.secondMind).toMatchObject({ confidence: 0.84, epistemicStatus: "inferred", evidence: [evidence] });
    expect(evaluateAssertion(ledgerFromGraph(next, manifest).assertions.find((item) => item.assertionId === "link:ac")!, manifest).health).toBe("current");
    expect(ledgerFromProposal(proposal, manifest)[0].reviewStatus).toBe("proposed");
  });
});

describe("Knowledge Engine: graph reasoning", () => {
  it("respects direction and never invents missing edges", () => {
    const forward = findKnowledgePath(dataset, "a", "c");
    expect(forward.nodes).toEqual(["a", "b", "c"]);
    expect(forward.links).toEqual(["ab", "bc"]);
    expect(pathEvidenceCoverage(forward)).toBe(0);
    expect(findKnowledgePath(dataset, "c", "a").found).toBe(false);
    expect(findKnowledgePath(dataset, "a", "c", { requireEvidence: true, manifest, assertions: ledgerFromGraph(dataset, manifest).assertions }).found).toBe(false);
    expect(findKnowledgePath(dataset, "a", "b", { requireEvidence: true, manifest, assertions: ledgerFromGraph(dataset, manifest).assertions }).found).toBe(true);
  });
  it("reports community/bridge analyses without replacing declared clusters", () => {
    const topology = analyzeTopology(dataset);
    expect(topology.components).toHaveLength(1);
    expect(topology.bridges.map((edge) => edge.linkId)).toEqual(["ab", "bc"]);
    expect(topology.crossClusterLinks).toBe(1);
    expect(dataset.clusters.map((cluster) => cluster.id)).toEqual(["alpha", "beta"]);
  });
  it("suggests duplicate aliases and conflicts, not automatic mergers", () => {
    const twoSame: GraphDataset = { ...dataset, nodes: [...dataset.nodes, { id: "d", label: "Aurora", cluster: "beta" }] };
    expect(suggestEntityMerges(twoSame)).toEqual(expect.arrayContaining([expect.objectContaining({ leftId: "a", rightId: "d", requiresReview: true })]));
    const a = ledgerFromGraph(dataset, manifest).assertions[0];
    expect(detectAssertionContradictions([a, { ...a, assertionId: "negation", predicate: "not_" + a.predicate }])).toHaveLength(1);
  });
});

describe("Knowledge Engine: incremental and interoperable", () => {
  it("chunks privately, detects changed hashes, and retains stale assertions for review", () => {
    const before = chunkManifest(manifest, 256, 16);
    const after = chunkManifest({ ...manifest, sources: [{ ...manifest.sources[0], content: "# Origem\nAurora mudou suas relações.", fingerprint: "new-hash" }] }, 256, 16);
    expect(before.length).toBeGreaterThan(0);
    const plan = planIncrementalExtraction(before, after, ledgerFromGraph(dataset, manifest).assertions);
    expect(plan.changed.length).toBeGreaterThan(0);
    expect(plan.staleAssertionIds.length).toBeGreaterThan(0);
  });
  it("exports real Obsidian files, Canvas and GraphML without raw source text", async () => {
    const exported = buildObsidianVaultExport(dataset, ledgerFromGraph(dataset, manifest));
    expect(exported.canvas.nodes).toHaveLength(3);
    expect(exported.canvas.edges).toHaveLength(2);
    expect(exported.files["knowledge-graph.canvas"]).toContain("fromNode");
    expect(exported.files["graph.graphml"]).toContain('<graphml xmlns=');
    expect(exportGraphML(dataset)).toContain('source="a"');
    const zip = createLocalZip(exported.files);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(JSON.stringify(exported.files)).not.toContain("Aurora apoia Boreal.");
  });
  it("previews untrusted Graphify JSON without changing GraphDataset", () => {
    const original = JSON.stringify(dataset);
    const preview = previewGraphifyImport({ nodes: [{ id: "x", label: "X" }, { id: "y", label: "Y" }], links: [{ source: "x", target: "y", type: "supports" }] });
    expect(preview.verified).toBe(false);
    expect(preview.links).toHaveLength(1);
    expect(() => previewGraphifyImport({ nodes: [{ id: "x" }], links: [{ source: "x", target: "bad" }] })).toThrow();
    expect(JSON.stringify(dataset)).toBe(original);
  });
  it("requires explicit authorization before bridge semantic extraction", async () => {
    const extractor = createBridgeSemanticExtractor({ endpoint: "http://127.0.0.1:8088", explicitlyAuthorized: false });
    await expect(extractor.extract(chunkManifest(manifest), { dataset, manifest, maxAssertions: 5 })).rejects.toThrow(/autorização explícita/);
  });
});

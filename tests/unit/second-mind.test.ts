import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import minimalDataset from "../fixtures/valid/minimal-v1.1.json";
import sourceManifestSchema from "../../schema/source-manifest.schema.json";
import graphDeltaProposalSchema from "../../schema/graph-delta-proposal.schema.json";
import queryPacketSchema from "../../schema/query-packet.schema.json";
import queryAnswerSchema from "../../schema/query-answer.schema.json";
import historySnapshotSchema from "../../schema/history-snapshot.schema.json";
import graphDatasetSchema from "../../schema/graph-dataset.schema.json";
import type { GraphDataset, RuntimeGraph } from "../../src/core/types";
import { projectRuntimeGraph } from "../../src/core/view-projection";
import { GraphStore } from "../../src/data/graph-store";
import { buildEvidencePacket, parseImportedAnswer } from "../../src/second-mind/query";
import { createHistorySnapshot, datasetStateHash, diffDatasets } from "../../src/second-mind/history";
import { buildSourceManifest, diffManifests, normalizeVaultPath, VAULT_LIMITS, type MarkdownFileInput } from "../../src/second-mind/markdown";
import { applyGraphDelta, buildSourceMapDataset, compileMarkdownDeterministically, validateProposal } from "../../src/second-mind/proposals";
import { listHistorySnapshots, saveHistorySnapshot } from "../../src/second-mind/persistence";
import { buildWritebackExport, createWritebackProposal } from "../../src/second-mind/writeback";
import type { GraphDeltaOperation, GraphDeltaProposal } from "../../src/second-mind/types";

interface TestFile extends MarkdownFileInput { content: string }

function file(name: string, content: string, path = name, size = new TextEncoder().encode(content).byteLength): TestFile {
  return { name, content, size, webkitRelativePath: path, lastModified: 1_750_000_000_000, async text() { return content; } };
}

async function fixtureFiles() {
  const root = new URL("../fixtures/markdown-vault/", import.meta.url);
  const paths = ["README.md", "notes/concepts.md", "notes/copy.md"];
  return Promise.all(paths.map(async (path) => file(path.split("/").at(-1)!, await readFile(new URL(path, root), "utf8"), path)));
}

async function fixtureManifest() {
  return (await buildSourceManifest(await fixtureFiles())).manifest;
}

function dataset(): GraphDataset { return structuredClone(minimalDataset) as GraphDataset; }

describe("Second Mind local source pipeline", () => {
  it("ingests selected Markdown files, keeps provenance, resolves anchors and exposes unresolved links", async () => {
    const result = await buildSourceManifest(await fixtureFiles());
    const readme = result.manifest.sources.find((source) => source.path === "README.md")!;
    expect(readme.title).toBe("Evidence-first graph");
    expect(readme.tags).toEqual(["governance", "knowledge", "second-mind"]);
    expect(readme.headings.map((heading) => heading.anchor)).toEqual(["overview", "evidence-first", "evidence-first-2"]);
    expect(readme.links.find((link) => link.target === "notes/concepts")?.resolution).toBe("resolved");
    expect(readme.links.find((link) => link.target === "notes/concepts")?.fromAnchor).toBe("evidence-first");
    expect(readme.links.find((link) => link.target === "Missing note")?.resolution).toBe("missing");
    expect(result.manifest.capabilities.directWrite).toBe(false);
    expect(result.manifest.sources.every((source) => source.sourceId.startsWith("source:"))).toBe(true);
    expect(buildSourceMapDataset(result.manifest).meta.id).toBe(buildSourceMapDataset((await buildSourceManifest(await fixtureFiles(), result.manifest)).manifest).meta.id);
  });

  it("blocks unsafe paths, duplicate paths, and input size overruns", async () => {
    expect(() => normalizeVaultPath("../secrets.md")).toThrow(/inseguro/);
    expect(() => normalizeVaultPath("/absolute.md")).toThrow(/inseguro/);
    expect(() => normalizeVaultPath("notes.txt")).toThrow(/Markdown/);
    await expect(buildSourceManifest([file("a.md", "x"), file("a.md", "y")])).rejects.toThrow(/duplicado/);
    await expect(buildSourceManifest([file("large.md", "x", "large.md", VAULT_LIMITS.fileBytes + 1)])).rejects.toThrow(/5 MiB/);
  });

  it("reports add, modify, remove, unique rename and ambiguous identical content", async () => {
    const oldManifest = (await buildSourceManifest([file("a.md", "# Same\ncontent"), file("gone.md", "# Gone")])).manifest;
    const changed = await buildSourceManifest([file("a.md", "# Same\nchanged"), file("new.md", "# New")], oldManifest);
    expect(changed.diff.modified).toBe(1);
    expect(changed.diff.added).toBe(1);
    expect(changed.diff.removed).toBe(1);
    const renamed = await buildSourceManifest([file("renamed.md", "# Same\ncontent")], { ...oldManifest, sources: [oldManifest.sources[0]] });
    expect(renamed.diff.renamed).toBe(1);
    const duplicates = await buildSourceManifest([file("one.md", "same"), file("two.md", "same")]).then((value) => value.manifest);
    const ambiguous = diffManifests(duplicates, (await buildSourceManifest([file("three.md", "same")])).manifest);
    expect(ambiguous.ambiguous).toBeGreaterThan(0);
    expect(ambiguous.renamed).toBe(0);
  });

  it("builds a source map and a reviewable, evidence-bound proposal without mutating canonical state", async () => {
    const manifest = await fixtureManifest();
    const base = dataset();
    const before = JSON.stringify(base);
    const sourceMap = buildSourceMapDataset(manifest);
    expect(sourceMap.nodes.length).toBe(manifest.sources.length);
    expect(sourceMap.links.some((link) => link.type === "wikilink")).toBe(true);
    const proposal = compileMarkdownDeterministically(base, manifest);
    expect(proposal.operations.length).toBeGreaterThan(0);
    const proposedLinks = proposal.operations.filter((operation) => operation.kind === "add-link");
    expect(proposedLinks).toHaveLength(1);
    expect(validateProposal(proposal, base, manifest).valid).toBe(true);
    const tampered = structuredClone(proposal);
    tampered.operations[0].evidence[0].quote = "fabricated evidence";
    expect(validateProposal(tampered, base, manifest).errors.join(" ")).toMatch(/não foi encontrado/);
    const injected = structuredClone(proposal) as GraphDeltaProposal & { operations: Array<GraphDeltaOperation & { unexpected?: string }> };
    injected.operations[0].unexpected = "ignored payload";
    expect(validateProposal(injected, base, manifest).errors.join(" ")).toMatch(/campo de operação não suportado/);
    expect(validateProposal(proposal, base).errors.join(" ")).toMatch(/manifesto/);
    const next = applyGraphDelta(base, proposal, proposal.operations.map((operation) => operation.operationId), manifest);
    expect(next.nodes.length).toBeGreaterThan(base.nodes.length);
    expect(JSON.stringify(base)).toBe(before);
    const store = new GraphStore(base);
    store.commitDataset(next);
    expect(store.getDataset().nodes.length).toBe(next.nodes.length);
    store.undo();
    expect(store.getDataset().nodes.length).toBe(base.nodes.length);
    expect(store.canRedo()).toBe(true);
  });

  it("validates every versioned Second Mind sidecar schema", async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.addSchema(graphDatasetSchema);
    const validators = [sourceManifestSchema, graphDeltaProposalSchema, queryPacketSchema, queryAnswerSchema, historySnapshotSchema].map((schema) => ajv.compile(schema));
    const manifest = await fixtureManifest();
    const base = dataset();
    const proposal = compileMarkdownDeterministically(base, manifest);
    const packet = buildEvidencePacket(buildSourceMapDataset(manifest), manifest, "evidence");
    const answer = { answer: "Evidence is local.", nodeIds: packet.nodes.slice(0, 1).map((node) => node.nodeId), sourceRefs: packet.sources.slice(0, 1).map((source) => ({ sourceId: source.sourceId, path: source.path })) };
    const snapshot = createHistorySnapshot(base, { reason: "schema fixture" });
    const examples = [manifest, proposal, packet, answer, snapshot];
    validators.forEach((validate, index) => expect(validate(examples[index]), JSON.stringify(validate.errors)).toBe(true));
  });

  it("builds bounded evidence packets and rejects answer citations outside the packet", async () => {
    const manifest = await fixtureManifest();
    const sourceMap = buildSourceMapDataset(manifest);
    const packet = buildEvidencePacket(sourceMap, manifest, "evidence proposal");
    expect(packet.nodes.length).toBeGreaterThan(0);
    expect(packet.sources.some((source) => source.path === "README.md")).toBe(true);
    const answer = { answer: "The source says proposals remain provisional.", nodeIds: [packet.nodes[0].nodeId], sourceRefs: [{ sourceId: packet.sources[0].sourceId, path: packet.sources[0].path }] };
    expect(parseImportedAnswer(JSON.stringify(answer), packet)).toEqual(answer);
    expect(() => parseImportedAnswer(JSON.stringify({ ...answer, nodeIds: ["outside"] }), packet)).toThrow(/fora do pacote/);
    expect(() => parseImportedAnswer("null", packet)).toThrow(/objeto JSON/);
  });

  it("keeps semantic history independent of runtime positions and diffs canonical content", () => {
    const before = dataset();
    const moved = structuredClone(before);
    moved.nodes[0].position = { x: 999, y: -3, z: 42 };
    expect(datasetStateHash(before)).toBe(datasetStateHash(moved));
    const changed = structuredClone(moved);
    changed.nodes[0].label = "Changed";
    expect(diffDatasets(before, changed).nodes.changed).toEqual(["n1"]);
    const axisChanged = structuredClone(before);
    axisChanged.layout = { axes: { enabled: true, x: { enabled: true, source: "cluster", label: "X" }, y: { enabled: true, source: "field", field: "level", label: "Y" }, z: { enabled: true, source: "degree", label: "Centrality" } } };
    expect(datasetStateHash(axisChanged)).not.toBe(datasetStateHash(before));
  });

  it("projects to 2D without mutating the graph or losing semantic Z", () => {
    const graph: RuntimeGraph = {
      nodes: [{ id: "n1", label: "One", cluster: "root", semanticTarget: { x: 3, y: 4, z: 55 }, x: 3, y: 4, z: 55 }],
      links: [],
    };
    const original = structuredClone(graph);
    const view = projectRuntimeGraph(graph, "2d");
    expect(view.nodes[0].z).toBe(0);
    expect(view.nodes[0].semanticZ).toBe(55);
    expect(view.nodes[0].semanticTarget?.z).toBe(0);
    expect(graph).toEqual(original);
    expect(projectRuntimeGraph(graph, "3d")).toBe(graph);
  });

  it("exports writeback as an unapplied patch and persists bounded local history fallback", async () => {
    const manifest = await fixtureManifest();
    const source = buildSourceMapDataset(manifest).nodes[0];
    const proposal = createWritebackProposal(source, manifest);
    const exported = buildWritebackExport(proposal);
    expect(exported.directWritePerformed).toBe(false);
    expect(exported.requiresHumanApplication).toBe(true);
    expect(proposal.capability).toBe("patch-export-only");

    const memory = new Map<string, string>();
    const storage = {
      get length() { return memory.size; },
      clear() { memory.clear(); },
      getItem(key: string) { return memory.get(key) ?? null; },
      key(index: number) { return [...memory.keys()][index] ?? null; },
      removeItem(key: string) { memory.delete(key); },
      setItem(key: string, value: string) { memory.set(key, value); },
    };
    vi.stubGlobal("localStorage", storage as unknown as Storage);
    try {
      const old = createHistorySnapshot(dataset(), { reason: "old", createdAt: "2026-01-01T00:00:00.000Z" });
      const latest = createHistorySnapshot(dataset(), { reason: "new", createdAt: "2026-01-02T00:00:00.000Z" });
      await saveHistorySnapshot(old, 1);
      await saveHistorySnapshot(latest, 1);
      expect(await listHistorySnapshots("minimal")).toHaveLength(1);
      expect((await listHistorySnapshots("minimal"))[0].snapshotId).toBe(latest.snapshotId);
    } finally { vi.unstubAllGlobals(); }
  });
});

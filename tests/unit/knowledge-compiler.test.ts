import { describe, expect, it } from "vitest";
import type { GraphDataset } from "../../src/core/types";
import type { SourceManifest } from "../../src/second-mind/types";
import { ledgerFromGraph } from "../../src/knowledge-engine/ledger";
import { annotateWikiPage, commitWikiPlan, planWikiCompilation, restoreWikiRevision, wikiHealth } from "../../src/knowledge-engine/wiki";
import { createLocalOllamaEmbeddingProvider, searchManagedWiki } from "../../src/knowledge-engine/hybrid";
import { buildSessionContext, lintManagedWiki } from "../../src/knowledge-engine/resume";
import { exportManagedWikiVault, previewCanvas, previewManagedNoteRoundTrip } from "../../src/knowledge-engine/wiki-interop";
import { makeReadOnlySnapshot, validatePortableSnapshot } from "../../src/knowledge-engine/portable";
import { recordTemporalObservation, summarizeTemporalObservations } from "../../src/knowledge-engine/chronology";

const timestamp = "2026-11-06T18:00:00.000Z";
const citation = { sourceId: "source:seed.md", path: "seed.md", fingerprint: "sha256-valid-123456789", quote: "Aurora financia Boreal.", derivation: "explicit" as const };
const manifest: SourceManifest = {
  manifestVersion: "1.0", adapter: "markdown-vault", vaultId: "wiki-synthetic", createdAt: timestamp, fingerprint: "manifest-001",
  capabilities: { read: true, diff: true, stableIds: true, anchors: true, directWrite: false, patchExport: true, renameAwareness: true },
  sources: [{ sourceId: citation.sourceId, adapter: "markdown-vault", path: citation.path, title: "Seed", fingerprint: citation.fingerprint,
    content: "# Seed\nAurora financia Boreal.", byteLength: 32, headings: [{ depth: 1, text: "Seed", anchor: "seed" }],
    tags: [], frontmatter: {}, links: [], provenance: { kind: "user-selected-local-file", capturedAt: timestamp } }],
};
const dataset: GraphDataset = {
  schemaVersion: "1.1", meta: { id: "wiki-synthetic", title: "Corpus synthetic", version: "1.0" },
  clusters: [{ id: "c", label: "Test" }],
  nodes: [{ id: "a", label: "Aurora", cluster: "c" }, { id: "b", label: "Boreal", cluster: "c" }, { id: "c", label: "Isolada", cluster: "c" }],
  links: [{ id: "ab", source: "a", target: "b", type: "finance", directed: true, metadata: { relation: "financia", secondMind: { evidence: [citation], epistemicStatus: "explicit" } } }],
};
function firstWiki() {
  const plan = planWikiCompilation(dataset, manifest, ledgerFromGraph(dataset, manifest), undefined, timestamp);
  return commitWikiPlan(plan, plan.changes.map((p) => p.pageId), undefined, timestamp);
}

describe("Second Mind 0.4 governed cumulative wiki", () => {
  it("previews a reversible deterministic compilation without mutating graph or sources", () => {
    const original = JSON.stringify(dataset), sources = JSON.stringify(manifest);
    const plan = planWikiCompilation(dataset, manifest, ledgerFromGraph(dataset, manifest), undefined, timestamp);
    expect(plan.errors).toEqual([]);
    expect(plan.changes.map((c) => c.pageId)).toEqual(["wiki:a", "wiki:b", "wiki:c"]);
    expect(JSON.stringify(dataset)).toBe(original);
    expect(JSON.stringify(manifest)).toBe(sources);
    expect(plan.changes[0].after.body).toContain("financia");
    expect(plan.changes[0].after.status).toBe("sourced");
    expect(plan.changes[2].after.status).toBe("structural");
  });
  it("supports selective acceptance, idempotent recompilation and stable IDs", () => {
    const plan = planWikiCompilation(dataset, manifest, ledgerFromGraph(dataset, manifest), undefined, timestamp);
    const draft = commitWikiPlan(plan, ["wiki:a"], undefined, timestamp);
    expect(draft.pages.map((x) => x.pageId)).toEqual(["wiki:a"]);
    expect(draft.revision).toBe(1);
    const next = planWikiCompilation(dataset, manifest, ledgerFromGraph(dataset, manifest), draft, timestamp);
    expect(next.changes.map((x) => x.pageId)).toEqual(["wiki:b", "wiki:c"]);
    expect(next.unchanged).toContain("wiki:a");
    expect(() => commitWikiPlan(next, ["wiki:b"], { ...draft, revision: 2 })).toThrow(/Snapshot alterado/);
    expect(() => commitWikiPlan(next, ["wiki:z"], draft)).toThrow(/inválida/);
  });
  it("preserves human annotation through compilation and undoes via new revision", () => {
    const wiki = firstWiki();
    const annotated = annotateWikiPage(wiki, "wiki:a", "Nota de autora, não instrução à engine.", timestamp);
    expect(annotated.pages.find((x) => x.pageId === "wiki:a")?.authorNote).toMatch(/Nota de autora/);
    const plan = planWikiCompilation(dataset, manifest, ledgerFromGraph(dataset, manifest), annotated, timestamp);
    expect(plan.changes).toHaveLength(0);
    const restored = restoreWikiRevision(annotated, wiki.revision, timestamp);
    expect(restored.revision).toBe(annotated.revision + 1);
    expect(restored.pages.find((x) => x.pageId === "wiki:a")?.authorNote).toBeUndefined();
    expect(restored.log.at(-1)?.action).toBe("restored");
  });
  it("flags stale sources rather than silently deleting sourced knowledge", () => {
    const wiki = firstWiki();
    const changed: SourceManifest = { ...manifest, fingerprint: "manifest-002", sources: [{ ...manifest.sources[0], content: "# Seed\nAurora revisou a posição.", fingerprint: "sha256-new-valid" }] };
    const plan = planWikiCompilation(dataset, changed, ledgerFromGraph(dataset, changed), wiki, timestamp);
    expect(plan.changes.find((item) => item.pageId === "wiki:a")?.action).toBe("stale");
    expect(plan.changes.find((item) => item.pageId === "wiki:a")?.after.status).toBe("stale");
    expect(wikiHealth(wiki, changed).staleIds).toContain("wiki:a");
    expect(lintManagedWiki(wiki, changed).some((issue) => issue.severity === "error")).toBe(true);
    const accepted = commitWikiPlan(plan, ["wiki:a"], wiki, timestamp);
    expect(accepted.pages.find((p) => p.pageId === "wiki:b")?.citations.length).toBe(1);
  });
  it("distinguishes observedAt from human-entered effective dates and restores its own timeline", () => {
    const wiki = firstWiki();
    const observation = recordTemporalObservation(wiki, ledgerFromGraph(dataset, manifest).assertions, {
      assertionId: "link:ab", validFrom: "2025-01-01", validUntil: "2026-04-01",
      interpretation: "superseded", note: "Revisor marcou término de validade, sem modificar a fonte.",
    }, timestamp);
    const event = observation.temporal?.[0];
    expect(event?.observedAt).toBe(timestamp);
    expect(event?.validFrom).toBe("2025-01-01");
    expect(event?.interpretation).toBe("superseded");
    expect(summarizeTemporalObservations(observation)).toHaveLength(1);
    const restored = restoreWikiRevision(observation, wiki.revision, timestamp);
    expect(restored.temporal).toEqual([]);
    expect(restored.revision).toBe(observation.revision + 1);
    expect(() => recordTemporalObservation(wiki, ledgerFromGraph(dataset, manifest).assertions, {
      assertionId: "link:ab", validFrom: "2026-04-01", validUntil: "2025-01-01",
      interpretation: "confirmed", note: "Data invertida.",
    }, timestamp)).toThrow(/Período efetivo inválido/);
    expect(() => recordTemporalObservation(wiki, ledgerFromGraph(dataset, manifest).assertions, {
      assertionId: "fake", interpretation: "confirmed", note: "Sem direito de anotação.",
    }, timestamp)).toThrow(/canônicas aceitas/);
  });
  it("refuses mismatched dataset authority", () => {
    const ledger = ledgerFromGraph(dataset, manifest);
    expect(planWikiCompilation(dataset, manifest, { ...ledger, datasetId: "different" }).errors).toContain("O ledger não pertence ao dataset.");
  });
});

describe("Second Mind 0.4 local search, continuation and interop", () => {
  it("searches with BM25 without treating disconnected documents as evidence", () => {
    const wiki = firstWiki();
    const hits = searchManagedWiki(wiki, "Aurora financia", { maxResults: 4 });
    expect(hits[0].title).toBe("Aurora");
    expect(hits[0].bm25).toBeGreaterThan(0);
    expect(searchManagedWiki(wiki, "xyznonexistentphrase")).toHaveLength(0);
  });
  it("accepts optional vectors only when supplied, and rejects nonlocal embeddings", async () => {
    const wiki = firstWiki();
    const vectors = { dimensions: 2, model: "synthetic", queryVector: [1, 0], documentVectors: { "wiki:b": [1, 0] } };
    expect(searchManagedWiki(wiki, "Aurora", { vectors }).find((item) => item.pageId === "wiki:b")?.semantic).toBe(1);
    expect(() => createLocalOllamaEmbeddingProvider("https://remote.example")).toThrow(/estritamente local/);
    await expect(createLocalOllamaEmbeddingProvider("http://127.0.0.1:11434").embed(["Aurora"], { consent: false, model: "local-test" })).rejects.toThrow(/autorização explícita/);
  });
  it("creates bounded context packets from compiled pages with provenance", () => {
    const wiki = firstWiki();
    const packet = buildSessionContext(wiki, manifest, "Aurora", 400);
    expect(packet.wikiRevision).toBe(wiki.revision);
    expect(packet.pages[0].citations).toContain("seed.md (sha256-valid)");
    expect(packet.estimatedTokens).toBeLessThanOrEqual(400);
    expect(packet.warnings.some((item) => item.includes("instruções"))).toBe(true);
  });
  it("exports schema-valid Obsidian Canvas/Markdown and rejects bad imported Canvas", () => {
    const wiki = firstWiki();
    const bundle = exportManagedWikiVault(wiki);
    const canvas = JSON.parse(bundle.files["knowledge.canvas"]) as unknown;
    const preview = previewCanvas(canvas, Object.keys(bundle.files));
    expect(preview.valid).toBe(true);
    expect(preview.edges).toBe(1);
    expect(preview.warnings).toEqual([]);
    const auroraFile = bundle.identityMap["wiki:a"];
    const aurora = bundle.files[auroraFile];
    const borealStem = bundle.identityMap["wiki:b"].slice(6, -3);
    expect(aurora).toContain("[[" + borealStem + "|Boreal]]");
    expect(aurora).not.toContain("[[b|Boreal]]");
    expect(Object.keys(bundle.files).some((name) => name.endsWith(".md"))).toBe(true);
    expect(bundle.files["README.md"]).not.toContain("Aurora financia Boreal.");
    expect(() => previewCanvas({ nodes: [{ id: "x", type: "file", file: "../private", x: 0, y: 0, width: 10, height: 10 }], edges: [] }, [])).toThrow(/inseguro/);
  });
  it("round-trips only the human-owned part of Obsidian Markdown with explicit revision control", () => {
    const wiki = firstWiki();
    const vault = exportManagedWikiVault(wiki);
    const file = vault.files[vault.identityMap["wiki:a"]];
    const edited = file + "\n## Nota humana\nMinha observação revisada.\n";
    const preview = previewManagedNoteRoundTrip(wiki, edited);
    expect(preview.afterNote).toBe("Minha observação revisada.");
    expect(preview.pageId).toBe("wiki:a");
    expect(preview.sourceBodyUnchanged).toBe(true);
    expect(() => previewManagedNoteRoundTrip(wiki, edited.replace("Aurora financia", "Aurora NÃO financia"))).toThrow(/corpo gerado/);
    expect(() => previewManagedNoteRoundTrip(wiki, edited.replace("wiki_revision: 1", "wiki_revision: 99"))).toThrow(/Revisão/);
  });
  it("exports an intentionally reduced, read-only MCP snapshot", () => {
    const snapshot = makeReadOnlySnapshot(firstWiki());
    expect(validatePortableSnapshot(snapshot).pages).toHaveLength(3);
    expect(snapshot.pages[0].citations[0].quote).toContain("Aurora");
    expect(JSON.stringify(snapshot)).not.toContain('"history"');
    expect(() => validatePortableSnapshot({ ...snapshot, snapshotVersion: "9.9" })).toThrow();
  });
});

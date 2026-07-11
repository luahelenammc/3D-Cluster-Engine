import { describe, expect, it } from "vitest";
import { clusterColor, seededPoint } from "../../src/core/colors";
import { computeSemanticTargets, resolveSemanticAxes } from "../../src/core/spatial";
import type { GraphDataset } from "../../src/core/types";
import { importFiles, serializeDataset } from "../../src/data/adapters";
import { PERFORMANCE_ENVELOPE } from "../../src/data/contract";
import { GraphStore } from "../../src/data/graph-store";
import { normalizeDataset } from "../../src/data/normalize";
import { validateDataset } from "../../src/data/validate";
import minimalFixture from "../fixtures/valid/minimal-v1.1.json";
import fullFixture from "../fixtures/valid/full-v1.1.json";
import legacyFixture from "../fixtures/legacy/v1.0-migrates.json";
import orphanFixture from "../fixtures/invalid/orphan-link-v1.1.json";
import missingLinkIdFixture from "../fixtures/invalid/missing-link-id-v1.1.json";
import duplicateIdsFixture from "../fixtures/invalid/duplicate-ids-v1.1.json";

const fixture = fullFixture as GraphDataset;

function jsonFile(name: string, value: unknown) {
  return new File([JSON.stringify(value)], name, { type: "application/json" });
}

function textFile(name: string, value: string) {
  return new File([value], name, { type: "text/plain" });
}

describe("canonical contract 1.1", () => {
  it("accepts minimal and full canonical fixtures", () => {
    expect(validateDataset(minimalFixture).valid).toBe(true);
    expect(validateDataset(fullFixture).valid).toBe(true);
  });

  it("rejects orphan references", () => {
    const result = validateDataset(orphanFixture);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("inexistente"))).toBe(true);
  });

  it("requires stable link ids", () => {
    const result = validateDataset(missingLinkIdFixture);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path.includes("links"))).toBe(true);
  });

  it("rejects duplicate cluster, node and link ids", () => {
    const result = validateDataset(duplicateIdsFixture);
    expect(result.valid).toBe(false);
    expect(result.issues.filter((issue) => issue.message.includes("duplicado")).length).toBeGreaterThanOrEqual(3);
  });

  it("rejects undeclared top-level properties", () => {
    expect(validateDataset({ ...minimalFixture, surprise: true }).valid).toBe(false);
  });
});

describe("normalization and migration", () => {
  it("migrates v1.0 into strict v1.1", () => {
    const result = normalizeDataset(legacyFixture);
    expect(result.dataset.schemaVersion).toBe("1.1");
    expect(result.dataset.clusters.map((cluster) => cluster.id)).toEqual(["a", "b"]);
    expect(result.dataset.links[0].id).toMatch(/^link-/);
    expect(result.dataset.layout?.axes?.y.field).toBe("level");
    expect(result.migrations.some((migration) => migration.includes("schemaVersion"))).toBe(true);
    expect(result.migrations.some((migration) => migration.includes("layout.axis"))).toBe(true);
  });

  it("generates deterministic link ids across repeated migrations", () => {
    const first = normalizeDataset(legacyFixture).dataset.links[0].id;
    const second = normalizeDataset(legacyFixture).dataset.links[0].id;
    expect(first).toBe(second);
  });

  it("does not silently repair malformed canonical 1.1", () => {
    expect(() => normalizeDataset(missingLinkIdFixture)).toThrow();
  });
});

describe("adapter roundtrips", () => {
  it("preserves canonical JSON through serialize and reimport", async () => {
    const serialized = serializeDataset(fixture);
    const imported = await importFiles([textFile("dataset.json", serialized)]);
    expect(imported.dataset).toEqual(fixture);
  });

  it("migrates a legacy canonical file", async () => {
    const imported = await importFiles([jsonFile("legacy.json", legacyFixture)]);
    expect(imported.dataset.schemaVersion).toBe("1.1");
    expect(imported.migrations.length).toBeGreaterThan(0);
  });

  it("preserves split sidecars", async () => {
    const imported = await importFiles([
      jsonFile("nodes.json", fixture.nodes),
      jsonFile("links.json", fixture.links),
      jsonFile("clusters.json", fixture.clusters),
      jsonFile("meta.json", fixture.meta),
      jsonFile("layout.json", fixture.layout),
      jsonFile("visual.json", fixture.visual),
      jsonFile("extensions.json", fixture.extensions),
    ]);
    expect(imported.dataset.meta).toEqual(fixture.meta);
    expect(imported.dataset.layout).toEqual(fixture.layout);
    expect(imported.dataset.visual).toEqual(fixture.visual);
    expect(imported.dataset.extensions).toEqual(fixture.extensions);
  });

  it("parses typed and nested CSV metadata", async () => {
    const nodes = [
      "id,label,cluster,value,level,tags,meta.maturity,meta.flags.enabled",
      "n1,One,a,3,1,first|seed,0.5,true",
      "n2,Two,a,4,2,second,1,false",
    ].join("\n");
    const links = [
      "id,source,target,type,weight,directed,meta.confidence",
      ",n1,n2,supports,2,true,0.9",
    ].join("\n");
    const imported = await importFiles([textFile("nodes.csv", nodes), textFile("links.csv", links)]);
    expect(imported.dataset.nodes[0].metadata).toEqual({ maturity: 0.5, flags: { enabled: true } });
    expect(imported.dataset.nodes[0].tags).toEqual(["first", "seed"]);
    expect(imported.dataset.links[0].metadata).toEqual({ confidence: 0.9 });
    expect(imported.dataset.links[0].id).toMatch(/^link-/);
  });
});

describe("deterministic presentation", () => {
  it("keeps cluster colors stable", () => expect(clusterColor("models")).toBe(clusterColor("models")));
  it("keeps seeded positions stable", () => expect(seededPoint("seed", "node", "cluster")).toEqual(seededPoint("seed", "node", "cluster")));
  it("computes stable semantic targets from all three axes", () => {
    const axes = resolveSemanticAxes(fixture.layout);
    const first = computeSemanticTargets(fixture.nodes, fixture.links, fixture.clusters, axes);
    const second = computeSemanticTargets(fixture.nodes, fixture.links, fixture.clusters, axes);
    expect(first).toEqual(second);
    expect(first.get("n1")).toBeDefined();
    expect(first.get("n2")).toBeDefined();
  });
});

describe("graph store", () => {
  it("does not expose renderer mutations to canonical data", () => {
    const store = new GraphStore(fixture);
    const runtime = store.getRuntimeSnapshot();
    runtime.nodes[0].label = "Mutated by renderer";
    runtime.links[0].source = runtime.nodes[1];
    expect(store.getDataset().nodes[0].label).toBe("One");
    expect(store.getDataset().links[0].source).toBe("n1");
  });

  it("edits, undoes and redoes", () => {
    const store = new GraphStore(fixture);
    store.updateNode("n1", { label: "Edited" });
    expect(store.getDataset().nodes[0].label).toBe("Edited");
    store.undo();
    expect(store.getDataset().nodes[0].label).toBe("One");
    store.redo();
    expect(store.getDataset().nodes[0].label).toBe("Edited");
  });

  it("bakes clean coordinates", () => {
    const store = new GraphStore(fixture);
    store.applyPositions({ n1: { x: 1, y: 2, z: 3 } });
    expect(store.getDataset().nodes[0].position).toEqual({ x: 1, y: 2, z: 3 });
    expect(store.getDataset().layout?.mode).toBe("baked");
  });

  it("refuses invalid replacements", () => {
    const store = new GraphStore(fixture);
    expect(() => store.replace(orphanFixture as GraphDataset)).toThrow();
  });
});

describe("performance envelope", () => {
  it("warns when the declared desktop envelope is exceeded", () => {
    const nodes = Array.from({ length: PERFORMANCE_ENVELOPE.desktopRecommended.nodes + 1 }, (_, index) => ({ id: `n${index}`, label: `N ${index}`, cluster: "a" }));
    const large: GraphDataset = { schemaVersion: "1.1", meta: { id: "large", title: "Large", version: "1.0.0" }, clusters: [{ id: "a", label: "A" }], nodes, links: [] };
    const result = validateDataset(large);
    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes("envelope desktop"))).toBe(true);
  });
});

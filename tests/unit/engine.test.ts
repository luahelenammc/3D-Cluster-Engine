import { describe, expect, it } from "vitest";
import { clusterColor, seededPoint } from "../../src/core/colors";
import { computeSemanticTargets, resolveSemanticAxes } from "../../src/core/spatial";
import type { GraphDataset } from "../../src/core/types";
import { GraphStore } from "../../src/data/graph-store";
import { validateDataset } from "../../src/data/validate";

const fixture: GraphDataset = {
  schemaVersion: "1.0",
  meta: { id: "test", title: "Test", version: "1.0.0" },
  clusters: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  nodes: [{ id: "n1", label: "One", cluster: "a", value: 2, level: 1 }, { id: "n2", label: "Two", cluster: "b", value: 4, level: 2 }],
  links: [{ id: "l1", source: "n1", target: "n2", directed: true }],
};

describe("canonical validation", () => {
  it("accepts a coherent dataset", () => expect(validateDataset(fixture).valid).toBe(true));
  it("reports orphan links", () => {
    const broken = structuredClone(fixture);
    broken.links[0].target = "missing";
    const result = validateDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("inexistente"))).toBe(true);
  });
  it("reports duplicate node ids", () => {
    const broken = structuredClone(fixture);
    broken.nodes.push({ ...broken.nodes[0] });
    expect(validateDataset(broken).valid).toBe(false);
  });
  it("warns when a semantic field has no numeric values", () => {
    const broken = structuredClone(fixture);
    broken.layout = {
      axes: {
        ...resolveSemanticAxes(),
        y: { ...resolveSemanticAxes().y, field: "metadata.missing" },
      },
    };
    const result = validateDataset(broken);
    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.path.includes("/layout/axes/y/field"))).toBe(true);
  });
});

describe("deterministic presentation", () => {
  it("keeps cluster colors stable", () => expect(clusterColor("models")).toBe(clusterColor("models")));
  it("keeps seeded positions stable for free-layout compatibility", () => expect(seededPoint("seed", "node", "cluster")).toEqual(seededPoint("seed", "node", "cluster")));
  it("maps the same dataset to the same semantic coordinates", () => {
    const axes = resolveSemanticAxes();
    const first = computeSemanticTargets(fixture.nodes, fixture.links, fixture.clusters || [], axes);
    const second = computeSemanticTargets(fixture.nodes, fixture.links, fixture.clusters || [], axes);
    expect(first).toEqual(second);
    expect(first.get("n1")?.x).toBeLessThan(first.get("n2")?.x || 0);
    expect(first.get("n1")?.y).toBeLessThan(first.get("n2")?.y || 0);
  });
});

describe("graph store", () => {
  it("does not expose renderer mutations to canonical data", () => {
    const store = new GraphStore(fixture);
    const runtime = store.getRuntimeSnapshot();
    runtime.nodes[0].label = "Mutated by renderer";
    expect(store.getDataset().nodes[0].label).toBe("One");
  });
  it("starts live nodes at semantic targets instead of random positions", () => {
    const store = new GraphStore(fixture);
    const runtime = store.getRuntimeSnapshot();
    expect(runtime.nodes[0].semanticTarget).toBeDefined();
    expect(runtime.nodes[0].x).toBe(runtime.nodes[0].semanticTarget?.x);
    expect(runtime.nodes[0].y).toBe(runtime.nodes[0].semanticTarget?.y);
    expect(runtime.nodes[0].z).toBe(runtime.nodes[0].semanticTarget?.z);
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
});

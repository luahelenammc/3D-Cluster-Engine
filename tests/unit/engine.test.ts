import { describe, expect, it } from "vitest";
import { clusterColor, seededPoint } from "../../src/core/colors";
import type { GraphDataset } from "../../src/core/types";
import { GraphStore } from "../../src/data/graph-store";
import { validateDataset } from "../../src/data/validate";

const fixture: GraphDataset = {
  schemaVersion: "1.0",
  meta: { id: "test", title: "Test", version: "1.0.0" },
  clusters: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  nodes: [{ id: "n1", label: "One", cluster: "a", value: 2 }, { id: "n2", label: "Two", cluster: "b", value: 4 }],
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
});

describe("deterministic presentation", () => {
  it("keeps cluster colors stable", () => expect(clusterColor("models")).toBe(clusterColor("models")));
  it("keeps seeded positions stable", () => expect(seededPoint("seed", "node", "cluster")).toEqual(seededPoint("seed", "node", "cluster")));
});

describe("graph store", () => {
  it("does not expose renderer mutations to canonical data", () => {
    const store = new GraphStore(fixture);
    const runtime = store.getRuntimeSnapshot();
    runtime.nodes[0].label = "Mutated by renderer";
    expect(store.getDataset().nodes[0].label).toBe("One");
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

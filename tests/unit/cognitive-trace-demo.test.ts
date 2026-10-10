import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GraphStore } from "../../src/data/graph-store";
import { validateDataset } from "../../src/data/validate";
import type { GraphDataset } from "../../src/core/types";

const demo = JSON.parse(readFileSync(new URL("../../public/datasets/cognitive-trace-demo/dataset.json", import.meta.url), "utf8")) as GraphDataset;

describe("synthetic cognitive trace dataset", () => {
  it("passes the unchanged canonical 1.1 validation and runtime snapshot", () => {
    const result = validateDataset(demo);
    expect(result.valid, result.issues.map((issue) => issue.message).join("; ")).toBe(true);
    expect(demo.schemaVersion).toBe("1.1");
    expect(new GraphStore(demo).getRuntimeSnapshot().nodes).toHaveLength(16);
  });

  it("keeps evidence explicitly synthetic and link endpoints grounded in the fixture", () => {
    const nodeIds = new Set(demo.nodes.map((node) => node.id));
    expect(demo.clusters).toHaveLength(5);
    expect(demo.links).toHaveLength(22);
    expect(demo.nodes.every((node) => node.metadata?.epistemicStatus === "synthetic")).toBe(true);
    expect(demo.links.every((link) => link.directed && typeof link.metadata?.relation === "string" && link.metadata?.evidence === "synthetic")).toBe(true);
    expect(demo.links.every((link) => nodeIds.has(link.source) && nodeIds.has(link.target))).toBe(true);
  });

  it("keeps proposal, gates, consequence and later memory distinct", () => {
    const edge = (a: string, b: string) => demo.links.some((link) => link.source === a && link.target === b);
    expect(edge("option-negotiate", "proposal")).toBe(true);
    expect(edge("proposal", "gate-authority")).toBe(true);
    expect(edge("gate-authority", "action")).toBe(true);
    expect(edge("action", "consequence")).toBe(true);
    expect(edge("consequence", "memory-new")).toBe(true);
    expect(edge("memory-new", "future-choice")).toBe(true);
    expect(demo.meta.description).toMatch(/Não contém dados da EVA-01/);
    expect(demo.meta.attribution?.join(" ")).toMatch(/Domingos Neto/);
  });
});

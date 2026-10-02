import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { GraphDataset } from "../../src/core/types";
import { GraphStore } from "../../src/data/graph-store";
import { validateDataset } from "../../src/data/validate";
import { projectRuntimeGraph } from "../../src/core/view-projection";
import { searchGraphNodes, visibleLabelIds } from "../../src/renderer/interaction";

const DATASETS = ["demo", "moon-projects-map", "politica", "acl"] as const;

describe("public datasets retain the 1.1 exploration contract", () => {
  it.each(DATASETS)("loads, searches, selects, labels and projects %s in both views", async (id) => {
    const raw = await readFile(new URL(`../../public/datasets/${id}/dataset.json`, import.meta.url), "utf8");
    const dataset = JSON.parse(raw) as GraphDataset;
    expect(dataset.schemaVersion).toBe("1.1");
    expect(validateDataset(dataset).valid).toBe(true);

    const store = new GraphStore(dataset);
    const graph = store.getRuntimeSnapshot();
    expect(graph.nodes.length).toBe(dataset.nodes.length);
    expect(graph.links.length).toBe(dataset.links.length);
    const target = dataset.nodes[0];
    expect(searchGraphNodes(dataset.nodes, target.label.slice(0, Math.min(8, target.label.length))).some((node) => node.id === target.id)).toBe(true);

    const labels = visibleLabelIds({ nodes: graph.nodes, links: graph.links, selectedId: target.id, inspectedId: null, hoveredId: null, draggedId: null, density: "essential", zoom: "far", viewMode: "3d" });
    expect(labels.has(target.id)).toBe(true);
    const view2d = projectRuntimeGraph(graph, "2d");
    expect(view2d.nodes).toHaveLength(dataset.nodes.length);
    expect(view2d.nodes.every((node) => node.z === 0)).toBe(true);
    expect(projectRuntimeGraph(graph, "3d")).toBe(graph);
    expect(store.getDataset()).toEqual(dataset);
  });
});

import { describe, expect, it } from "vitest";
import type { RuntimeNode } from "../../src/core/types";
import { activeNodeId, EMPTY_GRAPH_INTERACTION, labelZoomForDistance, reduceGraphInteraction, shouldOpenDetailsFromClick, visibleLabelIds } from "../../src/renderer/interaction";

const node = (id: string, value = 1): RuntimeNode => ({ id, label: id, cluster: "c", value });

describe("graph interaction contract", () => {
  it("keeps selection lightweight and inspection deliberate", () => {
    let state = reduceGraphInteraction(EMPTY_GRAPH_INTERACTION, { type: "select", nodeId: "a" });
    expect(state).toMatchObject({ selectedNodeId: "a", inspectedNodeId: null });
    state = reduceGraphInteraction(state, { type: "hover", nodeId: "b" });
    expect(activeNodeId(state)).toBe("a");
    state = reduceGraphInteraction(state, { type: "inspect", nodeId: "a" });
    state = reduceGraphInteraction(state, { type: "close-inspector" });
    expect(state).toMatchObject({ selectedNodeId: "a", inspectedNodeId: null });
  });

  it("preserves selection through drag and updates an already-open inspector", () => {
    let state = reduceGraphInteraction(EMPTY_GRAPH_INTERACTION, { type: "inspect", nodeId: "a" });
    state = reduceGraphInteraction(state, { type: "select", nodeId: "b" });
    expect(state).toMatchObject({ selectedNodeId: "b", inspectedNodeId: "b" });
    state = reduceGraphInteraction(state, { type: "drag-start", nodeId: "b" });
    expect(activeNodeId(state)).toBe("b");
    state = reduceGraphInteraction(state, { type: "drag-end" });
    expect(state).toMatchObject({ selectedNodeId: "b", inspectedNodeId: "b", draggedNodeId: null });
  });

  it("clears nodes hidden by a filter without leaving phantom selection", () => {
    const state = reduceGraphInteraction({ ...EMPTY_GRAPH_INTERACTION, selectedNodeId: "a", inspectedNodeId: "a" }, { type: "remove-hidden", visibleIds: new Set(["b"]) });
    expect(state).toMatchObject({ selectedNodeId: null, inspectedNodeId: null });
  });

  it("uses native double-click intent but rejects clicks following a drag", () => {
    expect(shouldOpenDetailsFromClick(1, 0, 1000)).toBe(false);
    expect(shouldOpenDetailsFromClick(2, 0, 1000)).toBe(true);
    expect(shouldOpenDetailsFromClick(2, 900, 1100)).toBe(false);
  });

  it("budgets labels by density/zoom and always includes the active node and its neighborhood", () => {
    const nodes = [node("a"), node("b"), ...Array.from({ length: 20 }, (_, index) => node(`n${index}`, 30 - index))];
    const options = { nodes, links: [{ source: "a", target: "b" }], selectedId: "a", inspectedId: null, hoveredId: null, draggedId: null, density: "essential" as const, zoom: "far" as const, viewMode: "3d" as const };
    const essential = visibleLabelIds(options);
    const more = visibleLabelIds({ ...options, density: "more", zoom: "close" });
    expect(essential.has("a")).toBe(true);
    expect(essential.has("b")).toBe(true);
    expect(essential.size).toBeLessThan(more.size);
  });

  it("uses semantic zoom thresholds without mutating graph state", () => {
    expect(labelZoomForDistance(500)).toBe("close");
    expect(labelZoomForDistance(900)).toBe("medium");
    expect(labelZoomForDistance(1600)).toBe("far");
  });
});

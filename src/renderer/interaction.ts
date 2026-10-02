import type { GraphNode, GraphViewMode, RuntimeNode } from "../core/types";

export type LabelDensity = "essential" | "context" | "more";
export type LabelZoom = "far" | "medium" | "close";

export interface GraphInteractionState {
  selectedNodeId: string | null;
  inspectedNodeId: string | null;
  hoveredNodeId: string | null;
  draggedNodeId: string | null;
}

export type GraphInteractionEvent =
  | { type: "select"; nodeId: string | null }
  | { type: "inspect"; nodeId: string }
  | { type: "close-inspector" }
  | { type: "hover"; nodeId: string | null }
  | { type: "drag-start"; nodeId: string }
  | { type: "drag-end" }
  | { type: "remove-hidden"; visibleIds: ReadonlySet<string> };

export const EMPTY_GRAPH_INTERACTION: GraphInteractionState = {
  selectedNodeId: null,
  inspectedNodeId: null,
  hoveredNodeId: null,
  draggedNodeId: null,
};

export function reduceGraphInteraction(state: GraphInteractionState, event: GraphInteractionEvent): GraphInteractionState {
  switch (event.type) {
    case "select":
      return {
        ...state,
        selectedNodeId: event.nodeId,
        inspectedNodeId: event.nodeId === null ? null : state.inspectedNodeId ? event.nodeId : null,
        draggedNodeId: null,
      };
    case "inspect":
      return { ...state, selectedNodeId: event.nodeId, inspectedNodeId: event.nodeId };
    case "close-inspector":
      return { ...state, inspectedNodeId: null };
    case "hover":
      return { ...state, hoveredNodeId: event.nodeId };
    case "drag-start":
      return { ...state, selectedNodeId: event.nodeId, inspectedNodeId: state.inspectedNodeId ? event.nodeId : null, draggedNodeId: event.nodeId };
    case "drag-end":
      return { ...state, draggedNodeId: null };
    case "remove-hidden": {
      const selectedVisible = state.selectedNodeId !== null && event.visibleIds.has(state.selectedNodeId);
      const inspectedVisible = state.inspectedNodeId !== null && event.visibleIds.has(state.inspectedNodeId);
      return {
        ...state,
        selectedNodeId: selectedVisible ? state.selectedNodeId : null,
        inspectedNodeId: selectedVisible && inspectedVisible ? state.inspectedNodeId : null,
        hoveredNodeId: state.hoveredNodeId && event.visibleIds.has(state.hoveredNodeId) ? state.hoveredNodeId : null,
        draggedNodeId: state.draggedNodeId && event.visibleIds.has(state.draggedNodeId) ? state.draggedNodeId : null,
      };
    }
  }
}

export function activeNodeId(state: GraphInteractionState): string | null {
  return state.draggedNodeId || state.inspectedNodeId || state.selectedNodeId || state.hoveredNodeId;
}

export function searchGraphNodes(nodes: GraphNode[], query: string, limit = 8): GraphNode[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return nodes.filter((node) => [node.id, node.label, node.cluster, ...(node.tags || []), JSON.stringify(node.metadata || {})].join(" ").toLocaleLowerCase().includes(needle)).slice(0, limit);
}

export function shouldOpenDetailsFromClick(eventDetail: number, lastDragAt: number, now: number): boolean {
  return eventDetail >= 2 && now - lastDragAt > 500;
}

export function labelZoomForDistance(distance: number): LabelZoom {
  if (distance <= 620) return "close";
  if (distance <= 1250) return "medium";
  return "far";
}

const LABEL_BUDGETS: Record<LabelDensity, Record<LabelZoom, number>> = {
  essential: { far: 3, medium: 5, close: 7 },
  context: { far: 6, medium: 12, close: 18 },
  more: { far: 10, medium: 20, close: 32 },
};

export function visibleLabelIds(options: {
  nodes: RuntimeNode[];
  links: Array<{ source: string | RuntimeNode; target: string | RuntimeNode }>;
  selectedId: string | null;
  inspectedId: string | null;
  hoveredId: string | null;
  draggedId: string | null;
  density: LabelDensity;
  zoom: LabelZoom;
  viewMode: GraphViewMode;
}): Set<string> {
  const { nodes, links, selectedId, inspectedId, hoveredId, draggedId, density, zoom, viewMode } = options;
  const activeId = draggedId || inspectedId || selectedId || hoveredId;
  const neighbors = new Set<string>();
  const idOf = (endpoint: string | RuntimeNode) => typeof endpoint === "string" ? endpoint : endpoint.id;
  if (activeId) {
    for (const link of links) {
      const source = idOf(link.source);
      const target = idOf(link.target);
      if (source === activeId) neighbors.add(target);
      if (target === activeId) neighbors.add(source);
    }
  }

  const values = nodes.map((node) => Number(node.value || 0)).sort((a, b) => a - b);
  const highValue = values[Math.max(0, Math.floor(values.length * 0.82))] || 0;
  const budget = Math.ceil(LABEL_BUDGETS[density][zoom] * (viewMode === "2d" ? 1.3 : 1));
  const priority = (node: RuntimeNode) => {
    if (node.id === draggedId) return 0;
    if (node.id === inspectedId) return 1;
    if (node.id === selectedId) return 2;
    if (node.id === hoveredId) return 3;
    if (neighbors.has(node.id)) return 4;
    if (Number(node.value || 0) >= highValue && highValue > 0) return 5;
    return 6;
  };
  const ordered = [...nodes].sort((a, b) => priority(a) - priority(b) || Number(b.value || 0) - Number(a.value || 0) || a.id.localeCompare(b.id));
  const visible = new Set(ordered.slice(0, budget).map((node) => node.id));
  if (activeId && nodes.some((node) => node.id === activeId)) visible.add(activeId);
  return visible;
}

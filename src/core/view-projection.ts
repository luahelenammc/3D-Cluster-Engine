import type { GraphViewMode, RuntimeGraph } from "./types";

/** Returns a renderer-only projection. The canonical GraphStore graph is never changed. */
export function projectRuntimeGraph(graph: RuntimeGraph, mode: GraphViewMode): RuntimeGraph {
  if (mode === "3d") return graph;
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      semanticZ: node.semanticTarget?.z ?? node.semanticZ ?? node.z ?? node.position?.z ?? 0,
      semanticTarget: node.semanticTarget ? { ...node.semanticTarget, z: 0 } : undefined,
      z: 0,
      vz: 0,
      fz: node.pinned ? 0 : undefined,
    })),
    links: graph.links.map((link) => ({
      ...link,
      source: typeof link.source === "string" ? link.source : { ...link.source, z: 0 },
      target: typeof link.target === "string" ? link.target : { ...link.target, z: 0 },
    })),
  };
}

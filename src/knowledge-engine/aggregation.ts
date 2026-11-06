import type { ClusterDefinition, RuntimeGraph, RuntimeLink, RuntimeNode } from "../core/types";

export interface AggregateProjection {
  graph: RuntimeGraph;
  membership: Record<string, string[]>;
  originalNodes: number;
  originalLinks: number;
  aggregated: boolean;
}

/** Ephemeral cluster-level LOD. Canonical IDs, positions and user ontology remain untouched. */
export function aggregateClusterProjection(graph: RuntimeGraph, clusters: ClusterDefinition[]): AggregateProjection {
  const grouped = new Map<string, RuntimeNode[]>();
  for (const node of graph.nodes) grouped.set(node.cluster, [...(grouped.get(node.cluster) || []), node]);
  const membership: Record<string, string[]> = {};
  const nodes: RuntimeNode[] = [];
  const groups = [...grouped].sort(([a], [b]) => a.localeCompare(b));
  for (const [clusterId, members] of groups) {
    const id = "lod:" + clusterId;
    membership[id] = members.map((node) => node.id);
    const cluster = clusters.find((item) => item.id === clusterId);
    nodes.push({
      id, label: (cluster?.label || clusterId) + " · " + members.length + " nós",
      cluster: clusterId, value: Math.min(32, 6 + Math.sqrt(members.length) * 2),
      metadata: { knowledgeLOD: { synthetic: true, memberCount: members.length } },
    });
  }
  const clusterByNode = new Map(graph.nodes.map((node) => [node.id, node.cluster]));
  const sourceId = (value: RuntimeLink["source"]): string => typeof value === "string" ? value : value.id;
  const groupedLinks = new Map<string, { source: string; target: string; weight: number }>();
  for (const link of graph.links) {
    const left = clusterByNode.get(sourceId(link.source)), right = clusterByNode.get(sourceId(link.target));
    if (!left || !right || left === right) continue;
    const ids = [left, right].sort();
    const key = ids[0] + "\0" + ids[1];
    const item = groupedLinks.get(key) || { source: "lod:" + ids[0], target: "lod:" + ids[1], weight: 0 };
    item.weight++;
    groupedLinks.set(key, item);
  }
  const links: RuntimeLink[] = [...groupedLinks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, edge]) => ({
    id: "lod-edge:" + key.replace("\0", ":"),
    source: edge.source, target: edge.target, type: "cluster-bridge", weight: Math.min(10, 1 + Math.log2(edge.weight)),
    directed: false, metadata: { knowledgeLOD: { synthetic: true, collapsedLinkCount: edge.weight } },
  }));
  return { graph: { nodes, links }, membership, originalNodes: graph.nodes.length, originalLinks: graph.links.length, aggregated: true };
}

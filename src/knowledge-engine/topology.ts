import type { GraphDataset } from "../core/types";

export interface TopologyInsight {
  components: string[][];
  communities: Array<{ id: string; nodeIds: string[]; declaredClusters: string[] }>;
  bridges: Array<{ linkId: string; source: string; target: string }>;
  isolatedNodes: string[];
  crossClusterLinks: number;
  relationTypes: Record<string, number>;
  outOfBudget: boolean;
}

export function analyzeTopology(dataset: GraphDataset): TopologyInsight {
  const ids = dataset.nodes.map((node) => node.id).sort();
  const tooLarge = ids.length > 5000 || dataset.links.length > 20000;
  const boundedIds = ids.slice(0, 5000);
  const allowed = new Set(boundedIds);
  const edges = dataset.links.filter((link) => allowed.has(link.source) && allowed.has(link.target)).slice(0, 20000);
  const adjacency = new Map(boundedIds.map((id) => [id, new Set<string>()]));
  const nodeById = new Map(dataset.nodes.map((node) => [node.id, node]));
  const relationTypes: Record<string, number> = {};
  let crossClusterLinks = 0;
  for (const link of edges) {
    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
    relationTypes[link.type || "related"] = (relationTypes[link.type || "related"] || 0) + 1;
    if (nodeById.get(link.source)?.cluster !== nodeById.get(link.target)?.cluster) crossClusterLinks++;
  }
  const components: string[][] = [];
  const visited = new Set<string>();
  for (const id of boundedIds) {
    if (visited.has(id)) continue;
    const group: string[] = [], stack = [id]; visited.add(id);
    while (stack.length) {
      const current = stack.pop()!; group.push(current);
      for (const next of adjacency.get(current) || []) if (!visited.has(next)) { visited.add(next); stack.push(next); }
    }
    components.push(group.sort());
  }
  components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  const isolatedNodes = boundedIds.filter((id) => !(adjacency.get(id)?.size));
  // Deterministic label propagation is a diagnostic projection, NOT canonical ontology.
  const labels = new Map(boundedIds.map((id) => [id, id]));
  for (let iteration = 0; iteration < 8; iteration++) {
    let changed = false;
    for (const id of boundedIds) {
      const counts = new Map<string, number>();
      for (const next of adjacency.get(id) || []) {
        const label = labels.get(next)!;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      const winner = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      if (winner && labels.get(id) !== winner) { labels.set(id, winner); changed = true; }
    }
    if (!changed) break;
  }
  const grouped = new Map<string, string[]>();
  for (const id of boundedIds) {
    const key = labels.get(id)!;
    grouped.set(key, [...(grouped.get(key) || []), id]);
  }
  const communities = [...grouped.values()].sort((a, b) => b.length - a.length || a[0].localeCompare(b[0])).map((members, index) => ({
    id: "community-" + (index + 1),
    nodeIds: members,
    declaredClusters: [...new Set(members.map((id) => nodeById.get(id)?.cluster || ""))].sort(),
  }));
  // Undirected Tarjan bridges, parallel edges excluded from false positives.
  const time = new Map<string, number>(), low = new Map<string, number>(), parent = new Map<string, string>();
  const multiplicity = new Map<string, number>();
  const edgeKey = (a: string, b: string): string => [a, b].sort().join("\0");
  for (const link of edges) multiplicity.set(edgeKey(link.source, link.target), (multiplicity.get(edgeKey(link.source, link.target)) || 0) + 1);
  const bridgePairs = new Set<string>();
  let clock = 0;
  const dfs = (id: string) => {
    clock += 1; time.set(id, clock); low.set(id, clock);
    for (const next of adjacency.get(id) || []) {
      if (!time.has(next)) {
        parent.set(next, id); dfs(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
        if (low.get(next)! > time.get(id)! && multiplicity.get(edgeKey(id, next)) === 1) bridgePairs.add(edgeKey(id, next));
      } else if (parent.get(id) !== next) low.set(id, Math.min(low.get(id)!, time.get(next)!));
    }
  };
  for (const id of boundedIds) if (!time.has(id)) dfs(id);
  return {
    components, communities,
    bridges: edges.filter((link) => bridgePairs.has(edgeKey(link.source, link.target))).map((link) => ({ linkId: link.id, source: link.source, target: link.target })),
    isolatedNodes, crossClusterLinks, relationTypes, outOfBudget: tooLarge,
  };
}

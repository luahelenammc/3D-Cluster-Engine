import type { GraphDataset } from "../core/types";
import type { KnowledgeAssertion, GraphPath } from "./types";
import { evaluateAssertion } from "./ledger";
import type { SourceManifest } from "../second-mind/types";

/** Dijkstra with bounded hops and direction-aware links. Never invent a missing path. */
export function findKnowledgePath(dataset: GraphDataset, from: string, to: string, options: { maxHops?: number; requireEvidence?: boolean; manifest?: SourceManifest; assertions?: KnowledgeAssertion[] } = {}): GraphPath {
  const nodes = new Set(dataset.nodes.map((node) => node.id));
  if (!nodes.has(from) || !nodes.has(to)) return { found: false, nodes: [], links: [], evidence: [], reason: "Nó de origem ou destino ausente do dataset atual." };
  if (from === to) return { found: true, nodes: [from], links: [], evidence: [] };
  const maxHops = Math.max(1, Math.min(12, Math.floor(options.maxHops ?? 6)));
  const byLink = new Map((options.assertions || []).filter((item) => item.reviewStatus === "accepted").map((item) => [item.assertionId.replace(/^link:/, ""), item]));
  const adjacency = new Map<string, Array<{ target: string; id: string; cost: number }>>();
  for (const node of nodes) adjacency.set(node, []);
  for (const link of dataset.links) {
    if (link.visible === false || !nodes.has(link.source) || !nodes.has(link.target)) continue;
    const assertion = byLink.get(link.id);
    const evidenceOk = assertion && assertion.evidence.length > 0 && (!options.manifest || evaluateAssertion(assertion, options.manifest).health === "current");
    if (options.requireEvidence && !evidenceOk) continue;
    const cost = 1 + (assertion?.epistemicStatus === "inferred" ? 0.6 : 0) + (!evidenceOk ? 0.5 : 0);
    adjacency.get(link.source)?.push({ target: link.target, id: link.id, cost });
    if (link.directed === false) adjacency.get(link.target)?.push({ target: link.source, id: link.id, cost });
  }
  const queue: Array<{ id: string; cost: number; path: string[]; links: string[] }> = [{ id: from, cost: 0, path: [from], links: [] }];
  const best = new Map<string, number>([[from + ":0", 0]]);
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
    const current = queue.shift()!;
    if (current.id === to) {
      const linkById = new Map(dataset.links.map((link) => [link.id, link]));
      return {
        found: true, nodes: current.path, links: current.links,
        evidence: current.links.map((id) => {
          const assertion = byLink.get(id), link = linkById.get(id);
          return { linkId: id, relation: assertion?.predicate || (typeof link?.metadata?.relation === "string" ? link.metadata.relation : link?.type || "related"), citations: assertion?.evidence || [] };
        }),
      };
    }
    if (current.links.length >= maxHops) continue;
    for (const edge of adjacency.get(current.id) || []) {
      if (current.path.includes(edge.target)) continue;
      const nextHops = current.links.length + 1, cost = current.cost + edge.cost;
      const key = edge.target + ":" + nextHops;
      if (cost >= (best.get(key) ?? Infinity)) continue;
      best.set(key, cost);
      queue.push({ id: edge.target, cost, path: [...current.path, edge.target], links: [...current.links, edge.id] });
    }
  }
  return { found: false, nodes: [], links: [], evidence: [], reason: "Nenhum caminho permitido encontrado no snapshot e no limite de saltos. Isso não prova ausência de conexão no corpus." };
}

export function pathEvidenceCoverage(path: GraphPath): number {
  return path.links.length ? path.evidence.filter((edge) => edge.citations.length > 0).length / path.links.length : path.found ? 1 : 0;
}

export function groundedPathNarrative(path: GraphPath, dataset: GraphDataset): string {
  if (!path.found) return path.reason || "Caminho indisponível.";
  const labels = new Map(dataset.nodes.map((node) => [node.id, node.label]));
  if (!path.links.length) return "Origem e destino representam o mesmo nó.";
  return path.evidence.map((edge, index) => {
    const subject = labels.get(path.nodes[index]) || path.nodes[index];
    const object = labels.get(path.nodes[index + 1]) || path.nodes[index + 1];
    const source = edge.citations[0]?.path;
    return subject + " → [" + edge.relation + "] → " + object + (source ? " · " + source : " · sem citação validada");
  }).join("\n");
}

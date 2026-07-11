import { seededPoint } from "../core/colors";
import { computeSemanticTargets, resolveSemanticAxes } from "../core/spatial";
import { DEFAULT_LAYOUT, type ClusterDefinition, type GraphDataset, type GraphLink, type GraphNode, type RuntimeGraph } from "../core/types";
import { generateLinkId } from "./ids";
import { assertValidDataset, validateDataset } from "./validate";

type Listener = () => void;

const clone = <T,>(value: T): T => structuredClone(value);

export class GraphStore {
  private dataset: GraphDataset;
  private listeners = new Set<Listener>();
  private past: GraphDataset[] = [];
  private future: GraphDataset[] = [];
  dirty = false;

  constructor(initial: GraphDataset) {
    this.dataset = clone(assertValidDataset(initial));
  }

  subscribe(listener: Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit() { this.listeners.forEach((listener) => listener()); }
  private commit(next: GraphDataset) {
    const result = validateDataset(next);
    if (!result.valid) throw new Error(result.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; "));
    this.past.push(clone(this.dataset));
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.dataset = clone(next);
    this.dirty = true;
    this.emit();
  }
  getDataset(): Readonly<GraphDataset> { return clone(this.dataset); }
  replace(dataset: GraphDataset, dirty = false) {
    this.dataset = clone(assertValidDataset(dataset));
    this.past = [];
    this.future = [];
    this.dirty = dirty;
    this.emit();
  }
  getRuntimeSnapshot(): RuntimeGraph {
    const seed = this.dataset.layout?.seed || DEFAULT_LAYOUT.seed;
    const axes = resolveSemanticAxes(this.dataset.layout);
    const semanticTargets = computeSemanticTargets(this.dataset.nodes, this.dataset.links, this.dataset.clusters, axes);
    return {
      nodes: this.dataset.nodes.map((node) => {
        const semantic = semanticTargets.get(node.id);
        const initial = node.position || semantic || seededPoint(seed, node.id, node.cluster);
        return { ...clone(node), semanticTarget: semantic, x: initial.x, y: initial.y, z: initial.z, fx: node.pinned ? initial.x : undefined, fy: node.pinned ? initial.y : undefined, fz: node.pinned ? initial.z : undefined };
      }),
      links: this.dataset.links.map((link) => ({ ...clone(link), weight: link.weight ?? 1, directed: link.directed ?? false, visible: link.visible ?? true })),
    };
  }
  updateNode(id: string, patch: Partial<GraphNode>) { this.commit({ ...this.dataset, nodes: this.dataset.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) }); }
  addNode(node: GraphNode) { this.commit({ ...this.dataset, nodes: [...this.dataset.nodes, node] }); }
  removeNode(id: string) { this.commit({ ...this.dataset, nodes: this.dataset.nodes.filter((node) => node.id !== id), links: this.dataset.links.filter((link) => link.source !== id && link.target !== id) }); }
  addLink(link: GraphLink) {
    const canonical = { ...link, id: link.id?.trim() || generateLinkId(link, this.dataset.links.map((item) => item.id)) };
    this.commit({ ...this.dataset, links: [...this.dataset.links, canonical] });
  }
  updateLink(id: string, patch: Partial<GraphLink>) { this.commit({ ...this.dataset, links: this.dataset.links.map((link) => link.id === id ? { ...link, ...patch, id: patch.id || link.id } : link) }); }
  removeLink(id: string) { this.commit({ ...this.dataset, links: this.dataset.links.filter((link) => link.id !== id) }); }
  addCluster(cluster: ClusterDefinition) { this.commit({ ...this.dataset, clusters: [...this.dataset.clusters, cluster] }); }
  updateCluster(id: string, patch: Partial<ClusterDefinition>) { this.commit({ ...this.dataset, clusters: this.dataset.clusters.map((cluster) => cluster.id === id ? { ...cluster, ...patch } : cluster) }); }
  setLayout(patch: GraphDataset["layout"]) { this.commit({ ...this.dataset, layout: { ...this.dataset.layout, ...patch } }); }
  setVisual(patch: GraphDataset["visual"]) { this.commit({ ...this.dataset, visual: { ...this.dataset.visual, ...patch } }); }
  applyPositions(positions: Record<string, { x: number; y: number; z: number }>) { this.commit({ ...this.dataset, layout: { ...this.dataset.layout, mode: "baked" }, nodes: this.dataset.nodes.map((node) => positions[node.id] ? { ...node, position: { ...positions[node.id] } } : node) }); }
  clearPositions() { this.commit({ ...this.dataset, layout: { ...this.dataset.layout, mode: "live" }, nodes: this.dataset.nodes.map((node) => { const next = clone(node); delete next.position; return next; }) }); }
  undo() { const previous = this.past.pop(); if (!previous) return; this.future.push(clone(this.dataset)); this.dataset = previous; this.dirty = true; this.emit(); }
  redo() { const next = this.future.pop(); if (!next) return; this.past.push(clone(this.dataset)); this.dataset = next; this.dirty = true; this.emit(); }
  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
}

import { stableHash } from "./colors";
import {
  DEFAULT_LAYOUT,
  type AxisDimension,
  type ClusterDefinition,
  type GraphLink,
  type GraphNode,
  type LayoutConfig,
  type RuntimeLink,
  type RuntimeNode,
  type SemanticAxesConfig,
  type SemanticAxisConfig,
} from "./types";

type SpatialNode = GraphNode | RuntimeNode;
type SpatialLink = GraphLink | RuntimeLink;
type Coordinate = { x: number; y: number; z: number };
type Metrics = {
  degree: Map<string, number>;
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
  graphDepth: Map<string, number>;
  stableIndex: Map<string, number>;
  clusterIndex: Map<string, number>;
};

function endpointId(endpoint: string | RuntimeNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function numericField(node: SpatialNode, path: string | undefined): number | undefined {
  if (!path) return undefined;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = node;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  const numeric = Number(current);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function makeClusterIndex(nodes: SpatialNode[], clusters: ClusterDefinition[]): Map<string, number> {
  const declared = clusters.map((cluster) => cluster.id);
  const extras = [...new Set(nodes.map((node) => node.cluster).filter((id) => !declared.includes(id)))].sort();
  return new Map([...declared, ...extras].map((id, index) => [id, index]));
}

function computeMetrics(nodes: SpatialNode[], links: SpatialLink[], clusters: ClusterDefinition[]): Metrics {
  const ids = nodes.map((node) => node.id);
  const degree = new Map(ids.map((id) => [id, 0]));
  const inDegree = new Map(ids.map((id) => [id, 0]));
  const outDegree = new Map(ids.map((id) => [id, 0]));
  const directedIncoming = new Map(ids.map((id) => [id, 0]));
  const adjacency = new Map(ids.map((id) => [id, new Set<string>()]));
  let hasDirectedLink = false;

  for (const link of links) {
    const source = endpointId(link.source as string | RuntimeNode);
    const target = endpointId(link.target as string | RuntimeNode);
    if (!degree.has(source) || !degree.has(target)) continue;
    const weight = Math.max(0, Number(link.weight ?? 1));
    degree.set(source, (degree.get(source) || 0) + weight);
    degree.set(target, (degree.get(target) || 0) + weight);

    if (link.directed) {
      hasDirectedLink = true;
      outDegree.set(source, (outDegree.get(source) || 0) + weight);
      inDegree.set(target, (inDegree.get(target) || 0) + weight);
      directedIncoming.set(target, (directedIncoming.get(target) || 0) + 1);
      adjacency.get(source)?.add(target);
    } else {
      outDegree.set(source, (outDegree.get(source) || 0) + weight);
      outDegree.set(target, (outDegree.get(target) || 0) + weight);
      inDegree.set(source, (inDegree.get(source) || 0) + weight);
      inDegree.set(target, (inDegree.get(target) || 0) + weight);
      adjacency.get(source)?.add(target);
      adjacency.get(target)?.add(source);
    }
  }

  const stableIds = [...ids].sort();
  const stableIndex = new Map(stableIds.map((id, index) => [id, index]));
  const graphDepth = new Map<string, number>();
  const visited = new Set<string>();

  const walk = (root: string) => {
    const queue: Array<{ id: string; depth: number }> = [{ id: root, depth: 0 }];
    visited.add(root);
    while (queue.length) {
      const current = queue.shift()!;
      graphDepth.set(current.id, current.depth);
      const neighbors = [...(adjacency.get(current.id) || [])].sort();
      for (const next of neighbors) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push({ id: next, depth: current.depth + 1 });
      }
    }
  };

  const roots = hasDirectedLink
    ? stableIds.filter((id) => (directedIncoming.get(id) || 0) === 0)
    : [];

  for (const root of roots) {
    if (!visited.has(root)) walk(root);
  }

  while (visited.size < stableIds.length) {
    const remaining = stableIds.filter((id) => !visited.has(id));
    remaining.sort((a, b) => (degree.get(b) || 0) - (degree.get(a) || 0) || a.localeCompare(b));
    walk(remaining[0]);
  }

  return {
    degree,
    inDegree,
    outDegree,
    graphDepth,
    stableIndex,
    clusterIndex: makeClusterIndex(nodes, clusters),
  };
}

export function resolveSemanticAxes(layout?: Partial<LayoutConfig>): SemanticAxesConfig {
  const defaults = DEFAULT_LAYOUT.axes!;
  const supplied = layout?.axes;
  const resolved: SemanticAxesConfig = {
    enabled: supplied?.enabled ?? defaults.enabled,
    x: { ...defaults.x, ...(supplied?.x || {}) },
    y: { ...defaults.y, ...(supplied?.y || {}) },
    z: { ...defaults.z, ...(supplied?.z || {}) },
  };

  if (!supplied && layout?.axis) {
    const legacy = layout.axis;
    const dimension = legacy.dimension || "y";
    resolved.enabled = legacy.enabled;
    resolved[dimension] = {
      ...resolved[dimension],
      enabled: legacy.enabled,
      source: "field",
      field: legacy.field,
      label: legacy.label || legacy.field,
      min: legacy.min,
      max: legacy.max,
      invert: legacy.invert,
      strength: legacy.strength,
    };
  }

  return resolved;
}

function rawAxisValue(node: SpatialNode, config: SemanticAxisConfig, metrics: Metrics): number | undefined {
  switch (config.source) {
    case "field":
      return numericField(node, config.field);
    case "cluster":
      return metrics.clusterIndex.get(node.cluster);
    case "degree":
      return metrics.degree.get(node.id);
    case "inDegree":
      return metrics.inDegree.get(node.id);
    case "outDegree":
      return metrics.outDegree.get(node.id);
    case "graphDepth":
      return metrics.graphDepth.get(node.id);
    case "stableIndex":
      return metrics.stableIndex.get(node.id);
    default:
      return undefined;
  }
}

function normalizedAxisTargets(nodes: SpatialNode[], config: SemanticAxisConfig, metrics: Metrics): Map<string, number> {
  if (!config.enabled) return new Map(nodes.map((node) => [node.id, 0]));

  const provisional = new Map<string, number | undefined>();
  for (const node of nodes) {
    let value = rawAxisValue(node, config, metrics);
    if (!Number.isFinite(value)) {
      if (config.missing === "graphDepth") value = metrics.graphDepth.get(node.id);
      if (config.missing === "stableIndex") value = metrics.stableIndex.get(node.id);
    }
    provisional.set(node.id, Number.isFinite(value) ? value : undefined);
  }

  const finite = [...provisional.values()].filter((value): value is number => Number.isFinite(value));
  const observedMin = finite.length ? Math.min(...finite) : 0;
  const observedMax = finite.length ? Math.max(...finite) : 1;
  const min = config.min ?? observedMin;
  const max = config.max ?? observedMax;
  const span = config.span ?? 260;
  const result = new Map<string, number>();

  for (const node of nodes) {
    let value = provisional.get(node.id);
    if (!Number.isFinite(value)) {
      if (config.missing === "min") value = min;
      else if (config.missing === "max") value = max;
      else value = min + (max - min) / 2;
    }
    let ratio = max === min ? 0.5 : (Number(value) - min) / (max - min);
    ratio = Math.max(0, Math.min(1, ratio));
    if (config.invert) ratio = 1 - ratio;
    result.set(node.id, (ratio - 0.5) * span);
  }

  return result;
}

function addCollisionOffsets(targets: Map<string, Coordinate>): Map<string, Coordinate> {
  const groups = new Map<string, string[]>();
  for (const [id, point] of targets) {
    const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}:${point.z.toFixed(3)}`;
    const group = groups.get(key) || [];
    group.push(id);
    groups.set(key, group);
  }

  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    ids.sort();
    const radius = Math.min(8, 3 + Math.sqrt(ids.length));
    ids.forEach((id, index) => {
      const base = targets.get(id)!;
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const vertical = ids.length === 1 ? 0 : (index / (ids.length - 1) - 0.5) * radius;
      targets.set(id, {
        x: base.x + Math.cos(angle) * radius,
        y: base.y + vertical,
        z: base.z + Math.sin(angle) * radius,
      });
    });
  }
  return targets;
}

export function computeSemanticTargets(
  nodes: SpatialNode[],
  links: SpatialLink[],
  clusters: ClusterDefinition[],
  axesInput?: SemanticAxesConfig,
): Map<string, Coordinate> {
  const axes = axesInput || resolveSemanticAxes();
  if (!axes.enabled) return new Map();
  const metrics = computeMetrics(nodes, links, clusters);
  const x = normalizedAxisTargets(nodes, axes.x, metrics);
  const y = normalizedAxisTargets(nodes, axes.y, metrics);
  const z = normalizedAxisTargets(nodes, axes.z, metrics);
  return addCollisionOffsets(new Map(nodes.map((node) => [node.id, {
    x: x.get(node.id) || 0,
    y: y.get(node.id) || 0,
    z: z.get(node.id) || 0,
  }])));
}

export function createSemanticAxesForce(
  nodes: RuntimeNode[],
  links: RuntimeLink[],
  clusters: ClusterDefinition[],
  axes: SemanticAxesConfig,
) {
  const computedTargets = computeSemanticTargets(nodes, links, clusters, axes);
  const targets = new Map(nodes.map((node) => [node.id, node.semanticTarget || computedTargets.get(node.id)]).filter((entry): entry is [string, Coordinate] => Boolean(entry[1])));
  const dimensions: AxisDimension[] = ["x", "y", "z"];
  const force = (alpha: number) => {
    if (!axes.enabled) return;
    for (const node of nodes) {
      if (node.pinned) continue;
      const target = targets.get(node.id);
      if (!target) continue;
      for (const dimension of dimensions) {
        const config = axes[dimension];
        if (!config.enabled) continue;
        const velocity = `v${dimension}` as "vx" | "vy" | "vz";
        node[velocity] = (node[velocity] || 0) + (target[dimension] - (node[dimension] || 0)) * (config.strength ?? 0.3) * alpha;
      }
    }
  };
  force.initialize = () => undefined;
  return force;
}

export function semanticAxisValue(node: SpatialNode, axis: SemanticAxisConfig, nodes: SpatialNode[], links: SpatialLink[], clusters: ClusterDefinition[]): number | undefined {
  const metrics = computeMetrics(nodes, links, clusters);
  return rawAxisValue(node, axis, metrics);
}

export function stableSpatialFallback(id: string, span = 16): Coordinate {
  const hash = stableHash(id);
  return {
    x: ((hash & 0xff) / 0xff - 0.5) * span,
    y: (((hash >>> 8) & 0xff) / 0xff - 0.5) * span,
    z: (((hash >>> 16) & 0xff) / 0xff - 0.5) * span,
  };
}

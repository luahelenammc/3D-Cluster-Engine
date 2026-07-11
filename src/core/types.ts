export type NodeId = string;
export type ClusterId = string;

export interface GraphPosition {
  x: number;
  y: number;
  z: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
}

export interface GraphNode {
  id: NodeId;
  label: string;
  cluster: ClusterId;
  value?: number;
  level?: number;
  color?: string;
  visible?: boolean;
  pinned?: boolean;
  position?: GraphPosition;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface GraphLink {
  id?: string;
  source: NodeId;
  target: NodeId;
  type?: string;
  weight?: number;
  directed?: boolean;
  visible?: boolean;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface ClusterDefinition {
  id: ClusterId;
  label: string;
  color?: string;
  description?: string;
  visible?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AxisConfig {
  enabled: boolean;
  field: string;
  dimension: "x" | "y" | "z";
  min?: number;
  max?: number;
  invert?: boolean;
  strength?: number;
  label?: string;
}

export interface LayoutConfig {
  mode: "live" | "baked" | "hybrid";
  dimensions: 3;
  seed: string;
  clusterStrength: number;
  chargeStrength: number;
  linkDistance: number;
  collisionPadding: number;
  warmupTicks: number;
  cooldownTicks: number;
  axis?: AxisConfig;
}

export interface VisualConfig {
  background: string;
  nodeSizeMin: number;
  nodeSizeMax: number;
  linkOpacity: number;
  linkWidth: number;
  showLabels: "never" | "hover" | "selected" | "always";
  showDirectionalParticles: boolean;
  dimUnrelatedOnSelection: boolean;
}

export interface GraphDataset {
  schemaVersion: "1.0";
  meta: {
    id: string;
    title: string;
    description?: string;
    version: string;
    source?: string;
    license?: string;
    attribution?: string[];
    tags?: string[];
  };
  clusters?: ClusterDefinition[];
  nodes: GraphNode[];
  links: GraphLink[];
  layout?: Partial<LayoutConfig>;
  visual?: Partial<VisualConfig>;
}

export interface RuntimeNode extends GraphNode {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
}

export interface RuntimeLink extends Omit<GraphLink, "source" | "target"> {
  id: string;
  source: NodeId | RuntimeNode;
  target: NodeId | RuntimeNode;
}

export interface RuntimeGraph {
  nodes: RuntimeNode[];
  links: RuntimeLink[];
}

export interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
  suggestion?: string;
}

export interface FilterState {
  clusters: Set<string>;
  linkTypes: Set<string>;
  query: string;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  mode: "live",
  dimensions: 3,
  seed: "lms-default",
  clusterStrength: 0.14,
  chargeStrength: -72,
  linkDistance: 54,
  collisionPadding: 3,
  warmupTicks: 80,
  cooldownTicks: 420,
  axis: { enabled: true, field: "level", dimension: "y", strength: 0.18, label: "Level" },
};

export const DEFAULT_VISUAL: VisualConfig = {
  background: "#080b12",
  nodeSizeMin: 3,
  nodeSizeMax: 13,
  linkOpacity: 0.28,
  linkWidth: 0.7,
  showLabels: "hover",
  showDirectionalParticles: true,
  dimUnrelatedOnSelection: true,
};

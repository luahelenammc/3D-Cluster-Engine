export type NodeId = string;
export type ClusterId = string;

export interface GraphPosition {
  x: number;
  y: number;
  z: number;
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

export interface CanonicalGraphLink extends GraphLink {
  id: string;
}

export interface ClusterDefinition {
  id: ClusterId;
  label: string;
  color?: string;
  description?: string;
  visible?: boolean;
  metadata?: Record<string, unknown>;
}

export type AxisDimension = "x" | "y" | "z";
export type SemanticAxisSource = "field" | "cluster" | "degree" | "inDegree" | "outDegree" | "graphDepth" | "stableIndex";
export type SemanticAxisMissing = "center" | "min" | "max" | "graphDepth" | "stableIndex";

/** Legacy v1.0 single-axis configuration. Accepted only by the migration layer. */
export interface AxisConfig {
  enabled: boolean;
  field: string;
  dimension: AxisDimension;
  min?: number;
  max?: number;
  invert?: boolean;
  strength?: number;
  label?: string;
}

export interface SemanticAxisConfig {
  enabled: boolean;
  source: SemanticAxisSource;
  field?: string;
  label: string;
  min?: number;
  max?: number;
  invert?: boolean;
  strength?: number;
  span?: number;
  missing?: SemanticAxisMissing;
}

export interface SemanticAxesConfig {
  enabled: boolean;
  x: SemanticAxisConfig;
  y: SemanticAxisConfig;
  z: SemanticAxisConfig;
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
  axes?: SemanticAxesConfig;
  /** @deprecated Runtime compatibility only. Canonical v1.1 datasets must use `axes`. */
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
  schemaVersion: "1.1";
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
  clusters: ClusterDefinition[];
  nodes: GraphNode[];
  links: CanonicalGraphLink[];
  layout?: Partial<LayoutConfig>;
  visual?: Partial<VisualConfig>;
  extensions?: Record<string, unknown>;
}

export interface RuntimeNode extends GraphNode {
  semanticTarget?: GraphPosition;
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

export interface RuntimeLink extends Omit<CanonicalGraphLink, "source" | "target"> {
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
  clusterStrength: 0.05,
  chargeStrength: -72,
  linkDistance: 54,
  collisionPadding: 3,
  warmupTicks: 80,
  cooldownTicks: 420,
  axes: {
    enabled: true,
    x: { enabled: true, source: "cluster", label: "Território", strength: 0.34, span: 280, missing: "stableIndex" },
    y: { enabled: true, source: "field", field: "level", label: "Progressão", strength: 0.34, span: 260, missing: "graphDepth" },
    z: { enabled: true, source: "degree", label: "Centralidade relacional", strength: 0.28, span: 220, missing: "center" },
  },
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

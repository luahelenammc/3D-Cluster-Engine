import { DEFAULT_LAYOUT, type AxisConfig, type CanonicalGraphLink, type ClusterDefinition, type GraphDataset, type GraphLink, type GraphNode, type LayoutConfig, type SemanticAxesConfig } from "../core/types";
import { DATASET_SCHEMA_VERSION, LEGACY_DATASET_SCHEMA_VERSIONS } from "./contract";
import { generateLinkId } from "./ids";
import { validateDataset } from "./validate";

export interface NormalizationResult {
  dataset: GraphDataset;
  sourceVersion: string;
  migrations: string[];
  warnings: string[];
}

export class DatasetNormalizationError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "DatasetNormalizationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inferClusters(nodes: GraphNode[]): ClusterDefinition[] {
  return [...new Set(nodes.map((node) => node.cluster).filter(Boolean))].sort().map((id) => ({
    id,
    label: id.replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
  }));
}

function migrateLegacyAxis(axis: AxisConfig): SemanticAxesConfig {
  const axes = structuredClone(DEFAULT_LAYOUT.axes!);
  const dimension = axis.dimension || "y";
  axes.enabled = axis.enabled;
  axes[dimension] = {
    ...axes[dimension],
    enabled: axis.enabled,
    source: "field",
    field: axis.field,
    label: axis.label || axis.field,
    min: axis.min,
    max: axis.max,
    invert: axis.invert,
    strength: axis.strength,
  };
  return axes;
}

function migrateLayout(input: unknown, migrations: string[]): Partial<LayoutConfig> | undefined {
  if (!isRecord(input)) return undefined;
  const layout = structuredClone(input) as Record<string, unknown>;
  if (!layout.axes && isRecord(layout.axis)) {
    layout.axes = migrateLegacyAxis(layout.axis as unknown as AxisConfig);
    migrations.push("layout.axis → layout.axes");
  }
  delete layout.axis;
  return layout as Partial<LayoutConfig>;
}

export function normalizeDataset(input: unknown): NormalizationResult {
  if (!isRecord(input)) throw new DatasetNormalizationError("O dataset precisa ser um objeto JSON.");
  const sourceVersion = String(input.schemaVersion || "");
  const legacy = (LEGACY_DATASET_SCHEMA_VERSIONS as readonly string[]).includes(sourceVersion);
  if (sourceVersion !== DATASET_SCHEMA_VERSION && !legacy) {
    throw new DatasetNormalizationError(`schemaVersion ${sourceVersion || "ausente"} não é suportado.`, [`Versões aceitas: ${DATASET_SCHEMA_VERSION}, ${LEGACY_DATASET_SCHEMA_VERSIONS.join(", ")}`]);
  }
  if (!isRecord(input.meta)) throw new DatasetNormalizationError("meta precisa ser um objeto.");
  if (!Array.isArray(input.nodes)) throw new DatasetNormalizationError("nodes precisa ser um array.");
  if (!Array.isArray(input.links)) throw new DatasetNormalizationError("links precisa ser um array.");

  const migrations: string[] = [];
  const nodes = structuredClone(input.nodes) as GraphNode[];
  let clusters: ClusterDefinition[];
  if (Array.isArray(input.clusters)) {
    clusters = structuredClone(input.clusters) as ClusterDefinition[];
  } else if (legacy) {
    clusters = inferClusters(nodes);
    migrations.push("clusters inferidos a partir de nodes[].cluster");
  } else {
    throw new DatasetNormalizationError("clusters é obrigatório no contrato canônico 1.1.");
  }

  const rawLinks = structuredClone(input.links) as Array<Record<string, unknown>>;
  const usedLinkIds = new Set(rawLinks.map((link) => typeof link.id === "string" ? link.id.trim() : "").filter(Boolean));
  const links = rawLinks.map((link, index) => {
    const next = { ...link };
    if (typeof next.id === "string" && next.id.trim()) {
      usedLinkIds.add(next.id);
    } else if (legacy) {
      const generated = generateLinkId(next as unknown as GraphLink, usedLinkIds);
      next.id = generated;
      usedLinkIds.add(generated);
      migrations.push(`ID determinístico gerado para links[${index}]`);
    }
    return next as unknown as CanonicalGraphLink;
  });

  const candidate: GraphDataset = {
    ...(structuredClone(input) as unknown as GraphDataset),
    schemaVersion: DATASET_SCHEMA_VERSION,
    meta: structuredClone(input.meta) as GraphDataset["meta"],
    clusters,
    nodes,
    links,
    layout: migrateLayout(input.layout, migrations),
  };

  const validation = validateDataset(candidate);
  if (!validation.valid || !validation.dataset) {
    const errors = validation.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`);
    throw new DatasetNormalizationError("A entrada não pôde ser convertida para o contrato canônico 1.1.", errors);
  }

  if (legacy) migrations.unshift(`schemaVersion ${sourceVersion} → ${DATASET_SCHEMA_VERSION}`);
  return {
    dataset: validation.dataset,
    sourceVersion,
    migrations,
    warnings: validation.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
  };
}

import type { ClusterDefinition, GraphDataset, GraphLink, GraphNode } from "../core/types";
import { normalizeDataset } from "./normalize";
import { validateDataset } from "./validate";

export interface ImportResult {
  dataset: GraphDataset;
  adapter: string;
  warnings: string[];
  migrations: string[];
}

type NamedFile = { file: File; text: string };

function csvRows(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const split = (line: string) => line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
  const headers = split(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, split(line)[index] || ""])));
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  if (/^null$/i.test(trimmed)) return null;
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

function assignPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".").filter(Boolean);
  let cursor = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value;
      return;
    }
    if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  });
}

function metadataFrom(row: Record<string, string>) {
  const metadata: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!key.startsWith("meta.") || value === "") return;
    assignPath(metadata, key.slice(5), parseScalar(value));
  });
  return metadata;
}

function booleanValue(value: string, fallback?: boolean): boolean | undefined {
  if (value === "") return fallback;
  if (/^(true|1|yes|sim)$/i.test(value)) return true;
  if (/^(false|0|no|não|nao)$/i.test(value)) return false;
  return fallback;
}

function numberValue(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function tagsValue(value: string): string[] | undefined {
  if (!value.trim()) return undefined;
  if (value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* use delimited fallback */ }
  }
  return value.split(/[|;]/).map((tag) => tag.trim()).filter(Boolean);
}

function positionFrom(row: Record<string, string>) {
  const x = numberValue(row["position.x"] || "");
  const y = numberValue(row["position.y"] || "");
  const z = numberValue(row["position.z"] || "");
  return x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined;
}

function jsonNamed(files: Map<string, NamedFile>, name: string) {
  const item = files.get(name);
  return item ? JSON.parse(item.text) : undefined;
}

function inferClusters(nodes: GraphNode[]): ClusterDefinition[] {
  return [...new Set(nodes.map((node) => node.cluster || "unassigned"))].sort().map((id) => ({
    id,
    label: id.replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
  }));
}

function strictCanonical(input: unknown, adapter: string): ImportResult {
  const result = validateDataset(input);
  if (!result.valid || !result.dataset) {
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  return {
    dataset: result.dataset,
    adapter,
    migrations: [],
    warnings: result.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
  };
}

function migrated(input: unknown, adapter: string, warnings: string[] = []): ImportResult {
  const result = normalizeDataset(input);
  return { dataset: result.dataset, adapter, migrations: result.migrations, warnings: [...warnings, ...result.warnings] };
}

export async function importFiles(files: File[]): Promise<ImportResult> {
  if (!files.length) throw new Error("Nenhum arquivo foi selecionado.");
  const named = new Map<string, NamedFile>();
  for (const file of files) named.set(file.name.toLowerCase(), { file, text: await file.text() });

  if (files.length === 1 && files[0].name.toLowerCase().endsWith(".json")) {
    const input = JSON.parse(await files[0].text());
    if (input.schemaVersion === "1.1") return strictCanonical(input, "canonical-json-1.1");
    if (input.schemaVersion === "1.0") return migrated(input, "canonical-json-1.0");
    if (Array.isArray(input.topics)) return marbleFrom(input.topics, input.dependencies || []);
  }

  const topics = jsonNamed(named, "topics.json");
  const dependencies = jsonNamed(named, "dependencies.json");
  if (topics) return marbleFrom(topics, dependencies || []);

  const nodesJson = jsonNamed(named, "nodes.json");
  const linksJson = jsonNamed(named, "links.json");
  if (nodesJson && linksJson) {
    const clustersJson = jsonNamed(named, "clusters.json") || inferClusters(nodesJson);
    const metaJson = jsonNamed(named, "meta.json") || { id: "split-import", title: "Split JSON import", version: "1.0.0" };
    const layoutJson = jsonNamed(named, "layout.json");
    const visualJson = jsonNamed(named, "visual.json");
    const extensionsJson = jsonNamed(named, "extensions.json");
    return migrated({ schemaVersion: "1.0", meta: metaJson, clusters: clustersJson, nodes: nodesJson, links: linksJson, layout: layoutJson, visual: visualJson, extensions: extensionsJson }, "split-json");
  }

  const nodesCsv = named.get("nodes.csv");
  const linksCsv = named.get("links.csv");
  if (nodesCsv && linksCsv) {
    const nodes: GraphNode[] = csvRows(nodesCsv.text).map((row) => ({
      id: row.id,
      label: row.label || row.id,
      cluster: row.cluster || "unassigned",
      value: numberValue(row.value || ""),
      level: numberValue(row.level || ""),
      color: row.color || undefined,
      visible: booleanValue(row.visible || ""),
      pinned: booleanValue(row.pinned || ""),
      position: positionFrom(row),
      tags: tagsValue(row.tags || ""),
      metadata: metadataFrom(row),
    }));
    const links: GraphLink[] = csvRows(linksCsv.text).map((row) => ({
      id: row.id || undefined,
      source: row.source,
      target: row.target,
      type: row.type || "related",
      weight: numberValue(row.weight || "") ?? 1,
      directed: booleanValue(row.directed || "", false),
      visible: booleanValue(row.visible || ""),
      color: row.color || undefined,
      metadata: metadataFrom(row),
    }));
    const clustersCsv = named.get("clusters.csv");
    const clusters: ClusterDefinition[] = clustersCsv ? csvRows(clustersCsv.text).map((row) => ({
      id: row.id,
      label: row.label || row.id,
      color: row.color || undefined,
      description: row.description || undefined,
      visible: booleanValue(row.visible || ""),
      metadata: metadataFrom(row),
    })) : inferClusters(nodes);
    const metaJson = jsonNamed(named, "meta.json") || { id: "csv-import", title: "CSV import", version: "1.0.0" };
    const layoutJson = jsonNamed(named, "layout.json");
    const visualJson = jsonNamed(named, "visual.json");
    const extensionsJson = jsonNamed(named, "extensions.json");
    return migrated({ schemaVersion: "1.0", meta: metaJson, clusters, nodes, links, layout: layoutJson, visual: visualJson, extensions: extensionsJson }, "csv");
  }

  throw new Error("Formato não reconhecido. Use dataset canônico 1.1/1.0; nodes.json + links.json; nodes.csv + links.csv; ou topics.json + dependencies.json.");
}

function marbleFrom(topics: Array<Record<string, unknown>>, dependencies: Array<Record<string, unknown>>): ImportResult {
  const warnings: string[] = [];
  const nodes: GraphNode[] = topics.map((topic, index) => {
    const id = String(topic.id || topic.topicId || `topic-${index + 1}`);
    const cluster = String(topic.subject || topic.domain || "unassigned");
    const start = Number(topic.ageRangeStart ?? topic.level ?? 0);
    const end = Number(topic.ageRangeEnd ?? start);
    if (!topic.subject) warnings.push(`Tópico ${id} sem subject; movido para unassigned.`);
    return {
      id,
      label: String(topic.name || topic.label || id),
      cluster,
      value: Number(topic.centrality ?? topic.value ?? 1),
      level: (start + end) / 2,
      metadata: { description: topic.description, evidence: topic.evidence, type: topic.type, standards: topic.standards },
    };
  });
  const links: GraphLink[] = dependencies.map((dependency) => ({
    id: dependency.id ? String(dependency.id) : undefined,
    source: String(dependency.prerequisiteId || dependency.source),
    target: String(dependency.topicId || dependency.target),
    type: String(dependency.type || "prerequisite"),
    weight: Number(dependency.weight || 1),
    directed: true,
    metadata: { reason: dependency.reason },
  }));
  return migrated({
    schemaVersion: "1.0",
    meta: {
      id: "marble-import",
      title: "Marble taxonomy import",
      version: "1.0.0",
      source: "https://github.com/withmarbleapp/os-taxonomy",
      attribution: ["Marble open-source taxonomy"],
    },
    clusters: inferClusters(nodes),
    nodes,
    links,
    layout: { seed: "marble", axis: { enabled: true, field: "level", dimension: "y", strength: 0.2, label: "Age / level" } },
  }, "marble", warnings);
}

export function serializeDataset(dataset: GraphDataset): string {
  const checked = strictCanonical(dataset, "serialize");
  return `${JSON.stringify(checked.dataset, null, 2)}\n`;
}

export function downloadDataset(dataset: GraphDataset) {
  const blob = new Blob([serializeDataset(dataset)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${dataset.meta.id || "graph-dataset"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

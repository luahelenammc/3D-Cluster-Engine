import type { ClusterDefinition, GraphDataset, GraphLink, GraphNode } from "../core/types";
import { validateDataset } from "./validate";

export interface ImportResult { dataset: GraphDataset; adapter: string; warnings: string[]; }

function csvRows(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const split = (line: string) => line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, split(line)[index] || ""])));
}

function metadataFrom(row: Record<string, string>) {
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => key.startsWith("meta.") && value !== "").map(([key, value]) => [key.slice(5), value]));
}

export async function importFiles(files: File[]): Promise<ImportResult> {
  if (!files.length) throw new Error("Nenhum arquivo foi selecionado.");
  const named = new Map<string, { file: File; text: string }>();
  for (const file of files) named.set(file.name.toLowerCase(), { file, text: await file.text() });

  if (files.length === 1 && files[0].name.toLowerCase().endsWith(".json")) {
    const input = JSON.parse(await files[0].text());
    if (input.schemaVersion === "1.0") return checked(input, "canonical-json", []);
    if (Array.isArray(input.topics)) return marbleFrom(input.topics, input.dependencies || []);
  }

  const topics = jsonNamed(named, "topics.json");
  const dependencies = jsonNamed(named, "dependencies.json");
  if (topics) return marbleFrom(topics, dependencies || []);

  const nodesJson = jsonNamed(named, "nodes.json");
  const linksJson = jsonNamed(named, "links.json");
  if (nodesJson && linksJson) {
    const clustersJson = jsonNamed(named, "clusters.json") || inferClusters(nodesJson);
    return checked({ schemaVersion: "1.0", meta: { id: "split-import", title: "Split JSON import", version: "1.0.0" }, clusters: clustersJson, nodes: nodesJson, links: linksJson }, "split-json", []);
  }

  const nodesCsv = named.get("nodes.csv");
  const linksCsv = named.get("links.csv");
  if (nodesCsv && linksCsv) {
    const nodes: GraphNode[] = csvRows(nodesCsv.text).map((row) => ({ id: row.id, label: row.label || row.id, cluster: row.cluster || "unassigned", value: row.value ? Number(row.value) : undefined, level: row.level ? Number(row.level) : undefined, color: row.color || undefined, metadata: metadataFrom(row) }));
    const links: GraphLink[] = csvRows(linksCsv.text).map((row) => ({ id: row.id || undefined, source: row.source, target: row.target, type: row.type || "related", weight: row.weight ? Number(row.weight) : 1, directed: /^(true|1|yes)$/i.test(row.directed), metadata: metadataFrom(row) }));
    return checked({ schemaVersion: "1.0", meta: { id: "csv-import", title: "CSV import", version: "1.0.0" }, clusters: inferClusters(nodes), nodes, links }, "csv", []);
  }
  throw new Error("Formato não reconhecido. Use dataset canônico JSON; nodes.json + links.json; nodes.csv + links.csv; ou topics.json + dependencies.json.");
}

function jsonNamed(files: Map<string, { text: string }>, name: string) { const item = files.get(name); return item ? JSON.parse(item.text) : undefined; }
function inferClusters(nodes: GraphNode[]): ClusterDefinition[] { return [...new Set(nodes.map((node) => node.cluster || "unassigned"))].map((id) => ({ id, label: id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) })); }
function checked(dataset: GraphDataset, adapter: string, warnings: string[]): ImportResult { const result = validateDataset(dataset); if (!result.valid) throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")); return { dataset, adapter, warnings: [...warnings, ...result.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)] }; }

function marbleFrom(topics: Array<Record<string, unknown>>, dependencies: Array<Record<string, unknown>>): ImportResult {
  const warnings: string[] = [];
  const nodes: GraphNode[] = topics.map((topic, index) => {
    const id = String(topic.id || topic.topicId || `topic-${index + 1}`);
    const cluster = String(topic.subject || topic.domain || "unassigned");
    const start = Number(topic.ageRangeStart ?? topic.level ?? 0);
    const end = Number(topic.ageRangeEnd ?? start);
    if (!topic.subject) warnings.push(`Tópico ${id} sem subject; movido para unassigned.`);
    return { id, label: String(topic.name || topic.label || id), cluster, value: Number(topic.centrality ?? topic.value ?? 1), level: (start + end) / 2, metadata: { description: topic.description, evidence: topic.evidence, type: topic.type, standards: topic.standards } };
  });
  const links: GraphLink[] = dependencies.map((dep, index) => ({ id: String(dep.id || `dependency-${index + 1}`), source: String(dep.prerequisiteId || dep.source), target: String(dep.topicId || dep.target), type: String(dep.type || "prerequisite"), weight: Number(dep.weight || 1), directed: true, metadata: { reason: dep.reason } }));
  const dataset: GraphDataset = { schemaVersion: "1.0", meta: { id: "marble-import", title: "Marble taxonomy import", version: "1.0.0", source: "https://github.com/withmarbleapp/os-taxonomy", attribution: ["Marble open-source taxonomy"] }, clusters: inferClusters(nodes), nodes, links, layout: { seed: "marble", axis: { enabled: true, field: "level", dimension: "y", strength: 0.2, label: "Age / level" } } };
  return checked(dataset, "marble", warnings);
}

export function downloadDataset(dataset: GraphDataset) {
  const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${dataset.meta.id || "graph-dataset"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

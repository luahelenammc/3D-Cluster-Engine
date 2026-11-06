import type { GraphDataset } from "../core/types";
import type { KnowledgeLedger } from "./types";
import { chunkKey } from "./chunks";

const xml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const safe = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "node";
const yaml = (value: string): string => JSON.stringify(value).replace(/\u2028|\u2029/g, " ");

export function exportGraphML(dataset: GraphDataset): string {
  const result = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '<key id="label" for="node" attr.name="label" attr.type="string"/>',
    '<key id="cluster" for="node" attr.name="cluster" attr.type="string"/>',
    '<key id="relation" for="edge" attr.name="relation" attr.type="string"/>',
    '<graph id="' + xml(dataset.meta.id) + '" edgedefault="directed">',
  ];
  for (const node of dataset.nodes) result.push('<node id="' + xml(node.id) + '"><data key="label">' + xml(node.label) + '</data><data key="cluster">' + xml(node.cluster) + '</data></node>');
  for (const link of dataset.links) result.push('<edge id="' + xml(link.id) + '" source="' + xml(link.source) + '" target="' + xml(link.target) + '" directed="' + (link.directed === false ? "false" : "true") + '"><data key="relation">' + xml(typeof link.metadata?.relation === "string" ? link.metadata.relation : link.type || "related") + '</data></edge>');
  return result.join("\n") + "\n</graph>\n</graphml>\n";
}

export interface ObsidianVaultExport { files: Record<string, string>; canvas: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }; mapping: Record<string, string> }
export function buildObsidianVaultExport(dataset: GraphDataset, ledger?: KnowledgeLedger): ObsidianVaultExport {
  if (dataset.nodes.length > 5000 || dataset.links.length > 20000) throw new Error("Grafo excede o limite seguro de exportação.");
  const mapping: Record<string, string> = {}, used = new Set<string>();
  for (const node of [...dataset.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const name = "notes/" + safe(node.label).slice(0, 55) + "-" + chunkKey(node.id) + ".md";
    if (used.has(name.toLocaleLowerCase())) throw new Error("Colisão de nomes no vault Obsidian.");
    used.add(name.toLocaleLowerCase()); mapping[node.id] = name;
  }
  const names = new Map(dataset.nodes.map((node) => [node.id, node.label]));
  const canvas = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
  const files: Record<string, string> = {};
  dataset.nodes.forEach((node, index) => {
    const refs = (ledger?.assertions || []).filter((item) => item.subjectId === node.id || item.objectId === node.id);
    const outgoing = dataset.links.filter((link) => link.source === node.id || link.directed === false && link.target === node.id);
    const links = outgoing.map((link) => {
      const opposite = link.source === node.id ? link.target : link.source;
      const label = typeof link.metadata?.relation === "string" ? link.metadata.relation : link.type || "related";
      return "- " + label + ": [[" + mapping[opposite].slice(6, -3) + "|" + (names.get(opposite) || opposite).replaceAll("[", "").replaceAll("]", "").replaceAll("|", "") + "]]";
    });
    const citations = refs.flatMap((item) => item.evidence).slice(0, 30).map((ref) => "- " + ref.path + (ref.anchor ? "#" + ref.anchor : "") + " · " + ref.fingerprint.slice(0, 12));
    const note = [
      "---", "id: " + yaml(node.id), "cluster: " + yaml(node.cluster), "source_graph: " + yaml(dataset.meta.id),
      "knowledge_engine: " + yaml("1.0"), "---", "# " + node.label.replace(/[\r\n]/g, " "), "",
      "## Relações", ...(links.length ? links : ["Nenhuma relação declarada."]), "",
      "## Proveniência", ...(citations.length ? citations : ["Sem evidência específica no ledger exportado."]), "",
    ].join("\n");
    files[mapping[node.id]] = note;
    canvas.nodes.push({ id: "c-" + chunkKey(node.id), type: "file", file: mapping[node.id], x: node.position?.x ?? (index % 12) * 350, y: node.position?.y ?? Math.floor(index / 12) * 250, width: 300, height: 200 });
  });
  for (const link of dataset.links) {
    canvas.edges.push({ id: "e-" + chunkKey(link.id), fromNode: "c-" + chunkKey(link.source), toNode: "c-" + chunkKey(link.target), label: typeof link.metadata?.relation === "string" ? link.metadata.relation : link.type || "related" });
  }
  files["knowledge-graph.canvas"] = JSON.stringify(canvas, null, 2);
  files["identity-map.json"] = JSON.stringify({ datasetId: dataset.meta.id, mapping, schemaVersion: dataset.schemaVersion }, null, 2);
  files["graph.graphml"] = exportGraphML(dataset);
  files["README.md"] = "# Knowledge Engine / Obsidian\n\nExportação derivada do grafo canônico. Este vault não contém o texto original das fontes.\nOs links representam relações declaradas, não validação independente.\n";
  return { files, canvas, mapping };
}

export interface GraphifyImportPreview {
  nodes: Array<{ id: string; label: string }>;
  links: Array<{ source: string; target: string; type: string }>;
  warnings: string[];
  verified: false;
}
export function previewGraphifyImport(raw: unknown): GraphifyImportPreview {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Arquivo Graphify deve conter um objeto JSON.");
  const input = raw as Record<string, unknown>;
  if (!Array.isArray(input.nodes) || !Array.isArray(input.links) || input.nodes.length > 5000 || input.links.length > 20000) throw new Error("Graphify JSON ausente ou excede os limites de importação.");
  const nodes = input.nodes.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Nó Graphify malformado.");
    const node = entry as Record<string, unknown>;
    const id = String(node.id ?? "");
    const label = String(node.label ?? node.name ?? id);
    if (!id || id.length > 500 || !label || label.length > 500) throw new Error("Nó Graphify possui identidade inválida.");
    return { id, label };
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error("Graphify JSON contém IDs duplicados.");
  const links = input.links.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Relação Graphify malformada.");
    const edge = entry as Record<string, unknown>;
    const source = typeof edge.source === "object" && edge.source ? String((edge.source as Record<string, unknown>).id) : String(edge.source ?? "");
    const target = typeof edge.target === "object" && edge.target ? String((edge.target as Record<string, unknown>).id) : String(edge.target ?? "");
    if (!ids.has(source) || !ids.has(target)) throw new Error("Graphify contém relação com referência órfã.");
    return { source, target, type: String(edge.type ?? edge.relation ?? "unverified").slice(0, 200) };
  });
  return { nodes, links, warnings: ["Prévia não verificada: Graphify não fornece automaticamente proveniência válida para aceitação canônica.", "Importação não altera o GraphStore e requer revisão humana das fontes e relações."], verified: false };
}

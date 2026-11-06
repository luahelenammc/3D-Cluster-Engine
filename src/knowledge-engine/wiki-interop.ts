import type { ManagedWiki } from "./wiki";
import { chunkKey } from "./chunks";
import { createLocalZip } from "./zip";

const escapeName = (name: string): string => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 55) || "concept";
const safeContent = (value: string) => value.replace(/\r/g, "").slice(0, 8000);
export interface WikiVaultBundle { files: Record<string, string>; identityMap: Record<string, string> }
export function exportManagedWikiVault(wiki: ManagedWiki): WikiVaultBundle {
  if (wiki.pages.length > 2000) throw new Error("Exportação excede 2.000 páginas.");
  const files: Record<string, string> = {}, identityMap: Record<string, string> = {};
  for (const page of wiki.pages) {
    const filename = "pages/" + escapeName(page.title) + "-" + chunkKey(page.pageId) + ".md";
    if (files[filename]) throw new Error("Colisão de nomes de páginas.");
    identityMap[page.pageId] = filename;
  }
  const namesByNodeId = new Map(wiki.pages.map((page) => [page.nodeId, identityMap[page.pageId]?.slice(6, -3)]));
  // The canonical wiki uses graph node IDs, while Obsidian resolves page filenames.
  // Rewrite only the exported copy, so the canonical IDs and evidence remain unchanged.
  const renderObsidianLinks = (body: string) => body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (original, id: string, label: string) => {
    const filename = namesByNodeId.get(id);
    return filename ? "[[" + filename + "|" + label.replaceAll("|", " ") + "]]" : original;
  });
  const canvas = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
  wiki.pages.forEach((page, i) => {
    const filename = identityMap[page.pageId];
    files[filename] = [
      "---", "id: " + JSON.stringify(page.nodeId), "wiki_revision: " + page.revision,
      "epistemic_status: " + page.status, "managed_by: lms3d", "---",
      renderObsidianLinks(safeContent(page.body)), page.authorNote ? "\n## Nota humana\n" + safeContent(page.authorNote) : "",
    ].join("\n");
    canvas.nodes.push({ id: "w-" + chunkKey(page.pageId), type: "file", file: filename,
      x: (i % 10) * 340, y: Math.floor(i / 10) * 260, width: 300, height: 210 });
  });
  const added = new Set<string>();
  for (const page of wiki.pages) for (const other of page.backlinks) {
    const from = "wiki:" + other;
    if (!identityMap[from]) continue;
    const key = from + "\0" + page.pageId;
    if (added.has(key)) continue;
    added.add(key);
    canvas.edges.push({ id: "e-" + chunkKey(key), fromNode: "w-" + chunkKey(from),
      toNode: "w-" + chunkKey(page.pageId), fromSide: "right", toSide: "left" });
  }
  files["knowledge.canvas"] = JSON.stringify(canvas, null, 2);
  files["identity-map.json"] = JSON.stringify({ wikiRevision: wiki.revision, datasetId: wiki.datasetId, identityMap }, null, 2);
  files["wiki-snapshot.json"] = JSON.stringify(wiki, null, 2);
  files["index.md"] = "# Managed Wiki\n\n" + wiki.pages.map((page) => "- [[" + identityMap[page.pageId].slice(6, -3) + "|" + page.title.replaceAll("|", "") + "]] · " + page.status).join("\n");
  files["log.md"] = "# Compilação\n\n" + wiki.log.map((item) => "- " + item.at + " · " + item.action + " · revisão " + item.revision + " · " + item.pageIds.join(", ")).join("\n");
  files["README.md"] = "# LMS3D Managed Wiki\n\nExportação local revisável. Fontes originais não foram incluídas.\nNÃO trate a wiki derivada como fonte soberana.\nO Canvas é uma projeção estática: alterações nele não reescrevem o dataset.\n";
  return { files, identityMap };
}
export function exportManagedWikiZip(wiki: ManagedWiki): Blob {
  return createLocalZip(exportManagedWikiVault(wiki).files);
}
export interface CanvasPreview { valid: boolean; fileNodes: number; edges: number; warnings: string[]; referencedFiles: string[] }
export function previewCanvas(raw: unknown, filenames: string[]): CanvasPreview {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Canvas deve ser um objeto JSON.");
  const data = raw as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges) || data.nodes.length > 2000 || data.edges.length > 10000) throw new Error("Canvas inválido ou excede os limites.");
  const ids = new Set<string>(), references: string[] = [];
  for (const item of data.nodes) {
    if (!item || typeof item !== "object") throw new Error("Nó malformado.");
    const node = item as Record<string, unknown>;
    if (typeof node.id !== "string" || ids.has(node.id) || !["text", "file", "link", "group"].includes(String(node.type))) throw new Error("ID/tipo inválido ou duplicado no Canvas.");
    ids.add(node.id);
    if ([node.x, node.y, node.width, node.height].some((v) => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1_000_000)) throw new Error("Coordenadas inválidas.");
    if (node.type === "file") {
      const name = String(node.file || "");
      if (!name || name.startsWith("/") || name.split("/").includes("..") || name.includes("\\")) throw new Error("Path Canvas inseguro.");
      references.push(name);
    }
  }
  for (const item of data.edges) {
    if (!item || typeof item !== "object") throw new Error("Aresta malformada.");
    const edge = item as Record<string, unknown>;
    if (!ids.has(String(edge.fromNode)) || !ids.has(String(edge.toNode))) throw new Error("Aresta com referência órfã.");
  }
  const files = new Set(filenames);
  return { valid: true, fileNodes: references.length, edges: data.edges.length,
    warnings: [...new Set(references.filter((name) => !files.has(name)))].map((name) => "Arquivo referenciado indisponível: " + name),
    referencedFiles: references };
}
/** Only read-only preview; no parsing a .canvas implies permission to mutate the source graph. */

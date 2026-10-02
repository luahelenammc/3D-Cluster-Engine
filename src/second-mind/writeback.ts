import type { GraphNode } from "../core/types";
import { normalizeVaultPath } from "./markdown";
import type { SourceManifest, SourceRecord, WritebackProposal } from "./types";

function getSourceRef(node: GraphNode): { sourceId: string; anchor?: string } | undefined {
  const metadata = node.metadata?.secondMind;
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = metadata as Record<string, unknown>;
  if (typeof value.sourceId === "string") return { sourceId: value.sourceId, anchor: typeof value.anchor === "string" ? value.anchor : undefined };
  const refs = value.sourceRefs;
  if (!Array.isArray(refs)) return undefined;
  const ref = refs.find((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).sourceId === "string") as Record<string, unknown> | undefined;
  return ref ? { sourceId: String(ref.sourceId), anchor: typeof ref.anchor === "string" ? ref.anchor : undefined } : undefined;
}

function managedBlock(node: GraphNode): string {
  const tags = (node.tags || []).map((tag) => `- ${tag}`).join("\n") || "- (sem tags)";
  return [
    `<!-- lms3d:node:${node.id} -->`,
    `### ${node.label}`,
    `- Node ID: \`${node.id}\``,
    `- Cluster: \`${node.cluster}\``,
    "- Tags:",
    tags,
    `<!-- /lms3d:node:${node.id} -->`,
  ].join("\n");
}

export function createWritebackProposal(node: GraphNode, manifest: SourceManifest): WritebackProposal {
  const ref = getSourceRef(node);
  if (!ref) throw new Error("Este nó não tem proveniência Markdown suficiente para propor writeback.");
  const source: SourceRecord | undefined = manifest.sources.find((item) => item.sourceId === ref.sourceId);
  if (!source) throw new Error("A nota de origem não está na manifestação local atual.");
  if (normalizeVaultPath(source.path) !== source.path) throw new Error("O caminho da nota não passou pela validação de segurança.");
  const escapedId = node.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(`<!-- lms3d:node:${escapedId} -->[\\s\\S]*?<!-- \\/lms3d:node:${escapedId} -->`);
  const before = marker.exec(source.content)?.[0] || "";
  const after = managedBlock(node);
  const diff = [
    `--- a/${source.path}`,
    `+++ b/${source.path}`,
    `@@ target: ${ref.anchor ? `#${ref.anchor}` : "end-of-file"} @@`,
    ...(before ? before.split("\n").map((line) => `-${line}`) : ["(append managed block)"].map((line) => `-${line}`)),
    ...after.split("\n").map((line) => `+${line}`),
  ].join("\n");
  return { proposalVersion: "1.0", proposalId: `writeback-${node.id}-${Date.now().toString(36)}`, targetSourceId: source.sourceId, targetPath: source.path, anchor: ref.anchor, nodeId: node.id, before, after, diff, capability: "patch-export-only", createdAt: new Date().toISOString() };
}

export function buildWritebackExport(proposal: WritebackProposal) {
  return {
    exportVersion: "1.0",
    mode: "patch-proposal",
    requiresHumanApplication: true,
    directWritePerformed: false,
    limitation: "A seleção de arquivos Markdown não concede capacidade de escrita no vault. Revise e aplique este patch fora da engine.",
    proposal,
  };
}

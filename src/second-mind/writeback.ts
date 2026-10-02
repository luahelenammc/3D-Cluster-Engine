import type { GraphNode } from "../core/types";
import { fingerprintText, normalizeVaultPath } from "./markdown";
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
  const safeText = (value: string) => value.replace(/[\r\n\u2028\u2029]/g, " ").replaceAll("<!--", "&lt;!--").replaceAll("-->", "--&gt;");
  const safeInlineCode = (value: string) => safeText(value).replaceAll("`", "\\`");
  const tags = (node.tags || []).map((tag) => `- ${safeText(tag)}`).join("\n") || "- (sem tags)";
  return [
    `<!-- lms3d:node:${node.id} -->`,
    `### ${safeText(node.label)}`,
    `- Node ID: \`${safeInlineCode(node.id)}\``,
    `- Cluster: \`${safeInlineCode(node.cluster)}\``,
    "- Tags:",
    tags,
    `<!-- /lms3d:node:${node.id} -->`,
  ].join("\n");
}

export function createWritebackProposal(node: GraphNode, manifest: SourceManifest, writableHandleAvailable = false): WritebackProposal {
  if (/[<>\r\n\u2028\u2029]/.test(node.id)) throw new Error("O ID do nó não é seguro para um marcador Markdown gerenciado.");
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
  return { proposalVersion: "1.0", proposalId: `writeback-${node.id}-${Date.now().toString(36)}`, targetSourceId: source.sourceId, targetPath: source.path, anchor: ref.anchor, nodeId: node.id, before, after, diff, sourceFingerprint: source.fingerprint, capability: writableHandleAvailable ? "direct-write-candidate" : "patch-export-only", createdAt: new Date().toISOString() };
}

export interface WritebackAdapter {
  requestWritePermission(): Promise<boolean>;
  readCurrent(): Promise<string>;
  write(content: string): Promise<void>;
}

export type WritebackApplyResult =
  | { status: "permission-denied" }
  | { status: "conflict"; currentFingerprint: string }
  | { status: "verification-failed"; expectedFingerprint: string; actualFingerprint: string }
  | { status: "written"; content: string; fingerprint: string };

export function applyManagedWriteback(current: string, proposal: WritebackProposal): string {
  const marker = `<!-- lms3d:node:${proposal.nodeId} -->`;
  const closing = `<!-- /lms3d:node:${proposal.nodeId} -->`;
  const newline = current.includes("\r\n") ? "\r\n" : "\n";
  const managed = proposal.after.replaceAll("\r\n", "\n").replaceAll("\n", newline);
  if (proposal.before) {
    const matches = current.split(proposal.before).length - 1;
    if (matches !== 1 || !proposal.before.includes(marker) || !proposal.before.includes(closing)) throw new Error("O bloco gerenciado não corresponde ao alvo único da proposta.");
    return current.replace(proposal.before, managed);
  }
  if (current.includes(marker) || current.includes(closing)) throw new Error("Já existe um bloco gerenciado para este nó; regenere a proposta.");
  const prefix = current.length === 0 || current.endsWith("\n") ? "" : newline;
  return `${current}${prefix}${managed}${newline}`;
}

export async function applyWritebackSafely(proposal: WritebackProposal, adapter: WritebackAdapter): Promise<WritebackApplyResult> {
  if (!(await adapter.requestWritePermission())) return { status: "permission-denied" };
  const current = await adapter.readCurrent();
  const currentFingerprint = await fingerprintText(current);
  if (currentFingerprint !== proposal.sourceFingerprint) return { status: "conflict", currentFingerprint };
  const next = applyManagedWriteback(current, proposal);
  await adapter.write(next);
  const verified = await adapter.readCurrent();
  const verifiedFingerprint = await fingerprintText(verified);
  if (verified !== next) return { status: "verification-failed", expectedFingerprint: await fingerprintText(next), actualFingerprint: verifiedFingerprint };
  return { status: "written", content: verified, fingerprint: verifiedFingerprint };
}

export function buildWritebackExport(proposal: WritebackProposal) {
  return {
    exportVersion: "1.0",
    mode: "patch-proposal",
    requiresHumanApplication: true,
    directWritePerformed: false,
    limitation: proposal.capability === "patch-export-only" ? "Este navegador ou esta sessão não tem um handle de vault com capacidade de escrita autorizada. Revise e aplique este patch fora da engine." : undefined,
    proposal,
  };
}

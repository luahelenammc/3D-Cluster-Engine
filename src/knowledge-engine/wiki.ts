import type { GraphDataset } from "../core/types";
import type { SourceManifest } from "../second-mind/types";
import { evaluateAssertion } from "./ledger";
import type { KnowledgeLedger, KnowledgeEvidence } from "./types";

export type WikiPageStatus = "sourced" | "structural" | "stale";
export interface WikiCitation { sourceId: string; path: string; fingerprint: string; quote: string; anchor?: string; lineStart?: number; lineEnd?: number }
export interface ManagedWikiPage {
  pageId: string; nodeId: string; title: string; kind: "concept"; body: string;
  citations: WikiCitation[]; relationIds: string[]; backlinks: string[];
  status: WikiPageStatus; sourceKey: string; revision: number; updatedAt: string;
  authorNote?: string;
}
export interface WikiRevision { revision: number; manifestFingerprint: string; pages: ManagedWikiPage[]; recordedAt: string }
export interface WikiEvent { eventId: string; at: string; revision: number; action: "compiled" | "annotated" | "restored"; pageIds: string[] }
export interface ManagedWiki {
  wikiVersion: "1.0"; datasetId: string; vaultId: string; manifestFingerprint: string;
  revision: number; pages: ManagedWikiPage[]; history: WikiRevision[]; log: WikiEvent[];
  updatedAt: string;
}
export interface WikiChange { pageId: string; action: "add" | "revise" | "stale"; before?: ManagedWikiPage; after: ManagedWikiPage }
export interface WikiPlan {
  datasetId: string; baseRevision: number; vaultId: string; manifestFingerprint: string;
  changes: WikiChange[]; unchanged: string[]; retired: string[]; errors: string[];
}
const MAX_PAGES = 2000;
const normalized = (value: string): string => value.replace(/\s+/g, " ").trim();
const citeKey = (value: WikiCitation): string => value.sourceId + "\0" + value.fingerprint + "\0" + value.quote;
const sourceBinding = (value: KnowledgeEvidence): WikiCitation => ({
  sourceId: value.sourceId, path: value.path, fingerprint: value.fingerprint, quote: value.quote,
  ...(value.anchor ? { anchor: value.anchor } : {}),
  ...(value.lineStart ? { lineStart: value.lineStart } : {}),
  ...(value.lineEnd ? { lineEnd: value.lineEnd } : {}),
});
function candidatePages(dataset: GraphDataset, manifest: SourceManifest, ledger: KnowledgeLedger, now: string): ManagedWikiPage[] {
  const nodes = dataset.nodes.slice(0, MAX_PAGES);
  const names = new Map(dataset.nodes.map((node) => [node.id, node.label]));
  const neighbors = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const backlinks = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const citations = new Map(nodes.map((node) => [node.id, [] as WikiCitation[]]));
  const relationIds = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const assertion of ledger.assertions) {
    if (assertion.reviewStatus !== "accepted" || assertion.epistemicStatus === "superseded") continue;
    const subject = assertion.subjectId, object = assertion.objectId;
    if (!names.has(subject) || !names.has(object)) continue;
    const healthy = evaluateAssertion(assertion, manifest).health === "current";
    if (healthy) for (const nodeId of [subject, object]) {
      const list = citations.get(nodeId);
      if (!list) continue;
      for (const source of assertion.evidence) {
        const bound = sourceBinding(source);
        if (!list.some((item) => citeKey(item) === citeKey(bound))) list.push(bound);
      }
    }
    const targetName = names.get(object) || object;
    neighbors.get(subject)?.push("- " + normalized(assertion.predicate).slice(0, 120) + " → [[" + object + "|" + targetName.replaceAll("|", " ") + "]]" + (healthy ? " [cited]" : " [unverified]"));
    backlinks.get(object)?.push(subject);
    relationIds.get(subject)?.push(assertion.assertionId);
    relationIds.get(object)?.push(assertion.assertionId);
  }
  return nodes.map((node) => {
    const proofs = (citations.get(node.id) || []).slice(0, 60);
    const lines = [
      "# " + node.label.replace(/[\r\n]/g, " "),
      "",
      "## Relações revisadas",
      ...(neighbors.get(node.id)?.length ? neighbors.get(node.id)! : ["Nenhuma relação revisada encontrada."]),
      "",
      "## Evidências vinculadas",
      ...(proofs.length ? proofs.map((e) => "- " + e.path + (e.anchor ? "#" + e.anchor : "") + " [" + e.fingerprint.slice(0, 14) + "] \u2014 " + normalized(e.quote).slice(0, 240)) : ["Sem evidência citável no manifesto atual."]),
      "",
      "## Backlinks",
      ...((backlinks.get(node.id) || []).length ? [...new Set(backlinks.get(node.id))].map((id) => "- [[" + id + "|" + (names.get(id) || id).replaceAll("|", " ") + "]]") : ["Nenhum backlink conhecido."]),
    ];
    const body = lines.join("\n");
    const sourceKey = JSON.stringify({ body, citations: proofs, relations: relationIds.get(node.id) });
    return {
      pageId: "wiki:" + node.id, nodeId: node.id, title: node.label,
      kind: "concept" as const, body, citations: proofs,
      relationIds: [...new Set(relationIds.get(node.id) || [])].sort(),
      backlinks: [...new Set(backlinks.get(node.id) || [])].sort(),
      status: proofs.length ? "sourced" as const : "structural" as const,
      sourceKey, revision: 1, updatedAt: now,
    };
  });
}
export function planWikiCompilation(dataset: GraphDataset, manifest: SourceManifest, ledger: KnowledgeLedger, wiki?: ManagedWiki, at = new Date().toISOString()): WikiPlan {
  const errors: string[] = [];
  if (ledger.datasetId !== dataset.meta.id) errors.push("O ledger não pertence ao dataset.");
  if (wiki && (wiki.datasetId !== dataset.meta.id || wiki.vaultId !== manifest.vaultId)) errors.push("Snapshot da wiki não corresponde ao dataset/vault.");
  if (dataset.nodes.length > MAX_PAGES) errors.push("Compilação limitada a 2.000 nós por rodada; selecione um dataset menor.");
  const changes: WikiChange[] = [], unchanged: string[] = [];
  if (!errors.length) {
    const prior = new Map(wiki?.pages.map((page) => [page.pageId, page]) || []);
    for (const page of candidatePages(dataset, manifest, ledger, at)) {
      const old = prior.get(page.pageId);
      if (old?.sourceKey === page.sourceKey && old.status === page.status) { unchanged.push(page.pageId); continue; }
      const lostProof = Boolean(old?.citations.length) && !page.citations.length;
      const replacement: ManagedWikiPage = { ...page, status: lostProof ? "stale" : page.status, revision: (old?.revision || 0) + 1, authorNote: old?.authorNote };
      changes.push({ pageId: page.pageId, action: !old ? "add" : lostProof ? "stale" : "revise", before: old, after: replacement });
    }
  }
  const present = new Set(dataset.nodes.map((node) => "wiki:" + node.id));
  return { datasetId: dataset.meta.id, baseRevision: wiki?.revision || 0, vaultId: manifest.vaultId, manifestFingerprint: manifest.fingerprint, changes, unchanged,
    retired: (wiki?.pages || []).filter((page) => !present.has(page.pageId)).map((page) => page.pageId), errors };
}

/** Accept exactly selected changes. Non-selected revisions and removed pages are preserved. */
export function commitWikiPlan(plan: WikiPlan, selected: string[], previous?: ManagedWiki, at = new Date().toISOString()): ManagedWiki {
  if (plan.errors.length) throw new Error(plan.errors.join("; "));
  if (previous && (previous.revision !== plan.baseRevision || previous.vaultId !== plan.vaultId || previous.datasetId !== plan.datasetId)) throw new Error("Snapshot alterado; recompile antes de aplicar.");
  if (!previous && plan.baseRevision !== 0) throw new Error("A revisão inicial não corresponde.");
  const accepted = new Set(selected);
  if (accepted.size !== selected.length || selected.some((id) => !plan.changes.some((change) => change.pageId === id))) throw new Error("Seleção de mudanças inválida.");
  if (!selected.length) throw new Error("Selecione pelo menos uma página para aprovar.");
  const pages = new Map(previous?.pages.map((page) => [page.pageId, page]) || []);
  for (const change of plan.changes) if (accepted.has(change.pageId)) pages.set(change.pageId, { ...change.after, updatedAt: at });
  const revision = (previous?.revision || 0) + 1;
  const history = previous ? [...previous.history, { revision: previous.revision, manifestFingerprint: previous.manifestFingerprint, pages: previous.pages, recordedAt: previous.updatedAt }].slice(-6) : [];
  return { wikiVersion: "1.0", datasetId: plan.datasetId, vaultId: plan.vaultId, manifestFingerprint: plan.manifestFingerprint,
    revision, pages: [...pages.values()].sort((a, b) => a.pageId.localeCompare(b.pageId)), history,
    log: [...(previous?.log || []), { eventId: "rev:" + revision, at, revision, action: "compiled" as const, pageIds: [...accepted] }].slice(-200),
    updatedAt: at,
  };
}
export function annotateWikiPage(wiki: ManagedWiki, pageId: string, authorNote: string, at = new Date().toISOString()): ManagedWiki {
  if (authorNote.length > 4000) throw new Error("Nota humana excede 4.000 caracteres.");
  if (!wiki.pages.some((p) => p.pageId === pageId)) throw new Error("Página desconhecida.");
  const revision = wiki.revision + 1;
  return { ...wiki, revision, pages: wiki.pages.map((p) => p.pageId === pageId ? { ...p, authorNote, revision: p.revision + 1, updatedAt: at } : p),
    history: [...wiki.history, { revision: wiki.revision, pages: wiki.pages, manifestFingerprint: wiki.manifestFingerprint, recordedAt: wiki.updatedAt }].slice(-6),
    log: [...wiki.log, { eventId: "rev:" + revision, revision, at, action: "annotated" as const, pageIds: [pageId] }].slice(-200), updatedAt: at };
}
export function restoreWikiRevision(wiki: ManagedWiki, revision: number, at = new Date().toISOString()): ManagedWiki {
  const target = wiki.history.find((h) => h.revision === revision);
  if (!target) throw new Error("Revisão histórica indisponível.");
  const next = wiki.revision + 1;
  return { ...wiki, revision: next, pages: target.pages,
    manifestFingerprint: target.manifestFingerprint,
    history: [...wiki.history, { revision: wiki.revision, pages: wiki.pages, manifestFingerprint: wiki.manifestFingerprint, recordedAt: wiki.updatedAt }].slice(-6),
    log: [...wiki.log, { eventId: "rev:" + next, revision: next, at, action: "restored" as const, pageIds: target.pages.map((p) => p.pageId) }].slice(-200), updatedAt: at };
}
export function wikiHealth(wiki: ManagedWiki, manifest: SourceManifest) {
  const active = new Map(manifest.sources.map((s) => [s.sourceId, s.fingerprint]));
  const stale = wiki.pages.filter((page) => page.status === "stale" || page.citations.some((c) => active.get(c.sourceId) !== c.fingerprint));
  return { pages: wiki.pages.length, cited: wiki.pages.filter((page) => page.citations.length > 0).length,
    staleIds: stale.map((page) => page.pageId), revision: wiki.revision };
}

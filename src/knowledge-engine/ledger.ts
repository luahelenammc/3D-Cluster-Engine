import type { GraphDataset } from "../core/types";
import type { GraphDeltaProposal, SourceManifest } from "../second-mind/types";
import { chunkKey } from "./chunks";
import type { EvidenceAssessment, KnowledgeAssertion, KnowledgeEvidence, KnowledgeLedger, ReviewStatus } from "./types";

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();

export function validateEvidence(evidence: KnowledgeEvidence, manifest?: SourceManifest): string[] {
  const errors: string[] = [];
  if (!evidence || typeof evidence !== "object" || !evidence.sourceId || !evidence.quote || !evidence.fingerprint || !evidence.path) return ["Evidência sem fonte, citação, caminho ou fingerprint."];
  if (!manifest) return ["Manifesto de fontes não disponível para conferência."];
  const source = manifest.sources.find((item) => item.sourceId === evidence.sourceId);
  if (!source) return ["Fonte não encontrada no manifesto vigente."];
  if (source.fingerprint !== evidence.fingerprint || source.path !== evidence.path) errors.push("Fingerprint ou caminho divergente da fonte atual.");
  const quote = clean(evidence.quote);
  if (!quote || !clean(source.content).includes(quote)) errors.push("Citação não encontrada literalmente na fonte atual.");
  if (evidence.anchor && !source.headings.some((heading) => heading.anchor === evidence.anchor)) errors.push("Âncora não encontrada.");
  if (evidence.lineStart !== undefined || evidence.lineEnd !== undefined) {
    const lines = source.content.split(/\r?\n/);
    const start = evidence.lineStart, end = evidence.lineEnd;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start! < 1 || end! < start! || end! > lines.length) errors.push("Intervalo de linhas inválido.");
    else if (!clean(lines.slice(start! - 1, end!).join(" ")).includes(quote)) errors.push("Citação fora do intervalo de linhas declarado.");
  }
  return errors;
}

export function evaluateAssertion(assertion: KnowledgeAssertion, manifest?: SourceManifest): EvidenceAssessment {
  const invalidEvidence = (assertion.evidence || []).flatMap((evidence) => validateEvidence(evidence, manifest).map((reason) => ({ sourceId: evidence.sourceId, reason })));
  const unsupported = !assertion.evidence?.length || assertion.confidence < 0 || assertion.confidence > 1 || !assertion.subjectId || !assertion.objectId || !assertion.predicate;
  return { assertionId: assertion.assertionId, health: unsupported ? "unsupported" : invalidEvidence.length ? "stale" : "current", invalidEvidence };
}

/** Existing canonical links are never rewritten by an uncertain extraction. */
export function ledgerFromGraph(dataset: GraphDataset, manifest?: SourceManifest): KnowledgeLedger {
  const assertions: KnowledgeAssertion[] = dataset.links.map((link) => {
    const raw = link.metadata?.secondMind;
    const secondMind = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const value = Array.isArray(secondMind.evidence) ? secondMind.evidence : [];
    const evidence = value.filter((item): item is KnowledgeEvidence => Boolean(item && typeof item === "object" && typeof (item as KnowledgeEvidence).sourceId === "string" && typeof (item as KnowledgeEvidence).quote === "string"));
    const rawStatus = String(secondMind.epistemicStatus || "declared");
    const epistemicStatus = ["declared", "derived", "inferred", "contested", "superseded"].includes(rawStatus) ? rawStatus as KnowledgeAssertion["epistemicStatus"] : rawStatus === "explicit" ? "declared" : "derived";
    return {
      assertionId: "link:" + link.id,
      subjectId: link.source,
      predicate: typeof link.metadata?.relation === "string" ? link.metadata.relation : link.type || "related",
      objectId: link.target,
      relationFamily: link.type || "related",
      directed: link.directed === true,
      evidence,
      epistemicStatus,
      reviewStatus: "accepted" as const,
      confidence: typeof secondMind.confidence === "number" ? secondMind.confidence : evidence.length ? 1 : 0.5,
      extractedBy: { provider: "canonical-graph", version: dataset.meta.version, privacy: "local" as const, recordedAt: manifest?.createdAt || "1970-01-01T00:00:00.000Z" },
    };
  });
  return { ledgerVersion: "1.0", datasetId: dataset.meta.id, sourceManifestFingerprint: manifest?.fingerprint, assertions, decisions: [] };
}

export function ledgerFromProposal(proposal: GraphDeltaProposal, manifest: SourceManifest): KnowledgeAssertion[] {
  return proposal.operations.flatMap((operation) => {
    if (operation.kind !== "add-link") return [];
    const evidence = operation.evidence.map((item) => ({ ...item }));
    const assertion: KnowledgeAssertion = {
      assertionId: "candidate:" + chunkKey(proposal.proposalId + ":" + operation.operationId),
      subjectId: operation.link.source,
      objectId: operation.link.target,
      predicate: typeof operation.link.metadata?.relation === "string" ? operation.link.metadata.relation : operation.link.type || "related",
      relationFamily: operation.link.type || "related",
      directed: operation.link.directed === true,
      evidence,
      epistemicStatus: operation.epistemicStatus === "explicit" ? "declared" : operation.epistemicStatus,
      reviewStatus: "proposed",
      confidence: operation.confidence,
      extractedBy: { provider: proposal.compiler, version: proposal.proposalVersion, privacy: proposal.compiler === "external-import" ? "imported" : proposal.compiler === "ai-bridge" ? "authorized-remote" : "local", recordedAt: proposal.createdAt },
    };
    return evaluateAssertion(assertion, manifest).health === "current" ? [assertion] : [];
  });
}

export function decideAssertion(ledger: KnowledgeLedger, assertionId: string, status: ReviewStatus, note = ""): KnowledgeLedger {
  if (!["proposed", "accepted", "rejected", "needs_review"].includes(status)) throw new Error("Decisão inválida.");
  if (!ledger.assertions.some((a) => a.assertionId === assertionId)) throw new Error("Afirmação não pertence ao ledger.");
  return {
    ...ledger,
    assertions: ledger.assertions.map((item) => item.assertionId === assertionId ? { ...item, reviewStatus: status } : item),
    decisions: [...ledger.decisions, { assertionId, status, at: new Date().toISOString(), note: note.slice(0, 500) }],
  };
}

export function auditLedger(ledger: KnowledgeLedger, manifest?: SourceManifest) {
  const assessments = ledger.assertions.map((item) => evaluateAssertion(item, manifest));
  const evidenceCoverage = ledger.assertions.length ? assessments.filter((item) => item.health === "current").length / ledger.assertions.length : 1;
  return { assessments, evidenceCoverage, verified: assessments.filter((item) => item.health === "current").length, stale: assessments.filter((item) => item.health === "stale").length, unsupported: assessments.filter((item) => item.health === "unsupported").length };
}

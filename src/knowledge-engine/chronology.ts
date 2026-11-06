import type { KnowledgeAssertion } from "./types";
import type { ManagedWiki } from "./wiki";

export interface TemporalObservation {
  observationId: string;
  assertionId: string;
  observedAt: string;
  validFrom?: string;
  validUntil?: string;
  interpretation: "confirmed" | "contested" | "superseded" | "uncertain";
  note: string;
  sourceFingerprints: string[];
  reviewStatus: "human-reviewed";
  evidenceAvailable: boolean;
}
export interface TemporalInput {
  assertionId: string;
  validFrom?: string;
  validUntil?: string;
  interpretation: TemporalObservation["interpretation"];
  note: string;
}
function dateCheck(value?: string): boolean {
  return value === undefined || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T00:00:00Z").getTime()) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
/** Human-entered effective dates: source prose is never mined for chronology implicitly. */
export function recordTemporalObservation(wiki: ManagedWiki, accepted: KnowledgeAssertion[], input: TemporalInput, at = new Date().toISOString()): ManagedWiki {
  const assertion = accepted.find((item) => item.assertionId === input.assertionId && item.reviewStatus === "accepted");
  if (!assertion) throw new Error("Só afirmações canônicas aceitas podem receber anotação temporal.");
  if (!dateCheck(input.validFrom) || !dateCheck(input.validUntil) || input.validFrom && input.validUntil && input.validFrom > input.validUntil) throw new Error("Período efetivo inválido.");
  if (!["confirmed", "contested", "superseded", "uncertain"].includes(input.interpretation)) throw new Error("Interpretação inválida.");
  if (!input.note.trim() || input.note.trim().length > 500) throw new Error("Justificativa temporal obrigatória (até 500 caracteres).");
  if ((wiki.temporal || []).length >= 500) throw new Error("Linha do tempo atingiu o limite de 500 registros.");
  const revision = wiki.revision + 1;
  const observation: TemporalObservation = {
    observationId: "time:" + revision, assertionId: assertion.assertionId, observedAt: at,
    ...(input.validFrom ? { validFrom: input.validFrom } : {}),
    ...(input.validUntil ? { validUntil: input.validUntil } : {}),
    interpretation: input.interpretation, note: input.note.trim(),
    sourceFingerprints: [...new Set(assertion.evidence.map((e) => e.fingerprint))],
    evidenceAvailable: assertion.evidence.length > 0,
    reviewStatus: "human-reviewed",
  };
  return {
    ...wiki, revision, updatedAt: at,
    temporal: [...(wiki.temporal || []), observation],
    history: [...wiki.history, { revision: wiki.revision, pages: wiki.pages, temporal: wiki.temporal || [], manifestFingerprint: wiki.manifestFingerprint, recordedAt: wiki.updatedAt }].slice(-6),
    log: [...wiki.log, { eventId: "rev:" + revision, action: "temporal" as const, at, revision, pageIds: [] }].slice(-200),
  };
}
export function summarizeTemporalObservations(wiki: ManagedWiki, assertionId?: string): TemporalObservation[] {
  return (wiki.temporal || []).filter((obs) => !assertionId || obs.assertionId === assertionId).slice().sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

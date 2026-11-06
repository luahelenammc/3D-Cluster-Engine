import type { GraphDataset } from "../core/types";
import type { KnowledgeAssertion } from "./types";

export function normalizeEntityAlias(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export interface EntityCandidate { leftId: string; rightId: string; reason: string; score: number; requiresReview: true }
export function suggestEntityMerges(dataset: GraphDataset): EntityCandidate[] {
  const seen = new Map<string, string[]>();
  for (const node of dataset.nodes) {
    for (const alias of [node.label, ...((node.tags || []).filter((tag) => tag.length > 3))]) {
      const normalized = normalizeEntityAlias(alias);
      if (normalized.length < 3) continue;
      const matches = seen.get(normalized) || [];
      if (!matches.includes(node.id)) matches.push(node.id);
      seen.set(normalized, matches);
    }
  }
  const keys = new Set<string>();
  const candidates: EntityCandidate[] = [];
  for (const [alias, ids] of seen) for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
    const pair = [ids[i], ids[j]].sort();
    const key = pair.join("\0");
    if (keys.has(key)) continue;
    keys.add(key);
    candidates.push({ leftId: pair[0], rightId: pair[1], reason: "Rótulo/alias compartilhado: " + alias, score: 0.8, requiresReview: true });
  }
  return candidates;
}
export interface ContradictionCandidate { leftAssertionId: string; rightAssertionId: string; reason: string; requiresReview: true }
/** Potential conflicts are reported; no source or interpretation is silently overwritten. */
export function detectAssertionContradictions(assertions: KnowledgeAssertion[]): ContradictionCandidate[] {
  const results: ContradictionCandidate[] = [];
  const active = assertions.filter((a) => a.reviewStatus !== "rejected" && a.epistemicStatus !== "superseded");
  for (let i = 0; i < active.length; i += 1) for (let j = i + 1; j < active.length; j += 1) {
    const a = active[i], b = active[j];
    const sameSubject = a.subjectId === b.subjectId;
    const samePredicate = a.predicate === b.predicate;
    const opposing = a.predicate === "not_" + b.predicate || b.predicate === "not_" + a.predicate;
    if (sameSubject && ((samePredicate && a.objectId !== b.objectId && a.relationFamily.startsWith("exclusive:")) || (opposing && a.objectId === b.objectId))) {
      results.push({ leftAssertionId: a.assertionId, rightAssertionId: b.assertionId, reason: opposing ? "Afirmações com polaridade oposta." : "Predicado exclusivo com objetos divergentes.", requiresReview: true });
    }
  }
  return results;
}

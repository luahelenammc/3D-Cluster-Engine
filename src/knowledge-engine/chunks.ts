import type { SourceManifest } from "../second-mind/types";
import type { IncrementalPlan, KnowledgeAssertion, KnowledgeChunk } from "./types";

/** Non-cryptographic change key; SHA-256 manifests remain the authority for source identity. */
export function chunkKey(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Split on Markdown heading boundaries; avoid passing whole vaults to an LLM. */
export function chunkManifest(manifest: SourceManifest, maxCharacters = 2400, overlap = 120): KnowledgeChunk[] {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 256 || maxCharacters > 12000) throw new Error("Limite de chunk inválido.");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= maxCharacters / 3) throw new Error("Sobreposição de chunk inválida.");
  const chunks: KnowledgeChunk[] = [];
  for (const source of manifest.sources) {
    const lines = source.content.split(/\r?\n/);
    let sectionStart = 0;
    let anchor: string | undefined;
    const segments: Array<{ start: number; end: number; anchor?: string }> = [];
    const flush = (end: number) => {
      if (end > sectionStart) segments.push({ start: sectionStart, end, anchor });
    };
    for (let index = 0; index < lines.length; index += 1) {
      const heading = /^\s{0,3}#{1,6}\s+(.+)/.exec(lines[index]);
      if (heading && index > sectionStart) {
        flush(index);
        sectionStart = index;
      }
      if (heading) {
        const title = heading[1].replace(/\s*#+\s*$/, "").trim();
        anchor = source.headings.find((item) => item.text === title)?.anchor;
      }
    }
    flush(lines.length);
    for (const segment of segments) {
      let first = segment.start;
      while (first < segment.end) {
        let last = first;
        let text = "";
        while (last < segment.end && (text.length + lines[last].length + 1 <= maxCharacters || last === first)) {
          text += (text ? "\n" : "") + lines[last];
          last += 1;
        }
        if (text.length > maxCharacters) text = text.slice(0, maxCharacters);
        const contentHash = chunkKey(text);
        const chunkId = "chunk:" + chunkKey(source.sourceId + "\0" + String(first) + "\0" + contentHash);
        chunks.push({ chunkId, sourceId: source.sourceId, sourceFingerprint: source.fingerprint, anchor: segment.anchor, lineStart: first + 1, lineEnd: last, text, contentHash });
        if (last >= segment.end) break;
        let carry = 0;
        let next = last;
        while (next > first + 1 && carry < overlap) { next--; carry += lines[next].length + 1; }
        first = next < last ? next : last;
      }
    }
  }
  return chunks;
}

export function planIncrementalExtraction(previous: KnowledgeChunk[], current: KnowledgeChunk[], assertions: KnowledgeAssertion[]): IncrementalPlan {
  const known = new Set(previous.map((chunk) => chunk.chunkId));
  const now = new Set(current.map((chunk) => chunk.chunkId));
  const removedChunkIds = previous.filter((chunk) => !now.has(chunk.chunkId)).map((chunk) => chunk.chunkId);
  const staleSourceIds = new Set(previous.filter((chunk) => !now.has(chunk.chunkId)).map((chunk) => chunk.sourceId));
  return {
    changed: current.filter((chunk) => !known.has(chunk.chunkId)),
    unchanged: current.filter((chunk) => known.has(chunk.chunkId)),
    removedChunkIds,
    staleAssertionIds: assertions.filter((assertion) => assertion.evidence.some((item) => staleSourceIds.has(item.sourceId)) || Boolean(assertion.extractedBy.chunkId && removedChunkIds.includes(assertion.extractedBy.chunkId))).map((item) => item.assertionId),
  };
}

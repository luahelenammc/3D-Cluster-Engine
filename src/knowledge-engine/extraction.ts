import type { GraphDataset } from "../core/types";
import type { SourceManifest } from "../second-mind/types";
import { requestGraphProposal } from "../second-mind/ai-bridge";
import { validateProposal } from "../second-mind/proposals";
import { ledgerFromProposal } from "./ledger";
import type { ExtractionResult, SemanticExtractor } from "./types";

type BridgeOptions = { endpoint: string; accessToken?: string; explicitlyAuthorized: boolean; maxChunksPerRun?: number };

/** Companion calls are opt-in, bounded, and leave the canonical graph unchanged. */
export function createBridgeSemanticExtractor(options: BridgeOptions): SemanticExtractor {
  return {
    id: "second-mind-companion",
    async extract(chunks, context): Promise<ExtractionResult> {
      if (!options.explicitlyAuthorized) throw new Error("Extração semântica exige autorização explícita do payload.");
      const max = Math.max(1, Math.min(8, options.maxChunksPerRun ?? 8));
      const acceptedChunks = chunks.slice(0, max);
      const results: ExtractionResult = { complete: chunks.length <= max, truncated: chunks.length > max, assertions: [], errors: [], provider: "second-mind-companion", proposals: [] };
      if (!acceptedChunks.length) return results;
      const graph = boundedContext(context.dataset);
      for (const chunk of acceptedChunks) {
        const source = context.manifest.sources.find((item) => item.sourceId === chunk.sourceId);
        if (!source || source.fingerprint !== chunk.sourceFingerprint) {
          results.errors.push("Chunk sem fonte vigente: " + chunk.chunkId);
          results.complete = false;
          continue;
        }
        const clippedText = chunk.text.slice(0, 3000);
        const subset: SourceManifest = { ...context.manifest, sources: [{ ...source, content: clippedText, byteLength: new TextEncoder().encode(clippedText).byteLength }] };
        try {
          const proposal = await requestGraphProposal(options.endpoint, { dataset: graph, manifest: subset, changedSourceIds: [source.sourceId] }, options.accessToken);
          const evaluated = validateProposal(proposal, context.dataset, context.manifest);
          if (!evaluated.valid) {
            results.errors.push(chunk.chunkId + ": proposta rejeitada: " + evaluated.errors.join("; "));
            results.complete = false;
            continue;
          }
          results.proposals?.push(proposal);
          const assertions = ledgerFromProposal(proposal, context.manifest).slice(0, context.maxAssertions);
          for (const assertion of assertions) assertion.extractedBy.chunkId = chunk.chunkId;
          results.assertions.push(...assertions);
          if (results.assertions.length >= context.maxAssertions) { results.truncated = true; results.complete = false; break; }
        } catch (error) {
          results.errors.push(chunk.chunkId + ": " + (error instanceof Error ? error.message : "falha de extração"));
          results.complete = false;
        }
      }
      // Empty/error-only output may not be used as proof that sources contain no relations.
      if (results.errors.length) results.complete = false;
      return results;
    },
  };
}

function boundedContext(dataset: GraphDataset): GraphDataset {
  const nodes = dataset.nodes.slice(0, 40);
  const ids = new Set(nodes.map((item) => item.id));
  const clusters = dataset.clusters.filter((item) => nodes.some((node) => node.cluster === item.id)).slice(0, 40);
  return {
    schemaVersion: "1.1",
    meta: { id: dataset.meta.id, title: dataset.meta.title.slice(0, 300), version: dataset.meta.version },
    nodes: nodes.map((node) => ({ id: node.id, label: node.label.slice(0, 300), cluster: node.cluster, tags: node.tags?.slice(0, 20) })),
    links: dataset.links.filter((link) => ids.has(link.source) && ids.has(link.target)).slice(0, 80).map((link) => ({ id: link.id, source: link.source, target: link.target, type: link.type?.slice(0, 120), directed: link.directed })),
    clusters: clusters.map((cluster) => ({ id: cluster.id, label: cluster.label.slice(0, 300) })),
  };
}

import type { GraphDataset } from "../core/types";
import type { GraphDeltaProposal, ProposalEvidence, SourceManifest } from "../second-mind/types";

export type EpistemicStatus = "declared" | "derived" | "inferred" | "contested" | "superseded";
export type ReviewStatus = "proposed" | "accepted" | "rejected" | "needs_review";
export type AssertionHealth = "current" | "stale" | "unsupported";

export interface KnowledgeEvidence extends ProposalEvidence {
  lineStart?: number;
  lineEnd?: number;
  sourceAsOf?: string;
  authorityTier?: string;
}
export interface KnowledgeAssertion {
  assertionId: string;
  subjectId: string;
  predicate: string;
  objectId: string;
  relationFamily: string;
  directed: boolean;
  evidence: KnowledgeEvidence[];
  epistemicStatus: EpistemicStatus;
  reviewStatus: ReviewStatus;
  confidence: number;
  extractedBy: {
    provider: string;
    version: string;
    chunkId?: string;
    model?: string;
    privacy: "local" | "authorized-remote" | "imported";
    recordedAt: string;
  };
}
export interface EvidenceAssessment {
  assertionId: string;
  health: AssertionHealth;
  invalidEvidence: Array<{ sourceId: string; reason: string }>;
}
export interface KnowledgeLedger {
  ledgerVersion: "1.0";
  datasetId: string;
  sourceManifestFingerprint?: string;
  assertions: KnowledgeAssertion[];
  decisions: Array<{ assertionId: string; status: ReviewStatus; at: string; note?: string }>;
}
export interface KnowledgeChunk {
  chunkId: string;
  sourceId: string;
  sourceFingerprint: string;
  anchor?: string;
  text: string;
  lineStart: number;
  lineEnd: number;
  contentHash: string;
}
export interface IncrementalPlan {
  changed: KnowledgeChunk[];
  unchanged: KnowledgeChunk[];
  removedChunkIds: string[];
  staleAssertionIds: string[];
}
export interface ExtractionResult {
  complete: boolean;
  truncated: boolean;
  assertions: KnowledgeAssertion[];
  errors: string[];
  provider: string;
  proposals?: GraphDeltaProposal[];
}
export interface SemanticExtractor {
  id: string;
  extract(chunks: KnowledgeChunk[], context: { dataset: GraphDataset; manifest: SourceManifest; maxAssertions: number }): Promise<ExtractionResult>;
}
export interface GraphPath {
  found: boolean;
  nodes: string[];
  links: string[];
  evidence: Array<{ linkId: string; relation: string; citations: KnowledgeEvidence[] }>;
  reason?: string;
}

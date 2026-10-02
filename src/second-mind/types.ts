import type { ClusterDefinition, GraphDataset, GraphLink, GraphNode } from "../core/types";

export interface SourceHeading {
  depth: number;
  text: string;
  anchor: string;
}

export interface SourceLink {
  target: string;
  anchor?: string;
  fromAnchor?: string;
  kind: "wikilink" | "markdown";
  resolvedSourceId?: string;
  resolution: "resolved" | "missing" | "ambiguous";
  candidates?: string[];
}

export interface SourceRecord {
  sourceId: string;
  adapter: "markdown-vault";
  path: string;
  title: string;
  fingerprint: string;
  modifiedAt?: string;
  headings: SourceHeading[];
  tags: string[];
  frontmatter: Record<string, unknown>;
  links: SourceLink[];
  content: string;
  byteLength: number;
  provenance: { kind: "user-selected-local-file"; capturedAt: string };
}

export interface SourceManifest {
  manifestVersion: "1.0";
  adapter: "markdown-vault";
  vaultId: string;
  createdAt: string;
  fingerprint: string;
  capabilities: {
    read: true;
    diff: true;
    stableIds: true;
    anchors: true;
    directWrite: boolean;
    patchExport: true;
    renameAwareness: true;
  };
  sources: SourceRecord[];
}

export type SourceDiffKind = "added" | "modified" | "removed" | "renamed" | "unchanged" | "ambiguous";

export interface SourceDiffEntry {
  kind: SourceDiffKind;
  sourceId: string;
  path: string;
  previousPath?: string;
  fingerprint: string;
  previousFingerprint?: string;
  candidates?: string[];
}

export interface SourceDiff {
  added: number;
  modified: number;
  removed: number;
  renamed: number;
  unchanged: number;
  ambiguous: number;
  entries: SourceDiffEntry[];
}

export interface ProposalEvidence {
  sourceId: string;
  path: string;
  fingerprint: string;
  anchor?: string;
  quote: string;
  derivation: "explicit" | "derived" | "inferred";
}

interface OperationBase {
  operationId: string;
  confidence: number;
  epistemicStatus: "explicit" | "derived" | "inferred";
  evidence: ProposalEvidence[];
  rationale: string;
}

export type GraphDeltaOperation =
  | (OperationBase & { kind: "add-node"; node: GraphNode })
  | (OperationBase & { kind: "update-node"; nodeId: string; patch: Partial<GraphNode> })
  | (OperationBase & { kind: "retire-node"; nodeId: string })
  | (OperationBase & { kind: "delete-node"; nodeId: string })
  | (OperationBase & { kind: "add-link"; link: GraphLink })
  | (OperationBase & { kind: "update-link"; linkId: string; patch: Partial<GraphLink> })
  | (OperationBase & { kind: "retire-link"; linkId: string })
  | (OperationBase & { kind: "delete-link"; linkId: string })
  | (OperationBase & { kind: "add-cluster"; cluster: ClusterDefinition })
  | (OperationBase & { kind: "update-cluster"; clusterId: string; patch: Partial<ClusterDefinition> })
  | (OperationBase & { kind: "delete-cluster"; clusterId: string; reassignTo?: string });

export interface GraphDeltaProposal {
  proposalVersion: "1.0";
  proposalId: string;
  datasetId: string;
  createdAt: string;
  compiler: "deterministic-markdown" | "ai-bridge" | "external-import";
  summary: string;
  operations: GraphDeltaOperation[];
}

export interface QueryEvidencePacket {
  packetVersion: "1.0";
  query: string;
  datasetId: string;
  createdAt: string;
  nodes: Array<{ nodeId: string; label: string; cluster: string; score: number; excerpt: string }>;
  sources: Array<{ sourceId: string; path: string; fingerprint: string; anchor?: string; excerpt: string; score: number }>;
  constraints: string[];
}

export interface QueryAnswer {
  answer: string;
  nodeIds: string[];
  sourceRefs: Array<{ sourceId: string; path: string; anchor?: string }>;
  uncertainty?: string;
}

export interface HistorySnapshot {
  snapshotVersion: "1.0";
  snapshotId: string;
  datasetId: string;
  createdAt: string;
  stateHash: string;
  sourceManifestFingerprint?: string;
  acceptedProposalId?: string;
  reason: string;
  dataset: GraphDataset;
}

export interface DatasetDiff {
  nodes: { added: string[]; removed: string[]; changed: string[] };
  links: { added: string[]; removed: string[]; changed: string[] };
  clusters: { added: string[]; removed: string[]; changed: string[] };
  semanticConfig: { metadata: boolean; axes: boolean; extensions: boolean };
}

export interface WritebackProposal {
  proposalVersion: "1.0";
  proposalId: string;
  targetSourceId: string;
  targetPath: string;
  anchor?: string;
  nodeId: string;
  before: string;
  after: string;
  diff: string;
  sourceFingerprint: string;
  capability: "patch-export-only" | "direct-write-candidate";
  createdAt: string;
}

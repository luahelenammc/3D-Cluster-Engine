import type { GraphDataset } from "../core/types";
import { stableKey } from "./markdown";
import type { DatasetDiff, HistorySnapshot } from "./types";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function withoutRuntimePosition<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const semantic = { ...value };
  delete semantic.position;
  return semantic;
}

export function semanticDatasetValue(dataset: GraphDataset): unknown {
  return {
    schemaVersion: dataset.schemaVersion,
    meta: dataset.meta,
    clusters: [...dataset.clusters].sort((a, b) => a.id.localeCompare(b.id)),
    nodes: dataset.nodes.map((node) => withoutRuntimePosition(node as unknown as Record<string, unknown>)).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    links: [...dataset.links].sort((a, b) => a.id.localeCompare(b.id)),
    semanticAxes: dataset.layout?.axes,
    extensions: dataset.extensions,
  };
}

export function datasetStateHash(dataset: GraphDataset): string {
  return `semantic-fnv64:${stableKey(canonical(semanticDatasetValue(dataset)))}`;
}

export function createHistorySnapshot(dataset: GraphDataset, options: { sourceManifestFingerprint?: string; acceptedProposalId?: string; reason: string; createdAt?: string }): HistorySnapshot {
  const createdAt = options.createdAt || new Date().toISOString();
  const stateHash = datasetStateHash(dataset);
  return {
    snapshotVersion: "1.0",
    snapshotId: `snapshot-${stableKey(`${dataset.meta.id}:${createdAt}:${stateHash}:${options.reason}`)}`,
    datasetId: dataset.meta.id,
    createdAt,
    stateHash,
    sourceManifestFingerprint: options.sourceManifestFingerprint,
    acceptedProposalId: options.acceptedProposalId,
    reason: options.reason,
    dataset: structuredClone(dataset),
  };
}

function mapById<T extends { id: string }>(items: T[]) { return new Map(items.map((item) => [item.id, item])); }

function collectionDiff<T extends { id: string }>(before: T[], after: T[], normalize: (value: T) => unknown = (value) => value) {
  const oldItems = mapById(before);
  const newItems = mapById(after);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [id, item] of newItems) {
    if (!oldItems.has(id)) added.push(id);
    else if (canonical(normalize(oldItems.get(id)!)) !== canonical(normalize(item))) changed.push(id);
  }
  for (const id of oldItems.keys()) if (!newItems.has(id)) removed.push(id);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

export function diffDatasets(before: GraphDataset, after: GraphDataset): DatasetDiff {
  return {
    nodes: collectionDiff(before.nodes, after.nodes, (node) => withoutRuntimePosition(node as unknown as Record<string, unknown>)),
    links: collectionDiff(before.links, after.links),
    clusters: collectionDiff(before.clusters, after.clusters),
    semanticConfig: {
      metadata: canonical(before.meta) !== canonical(after.meta),
      axes: canonical(before.layout?.axes) !== canonical(after.layout?.axes),
      extensions: canonical(before.extensions) !== canonical(after.extensions),
    },
  };
}

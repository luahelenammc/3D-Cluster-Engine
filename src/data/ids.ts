import { stableHash } from "../core/colors";
import type { GraphLink } from "../core/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function generateLinkId(link: GraphLink, usedIds: Iterable<string>): string {
  const used = new Set(usedIds);
  const signature = stableJson({
    source: link.source,
    target: link.target,
    type: link.type || "related",
    weight: link.weight ?? 1,
    directed: link.directed ?? false,
    metadata: link.metadata || {},
  });
  const base = `link-${stableHash(signature).toString(36)}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

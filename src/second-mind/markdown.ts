import type { SourceDiff, SourceDiffEntry, SourceHeading, SourceLink, SourceManifest, SourceRecord } from "./types";

export interface MarkdownFileInput {
  name: string;
  webkitRelativePath?: string;
  lastModified?: number;
  size: number;
  text(): Promise<string>;
}

export const VAULT_LIMITS = { files: 2000, fileBytes: 5 * 1024 * 1024, totalBytes: 25 * 1024 * 1024 } as const;

export function normalizeVaultPath(input: string): string {
  const value = input.replaceAll("\\", "/").normalize("NFC");
  if (!value || value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) throw new Error(`Caminho de vault inseguro: ${input || "(vazio)"}.`);
  const parts = value.split("/").filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) throw new Error(`Caminho de vault inseguro: ${input}.`);
  const path = parts.join("/");
  if (!path || !path.toLowerCase().endsWith(".md")) throw new Error(`O arquivo não é uma nota Markdown: ${input}.`);
  if (path.length > 1024) throw new Error("O caminho de vault ultrapassa 1024 caracteres.");
  return path;
}

export function stableKey(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export async function fingerprintText(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `fnv64:${stableKey(value)}`;
}

function parseScalar(value: string): unknown {
  const text = value.trim().slice(0, 16_384);
  if (!text) return "";
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
  if (/^(null|~)$/i.test(text)) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try { return JSON.parse(text.replaceAll("'", '"')); } catch { /* Keep unsupported YAML as inert text. */ }
  }
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = content.replace(/^\uFEFF/, "");
  const firstLineEnd = normalized.indexOf("\n");
  if (!normalized.startsWith("---") || firstLineEnd < 0) return { frontmatter: {}, body: normalized };
  const afterOpen = firstLineEnd + 1;
  const closing = /^(?:---|\.\.\.)\s*$/m.exec(normalized.slice(afterOpen));
  if (!closing || closing.index === undefined) return { frontmatter: {}, body: normalized };
  const raw = normalized.slice(afterOpen, afterOpen + closing.index);
  const body = normalized.slice(afterOpen + closing.index + closing[0].length).replace(/^\r?\n/, "");
  const frontmatter: Record<string, unknown> = {};
  let activeListKey: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const listItem = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (listItem && activeListKey) {
      const current = frontmatter[activeListKey];
      if (Array.isArray(current) && current.length < 1000) current.push(parseScalar(listItem[1]));
      continue;
    }
    const entry = /^([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!entry) { activeListKey = null; continue; }
    const [, key, value] = entry;
    if (!Object.hasOwn(frontmatter, key) && Object.keys(frontmatter).length >= 200) { activeListKey = null; continue; }
    if (!value) { frontmatter[key] = []; activeListKey = key; }
    else {
      activeListKey = null;
      const parsed = parseScalar(value);
      frontmatter[key] = Array.isArray(parsed) ? parsed : parsed;
    }
  }
  return { frontmatter, body };
}

export function headingAnchor(value: string): string {
  return (value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section").slice(0, 120);
}

function extractHeadings(body: string): SourceHeading[] {
  const counts = new Map<string, number>();
  const result: SourceHeading[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].replace(/`([^`]+)`/g, "$1").trim().slice(0, 1000);
    const root = headingAnchor(text);
    const count = (counts.get(root) || 0) + 1;
    counts.set(root, count);
    const suffix = count === 1 ? "" : `-${count}`;
    result.push({ depth: match[1].length, text, anchor: `${root.slice(0, 120 - suffix.length)}${suffix}` });
    if (result.length >= 500) break;
  }
  return result;
}

function extractLinks(body: string, headings: SourceHeading[]): SourceLink[] {
  const links: SourceLink[] = [];
  const wiki = /\[\[([^\]]+)\]\]/g;
  const markdown = /\[[^\]]*\]\(([^)]+)\)/g;
  const lines = body.split(/\r?\n/);
  let headingIndex = 0;
  let currentAnchor: string | undefined;
  for (const line of lines) {
    if (/^\s{0,3}#{1,6}\s+/.test(line)) {
      currentAnchor = headings[headingIndex]?.anchor;
      headingIndex += 1;
    }
    for (const match of line.matchAll(wiki)) {
      const raw = match[1].split("|")[0].trim();
      const [target, anchor] = raw.split("#", 2);
      if (target) links.push({ target: target.trim().slice(0, 1024), anchor: anchor ? headingAnchor(anchor).slice(0, 200) : undefined, fromAnchor: currentAnchor, kind: "wikilink", resolution: "missing" });
      if (links.length >= 5000) return links;
    }
    for (const match of line.matchAll(markdown)) {
      const raw = match[1].trim();
      if (/^(?:https?:|mailto:|#|data:)/i.test(raw)) continue;
      const [target, anchor] = raw.split("#", 2);
      if (target && /\.md$/i.test(target.split("?")[0])) links.push({ target: target.split("?")[0].trim().slice(0, 1024), anchor: anchor ? headingAnchor(anchor).slice(0, 200) : undefined, fromAnchor: currentAnchor, kind: "markdown", resolution: "missing" });
      if (links.length >= 5000) return links;
    }
  }
  return links;
}

function extractTags(body: string, frontmatter: Record<string, unknown>): string[] {
  const tags = new Set<string>();
  const fromFrontmatter = frontmatter.tags;
  if (Array.isArray(fromFrontmatter)) fromFrontmatter.forEach((value) => { if (typeof value === "string") tags.add(value.replace(/^#/, "").trim()); });
  else if (typeof fromFrontmatter === "string") fromFrontmatter.split(/[\s,]+/).forEach((value) => { if (value) tags.add(value.replace(/^#/, "").trim()); });
  for (const match of body.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
    tags.add(match[2].slice(0, 200));
    if (tags.size >= 500) break;
  }
  return [...tags].filter(Boolean).map((tag) => tag.slice(0, 200)).sort((a, b) => a.localeCompare(b)).slice(0, 500);
}

function resolveLink(source: SourceRecord, link: SourceLink, paths: Map<string, SourceRecord[]>, byBasename: Map<string, SourceRecord[]>): SourceLink {
  const target = link.target.replace(/^\//, "").replace(/\\/g, "/").normalize("NFC");
  const base = target.toLowerCase().endsWith(".md") ? target : `${target}.md`;
  const relative = `${source.path.includes("/") ? source.path.slice(0, source.path.lastIndexOf("/")) + "/" : ""}${base}`;
  const exact = paths.get(base.toLocaleLowerCase()) || paths.get(relative.toLocaleLowerCase());
  const targetRecords = exact?.length ? exact : byBasename.get(base.split("/").at(-1)!.toLocaleLowerCase()) || [];
  if (targetRecords.length === 1) return { ...link, resolution: "resolved", resolvedSourceId: targetRecords[0].sourceId };
  if (targetRecords.length > 1) return { ...link, resolution: "ambiguous", candidates: targetRecords.slice(0, 20).map((item) => item.path).sort() };
  return { ...link, resolution: "missing" };
}

export async function buildSourceManifest(files: MarkdownFileInput[], prior?: SourceManifest): Promise<{ manifest: SourceManifest; diff: SourceDiff }> {
  if (!files.length) throw new Error("Nenhum arquivo Markdown foi selecionado.");
  if (files.length > VAULT_LIMITS.files) throw new Error(`O limite local é ${VAULT_LIMITS.files} arquivos por importação.`);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (files.some((file) => file.size > VAULT_LIMITS.fileBytes)) throw new Error("Uma nota ultrapassa o limite local de 5 MiB.");
  if (totalBytes > VAULT_LIMITS.totalBytes) throw new Error("O vault ultrapassa o limite local de 25 MiB.");

  const capturedAt = new Date().toISOString();
  const seen = new Set<string>();
  const records: SourceRecord[] = [];
  let actualTotalBytes = 0;
  for (const file of files) {
    if (!Number.isFinite(file.size) || file.size < 0) throw new Error("O tamanho de um arquivo selecionado é inválido.");
    const path = normalizeVaultPath(file.webkitRelativePath || file.name);
    const pathKey = path.toLocaleLowerCase();
    if (seen.has(pathKey)) throw new Error(`Caminho duplicado no vault: ${path}.`);
    seen.add(pathKey);
    const content = await file.text();
    const byteLength = new TextEncoder().encode(content).byteLength;
    if (byteLength > VAULT_LIMITS.fileBytes) throw new Error(`A nota ${path} ultrapassa o limite local de 5 MiB.`);
    actualTotalBytes += byteLength;
    if (actualTotalBytes > VAULT_LIMITS.totalBytes) throw new Error("O vault ultrapassa o limite local de 25 MiB.");
    const fingerprint = await fingerprintText(content);
    const { frontmatter, body } = parseFrontmatter(content);
    const pathWithoutExtension = path.replace(/\.md$/i, "");
    const title = (typeof frontmatter.title === "string" ? frontmatter.title : pathWithoutExtension.split("/").at(-1) || pathWithoutExtension).slice(0, 500);
    records.push({
      sourceId: `source:${path}`,
      adapter: "markdown-vault",
      path,
      title,
      fingerprint,
      modifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
      headings: extractHeadings(body),
      tags: extractTags(body, frontmatter),
      frontmatter,
      links: extractLinks(body, extractHeadings(body)),
      content,
      byteLength,
      provenance: { kind: "user-selected-local-file", capturedAt },
    });
  }
  records.sort((a, b) => a.path.localeCompare(b.path));
  const paths = new Map<string, SourceRecord[]>();
  const basenames = new Map<string, SourceRecord[]>();
  for (const record of records) {
    const key = record.path.toLocaleLowerCase();
    paths.set(key, [...(paths.get(key) || []), record]);
    const basename = record.path.split("/").at(-1)!.toLocaleLowerCase();
    basenames.set(basename, [...(basenames.get(basename) || []), record]);
  }
  records.forEach((record) => { record.links = record.links.map((link) => resolveLink(record, link, paths, basenames)); });
  const fingerprint = await fingerprintText(records.map((record) => `${record.path}\0${record.fingerprint}`).join("\n"));
  const manifest: SourceManifest = {
    manifestVersion: "1.0",
    adapter: "markdown-vault",
    vaultId: prior?.vaultId || `vault-${globalThis.crypto?.randomUUID?.() || stableKey(`${capturedAt}:${records.map((record) => record.sourceId).join("\n")}`)}`,
    createdAt: capturedAt,
    fingerprint,
    capabilities: { read: true, diff: true, stableIds: true, anchors: true, directWrite: false, patchExport: true, renameAwareness: true },
    sources: records,
  };
  return { manifest, diff: diffManifests(prior, manifest) };
}

export function diffManifests(previous: SourceManifest | undefined, current: SourceManifest): SourceDiff {
  const oldSources = previous?.sources || [];
  const oldById = new Map(oldSources.map((source) => [source.sourceId, source]));
  const newById = new Map(current.sources.map((source) => [source.sourceId, source]));
  const entries: SourceDiffEntry[] = [];
  const oldUnmatched = oldSources.filter((source) => !newById.has(source.sourceId));
  const newUnmatched = current.sources.filter((source) => !oldById.has(source.sourceId));
  const consumedOld = new Set<string>();
  const consumedNew = new Set<string>();

  for (const source of current.sources) {
    const old = oldById.get(source.sourceId);
    if (!old) continue;
    entries.push({ kind: old.fingerprint === source.fingerprint ? "unchanged" : "modified", sourceId: source.sourceId, path: source.path, fingerprint: source.fingerprint, previousFingerprint: old.fingerprint });
  }
  for (const added of newUnmatched) {
    const sameContentOld = oldUnmatched.filter((old) => old.fingerprint === added.fingerprint);
    const sameContentNew = newUnmatched.filter((item) => item.fingerprint === added.fingerprint);
    if (sameContentOld.length === 1 && sameContentNew.length === 1) {
      const old = sameContentOld[0];
      consumedOld.add(old.sourceId); consumedNew.add(added.sourceId);
      entries.push({ kind: "renamed", sourceId: added.sourceId, path: added.path, previousPath: old.path, fingerprint: added.fingerprint, previousFingerprint: old.fingerprint });
    } else if (sameContentOld.length > 0 && sameContentNew.length > 0) {
      sameContentOld.forEach((old) => consumedOld.add(old.sourceId));
      consumedNew.add(added.sourceId);
      entries.push({ kind: "ambiguous", sourceId: added.sourceId, path: added.path, fingerprint: added.fingerprint, candidates: sameContentOld.map((item) => item.path).sort() });
    }
  }
  for (const added of newUnmatched) if (!consumedNew.has(added.sourceId)) entries.push({ kind: "added", sourceId: added.sourceId, path: added.path, fingerprint: added.fingerprint });
  for (const removed of oldUnmatched) if (!consumedOld.has(removed.sourceId)) {
    const candidates = newUnmatched.filter((item) => item.title.toLocaleLowerCase() === removed.title.toLocaleLowerCase()).map((item) => item.path);
    entries.push({ kind: candidates.length ? "ambiguous" : "removed", sourceId: removed.sourceId, path: removed.path, fingerprint: "", previousFingerprint: removed.fingerprint, candidates: candidates.length ? candidates.sort() : undefined });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
  const count = (kind: SourceDiffEntry["kind"]) => entries.filter((entry) => entry.kind === kind).length;
  return { added: count("added"), modified: count("modified"), removed: count("removed"), renamed: count("renamed"), unchanged: count("unchanged"), ambiguous: count("ambiguous"), entries };
}

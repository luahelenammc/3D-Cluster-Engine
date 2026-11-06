import type { ManagedWiki, ManagedWikiPage } from "./wiki";
import { lexicalStructuralScore } from "./retrieval";

export interface EmbeddingIndex { model: string; dimensions: number; documentVectors: Record<string, number[]>; queryVector: number[] }
export interface HybridHit {
  pageId: string; nodeId: string; title: string; excerpt: string; score: number; bm25: number; semantic: number;
  status: ManagedWikiPage["status"]; cited: boolean;
}
function terms(text: string): string[] {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 3000) || [];
}
function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length || a.length > 2048) return 0;
  let dot = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
    dot += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2;
  }
  return x && y ? dot / Math.sqrt(x * y) : 0;
}
/** BM25 + lexical fuzzy + optional explicitly provided local vectors + neighborhood. */
export function searchManagedWiki(wiki: ManagedWiki, query: string, options: {
  maxResults?: number; vectors?: EmbeddingIndex; includeStale?: boolean;
} = {}): HybridHit[] {
  if (!query.trim()) return [];
  const pages = wiki.pages.filter((page) => options.includeStale || page.status !== "stale").slice(0, 2000);
  const queryTokens = [...new Set(terms(query))].slice(0, 40);
  const documents = pages.map((page) => terms(page.title + " " + page.title + " " + page.body.slice(0, 6000)));
  const avgdl = Math.max(1, documents.reduce((acc, doc) => acc + doc.length, 0) / Math.max(1, documents.length));
  const df = new Map<string, number>();
  for (const token of queryTokens) df.set(token, documents.filter((doc) => doc.includes(token)).length);
  const limit = Math.max(1, Math.min(options.maxResults || 10, 30));
  const scored = pages.map((page, index) => {
    const doc = documents[index], termCounts = new Map<string, number>();
    for (const term of doc) if (queryTokens.includes(term)) termCounts.set(term, (termCounts.get(term) || 0) + 1);
    let bm25 = 0;
    for (const token of queryTokens) {
      const count = termCounts.get(token) || 0;
      const inverse = Math.log(1 + (documents.length - (df.get(token) || 0) + 0.5) / ((df.get(token) || 0) + 0.5));
      bm25 += inverse * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * doc.length / avgdl));
    }
    const fuzzy = lexicalStructuralScore(query, page.title);
    const vector = options.vectors;
    const semantic = vector && vector.queryVector.length === vector.dimensions
      ? Math.max(0, cosine(vector.queryVector, vector.documentVectors[page.pageId] || [])) : 0;
    const matched = bm25 > 0 || fuzzy >= 0.60 || semantic >= 0.35;
    const score = matched ? bm25 + fuzzy * 0.15 + semantic * 2 + (page.citations.length ? 0.05 : 0) : 0;
    return { page, bm25, semantic, score };
  });
  const initial = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.page.pageId.localeCompare(b.page.pageId));
  const selected = initial.slice(0, limit);
  const selectedIds = new Set(selected.map((item) => item.page.nodeId));
  return selected.map(({ page, score, bm25, semantic }) => ({
    pageId: page.pageId, nodeId: page.nodeId, title: page.title, excerpt: page.body.slice(0, 260),
    score: score + page.backlinks.filter((id) => selectedIds.has(id)).length * 0.03, bm25, semantic,
    status: page.status, cited: page.citations.length > 0,
  })).sort((a, b) => b.score - a.score || a.pageId.localeCompare(b.pageId));
}
export interface LocalEmbeddingProvider {
  embed(texts: string[], options: { consent: boolean; model: string }): Promise<number[][]>;
}
export function createLocalOllamaEmbeddingProvider(endpoint: string, timeoutMs = 60000): LocalEmbeddingProvider {
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash) throw new Error("Embeddings exigem endpoint estritamente local, sem parâmetros.");
  return {
    async embed(texts, { consent, model }) {
      if (!consent) throw new Error("Envio local exige autorização explícita.");
      if (!/^[\w.:-]{2,90}$/.test(model)) throw new Error("Nome de modelo inválido.");
      if (!texts.length || texts.length > 16 || texts.some((text) => text.length > 1500)) throw new Error("Payload de embeddings excede o limite.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(new URL("/api/embed", url.origin), {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, input: texts }), signal: controller.signal,
        });
        if (!response.ok) throw new Error("Ollama não respondeu: HTTP " + response.status);
        const payload: unknown = await response.json();
        const embeddings = (payload as { embeddings?: unknown }).embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== texts.length ||
          embeddings.some((item) => !Array.isArray(item) || !item.length || item.length > 2048 || item.some((number) => typeof number !== "number" || !Number.isFinite(number)))) {
          throw new Error("Modelo retornou vetores inválidos.");
        }
        return embeddings as number[][];
      } finally { clearTimeout(timeout); }
    },
  };
}

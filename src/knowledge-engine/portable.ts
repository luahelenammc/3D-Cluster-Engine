import type { ManagedWiki } from "./wiki";

export interface ReadOnlySnapshot {
  snapshotVersion: "1.0"; datasetId: string; revision: number;
  pages: Array<{ id: string; title: string; body: string; backlinks: string[]; citations: Array<{ path: string; fingerprint: string; quote: string }>; status: string }>;
  generatedAt: string; warning: string;
}
export function makeReadOnlySnapshot(wiki: ManagedWiki): ReadOnlySnapshot {
  return { snapshotVersion: "1.0", datasetId: wiki.datasetId, revision: wiki.revision,
    pages: wiki.pages.slice(0, 2000).map((page) => ({ id: page.pageId, title: page.title, body: page.body.slice(0, 4500),
      backlinks: page.backlinks.slice(0, 200), citations: page.citations.slice(0, 30).map((ref) => ({ path: ref.path, fingerprint: ref.fingerprint, quote: ref.quote.slice(0, 350) })),
      status: page.status })),
    generatedAt: new Date().toISOString(),
    warning: "Export explícito do usuário, somente leitura; contém labels/citações que podem ser privados. Não contém os arquivos brutos originais.",
  };
}
export function validatePortableSnapshot(value: unknown): ReadOnlySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Snapshot inválido.");
  const data = value as ReadOnlySnapshot;
  if (data.snapshotVersion !== "1.0" || typeof data.datasetId !== "string" || !Array.isArray(data.pages) || data.pages.length > 2000) throw new Error("Snapshot desconhecido.");
  const names = new Set<string>();
  for (const page of data.pages) {
    if (typeof page.id !== "string" || names.has(page.id) || typeof page.title !== "string" || typeof page.body !== "string" || page.body.length > 4500 || !Array.isArray(page.backlinks) || !Array.isArray(page.citations)) throw new Error("Página inválida no snapshot.");
    if (page.backlinks.length > 200 || page.citations.length > 30) throw new Error("Referências excedem limite.");
    names.add(page.id);
  }
  return data;
}

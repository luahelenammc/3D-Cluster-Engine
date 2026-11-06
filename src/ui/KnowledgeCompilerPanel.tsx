import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { GraphDataset } from "../core/types";
import type { SourceManifest } from "../second-mind/types";
import type { KnowledgeLedger } from "../knowledge-engine/types";
import { loadManagedWiki, saveManagedWiki } from "../second-mind/persistence";
import { annotateWikiPage, commitWikiPlan, planWikiCompilation, restoreWikiRevision, wikiHealth, type ManagedWiki, type ManagedWikiPage } from "../knowledge-engine/wiki";
import { buildSessionContext, lintManagedWiki } from "../knowledge-engine/resume";
import { createLocalOllamaEmbeddingProvider, searchManagedWiki, type EmbeddingIndex, type HybridHit } from "../knowledge-engine/hybrid";
import { exportManagedWikiZip, exportManagedWikiVault, previewCanvas, previewManagedNoteRoundTrip, type CanvasPreview, type ManagedNotePreview } from "../knowledge-engine/wiki-interop";
import { makeReadOnlySnapshot } from "../knowledge-engine/portable";
import { recordTemporalObservation, summarizeTemporalObservations, type TemporalObservation } from "../knowledge-engine/chronology";

type Mode = "explore" | "ask" | "review";
interface Props {
  dataset: GraphDataset;
  manifest: SourceManifest | null;
  ledger: KnowledgeLedger;
  selectedNodeId: string | null;
  onHighlight(nodeId: string): void;
  onToast(message: { type: "ok" | "info" | "error"; message: string }): void;
}
function download(name: string, value: Blob) {
  const href = URL.createObjectURL(value);
  const a = document.createElement("a");
  a.href = href; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 2000);
}
function jsonBlob(value: unknown): Blob { return new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); }
export default function KnowledgeCompilerPanel({ dataset, manifest, ledger, selectedNodeId, onHighlight, onToast }: Props) {
  const [mode, setMode] = useState<Mode>("explore");
  const [wiki, setWiki] = useState<ManagedWiki | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [approved, setApproved] = useState<string[]>([]);
  const [focused, setFocused] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<HybridHit[]>([]);
  const [vectors, setVectors] = useState<EmbeddingIndex | undefined>();
  const [model, setModel] = useState("nomic-embed-text");
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [canvasPreview, setCanvasPreview] = useState<CanvasPreview | null>(null);
  const [noteImport, setNoteImport] = useState<ManagedNotePreview | null>(null);
  const [temporalId, setTemporalId] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [temporalInterpretation, setTemporalInterpretation] = useState<TemporalObservation["interpretation"]>("uncertain");
  const [temporalNote, setTemporalNote] = useState("");
  const vaultId = manifest?.vaultId || null;

  useEffect(() => {
    let live = true;
    setLoaded(false); setWiki(null); setApproved([]); setHits([]); setVectors(undefined); setCanvasPreview(null); setNoteImport(null);
    if (!vaultId) { setLoaded(true); return () => { live = false; }; }
    void loadManagedWiki(dataset.meta.id, vaultId).then((saved) => {
      if (live) { setWiki(saved || null); setLoaded(true); }
    }).catch(() => { if (live) { setLoaded(true); onToast({ type: "error", message: "A wiki local não pôde ser carregada." }); } });
    return () => { live = false; };
  }, [dataset.meta.id, vaultId]);

  const plan = useMemo(() => manifest && loaded ? planWikiCompilation(dataset, manifest, ledger, wiki || undefined) : null, [dataset, manifest, ledger, wiki, loaded]);
  const health = useMemo(() => wiki && manifest ? wikiHealth(wiki, manifest) : null, [wiki, manifest]);
  const issues = useMemo(() => wiki && manifest ? lintManagedWiki(wiki, manifest) : [], [wiki, manifest]);
  const activePage = wiki?.pages.find((page) => page.pageId === focused || page.nodeId === selectedNodeId)
    || wiki?.pages[0];
  const proposedCount = plan?.changes.length || 0;

  async function save(next: ManagedWiki) {
    if (!manifest || next.manifestFingerprint !== manifest.fingerprint) throw new Error("As fontes foram alteradas; recompile o plano.");
    await saveManagedWiki(next, wiki?.revision || 0);
    const readback = await loadManagedWiki(next.datasetId, next.vaultId);
    if (!readback || readback.revision !== next.revision) throw new Error("Readback não confirmou a revisão.");
    setWiki(readback); setApproved([]); setVectors(undefined);
  }
  async function accept() {
    if (!plan || !manifest || !approved.length) return;
    setWorking(true);
    try {
      const next = commitWikiPlan(plan, approved, wiki || undefined);
      await save(next);
      onToast({ type: "ok", message: "Wiki derivada atualizada: " + approved.length + " páginas aprovadas com readback local." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Não foi possível compilar." }); }
    finally { setWorking(false); }
  }
  async function annotate() {
    if (!wiki || !activePage || !manifest) return;
    setWorking(true);
    try {
      const next = annotateWikiPage(wiki, activePage.pageId, noteDraft);
      await save(next);
      onToast({ type: "ok", message: "Anotação humana salva separadamente do texto compilado." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar anotação." }); }
    finally { setWorking(false); }
  }
  async function restore(revision: number) {
    if (!wiki || !manifest) return;
    setWorking(true);
    try {
      const next = restoreWikiRevision(wiki, revision);
      // A restauração de conteúdo antigo é marcada como revisão nova, sem apagar o histórico.
      next.manifestFingerprint = manifest.fingerprint;
      await save(next);
      onToast({ type: "ok", message: "Revisão restaurada. Verifique citações antigas antes de reutilizá-las." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao restaurar." }); }
    finally { setWorking(false); }
  }
  function search() {
    if (!wiki) return;
    setHits(searchManagedWiki(wiki, query, { vectors, maxResults: 12 }));
    setMode("ask");
  }
  async function localVectors() {
    if (!wiki || !consent || !query.trim()) return;
    setWorking(true);
    try {
      const candidates = searchManagedWiki(wiki, query, { maxResults: 12 });
      const pages = candidates.slice(0, 10).flatMap((hit) => wiki.pages.find((p) => p.pageId === hit.pageId) || []);
      const inputs = [query.slice(0, 1000), ...pages.map((page) => (page.title + " " + page.body).slice(0, 1500))];
      const embeddings = await createLocalOllamaEmbeddingProvider(ollamaUrl).embed(inputs, { consent, model });
      const docVectors: Record<string, number[]> = {};
      pages.forEach((page, i) => { docVectors[page.pageId] = embeddings[i + 1]; });
      const index: EmbeddingIndex = { model, dimensions: embeddings[0].length, queryVector: embeddings[0], documentVectors: docVectors };
      setVectors(index); setHits(searchManagedWiki(wiki, query, { vectors: index }));
      setConsent(false);
      onToast({ type: "ok", message: "Vetores locais temporários obtidos. Nenhum embedding foi salvo em nuvem." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha no Ollama local." }); }
    finally { setWorking(false); }
  }
  function exportResume() {
    if (!wiki || !manifest) return;
    try { download("second-mind-resume-v1.json", jsonBlob(buildSessionContext(wiki, manifest, query || activePage?.title || "contexto"))); }
    catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao preparar handoff." }); }
  }
  async function inspectCanvas(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Canvas excede 2 MiB.");
      const exported = wiki ? exportManagedWikiVault(wiki) : { files: {} as Record<string, string> };
      setCanvasPreview(previewCanvas(JSON.parse(await file.text()) as unknown, Object.keys(exported.files)));
      onToast({ type: "info", message: "Canvas inspecionado sem alterar o grafo ou as fontes." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Canvas não verificável." }); }
  }
  async function inspectManagedNote(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    setNoteImport(null);
    if (!file || !wiki) return;
    try {
      if (file.size > 128 * 1024) throw new Error("Nota gerenciada excede 128 KiB.");
      const pending = previewManagedNoteRoundTrip(wiki, await file.text());
      setNoteImport(pending);
      onToast({ type: "info", message: "Importação analisada. Somente a anotação humana pode ser aplicada após sua confirmação." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Nota importada inválida." }); }
  }
  async function applyManagedNote() {
    if (!wiki || !noteImport) return;
    setWorking(true);
    try {
      if (wiki.pages.find((p) => p.pageId === noteImport.pageId)?.revision !== noteImport.revision) throw new Error("Revisão da página mudou; reimporte.");
      await save(annotateWikiPage(wiki, noteImport.pageId, noteImport.afterNote));
      setNoteImport(null);
      onToast({ type: "ok", message: "Anotação humana aprovada e salva. O conteúdo compilado permaneceu intacto." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha na revisão importada." }); }
    finally { setWorking(false); }
  }
  async function saveTemporal() {
    if (!wiki || !manifest) return;
    setWorking(true);
    try {
      const next = recordTemporalObservation(wiki, ledger.assertions, {
        assertionId: temporalId, ...(validFrom ? { validFrom } : {}), ...(validUntil ? { validUntil } : {}),
        interpretation: temporalInterpretation, note: temporalNote,
      });
      await save(next);
      setTemporalNote(""); setValidFrom(""); setValidUntil("");
      onToast({ type: "ok", message: "Marco temporal revisado registrado; nenhuma fonte original foi modificada." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao registrar temporalidade." }); }
    finally { setWorking(false); }
  }
  const sourceCount = manifest?.sources.length || 0;
  const selectPage = (page: ManagedWikiPage) => { setFocused(page.pageId); setNoteDraft(page.authorNote || ""); onHighlight(page.nodeId); };

  return <section className="knowledge-compiler" aria-label="Knowledge Compiler 0.4">
    <header className="sm-section-heading"><div>
      <h3>Knowledge Compiler · Second Mind 0.4</h3>
      <p>Wiki derivada e cumulativa, com revisão, memória portátil e fontes soberanas. Zero promoção automática.</p>
    </div></header>
    <div className="sm-actions knowledge-tabs" role="group" aria-label="Modo cognitivo">
      <button type="button" aria-pressed={mode === "explore"} onClick={() => setMode("explore")}>Explorar</button>
      <button type="button" aria-pressed={mode === "ask"} onClick={() => setMode("ask")}>Perguntar</button>
      <button type="button" aria-pressed={mode === "review"} onClick={() => setMode("review")}>Revisar</button>
    </div>
    {!loaded && <p role="status">Carregando wiki local…</p>}
    {!manifest && <p className="sm-fallback">Importe um vault Markdown em Fontes para ativar o compilador. O dataset visualizado continua independente.</p>}
    {manifest && <div className="sm-metrics">
      <span><b>{sourceCount}</b> fontes originais</span>
      <span><b>{wiki?.pages.length || 0}</b> páginas compiladas</span>
      <span><b>{wiki?.revision || 0}</b> revisões</span>
      <span><b>{health?.staleIds.length || 0}</b> páginas obsoletas</span>
      <span><b>{proposedCount}</b> deltas aguardando</span>
    </div>}
    {manifest && mode === "review" && <div className="knowledge-mode-panel">
      <h4>Revisão do compilador</h4>
      <p>Compilação determinística de nós canônicos e evidências atuais. Títulos ou trechos de fontes nunca são tratados como instruções.</p>
      {plan?.errors.map((error) => <p role="alert" key={error}>{error}</p>)}
      <div className="sm-actions compact"><button onClick={() => setApproved((plan?.changes || []).map((item) => item.pageId))} disabled={!proposedCount}>Selecionar todos os deltas</button><button className="quiet" onClick={() => setApproved([])}>Limpar seleção</button></div>
      <div className="knowledge-review-queue">
        {plan?.changes.slice(0, 100).map((change) => <article key={change.pageId} className="sm-knowledge-assertion">
          <label><input type="checkbox" checked={approved.includes(change.pageId)} onChange={(event) => setApproved((prior) => event.target.checked ? [...prior, change.pageId] : prior.filter((id) => id !== change.pageId))} />
            <strong>{change.after.title}</strong> · {change.action} · {change.after.status}
          </label>
          <details><summary>Examinar diferença e evidências</summary>
            <p><b>Antes:</b> {change.before?.body.slice(0, 800) || "Nova página"}</p><p><b>Depois:</b> {change.after.body.slice(0, 1100)}</p>
            <p>{change.after.citations.length} citações atuais; {change.after.relationIds.length} relações.</p>
          </details>
        </article>)}
      </div>
      {Boolean(plan?.changes.length && plan.changes.length > 100) && <p>Exibindo os primeiros 100 deltas. Revise um dataset menor para aprovação granular.</p>}
      <div className="sm-actions">
        <button className="primary-button" onClick={() => void accept()} disabled={working || !approved.length || Boolean(plan?.errors.length)}>Aprovar {approved.length} página(s)</button>
        <button className="quiet" disabled={!wiki || !wiki.history.length || working} onClick={() => wiki && void restore(wiki.history[wiki.history.length - 1].revision)}>Restaurar revisão anterior</button>
      </div>
      {plan && <p className="sm-local-note">{plan.unchanged.length} páginas intactas · {plan.retired.length} páginas de nós ausentes preservadas até revisão humana.</p>}
      {wiki && <details><summary>Log e histórico de revisões</summary>{wiki.log.slice(-15).reverse().map((event) => <p key={event.eventId}>{event.at} · {event.action} · {event.pageIds.length} páginas</p>)}</details>}
      <details><summary>Tempo e validade · anotações humanas</summary>
        <p>“Registrado em” é o momento desta revisão; “válido desde/até” descreve o fato e nunca é inferido automaticamente da fonte.</p>
        <label className="sm-field">Relação canônica
          <select value={temporalId} onChange={(event) => setTemporalId(event.target.value)}><option value="">Escolher afirmação</option>{ledger.assertions.filter((item) => item.reviewStatus === "accepted").slice(0, 500).map((item) => <option key={item.assertionId} value={item.assertionId}>{item.subjectId} · {item.predicate} · {item.objectId}</option>)}</select>
        </label>
        <label className="sm-field">Válida desde (opcional)<input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></label>
        <label className="sm-field">Válida até (opcional)<input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
        <label className="sm-field">Interpretação humana
          <select value={temporalInterpretation} onChange={(event) => setTemporalInterpretation(event.target.value as TemporalObservation["interpretation"])}><option value="uncertain">Incerta</option><option value="confirmed">Confirmada pelo revisor</option><option value="contested">Contestada</option><option value="superseded">Superada</option></select>
        </label>
        <label className="sm-field">Justificativa da revisão<textarea rows={3} maxLength={500} value={temporalNote} onChange={(event) => setTemporalNote(event.target.value)} placeholder="Por qual razão este período foi anotado?" /></label>
        <button disabled={working || !temporalId || !temporalNote.trim()} onClick={() => void saveTemporal()}>Registrar marco temporal</button>
        <small>Registro local por ação. Não retira nem substitui o estado epistemológico canônico automaticamente.</small>
      </details>
      {issues.length > 0 && <details><summary>Lint: {issues.length} alertas de proveniência</summary>{issues.slice(0, 50).map((issue, i) => <p key={issue.pageId + ":" + i}>{issue.severity}: {issue.pageId} · {issue.message}</p>)}</details>
    </div>}
    {wiki && mode === "explore" && <div className="knowledge-mode-panel">
      <h4>Wiki derivada</h4>
      <p>As páginas refletem relações aceitas. Páginas estruturais sem fontes são explicitamente rotuladas.</p>
      <label className="sm-field">Abrir página
        <select value={activePage?.pageId || ""} onChange={(event) => { const next = wiki.pages.find((p) => p.pageId === event.target.value); if (next) selectPage(next); }}>
          {wiki.pages.map((page) => <option key={page.pageId} value={page.pageId}>{page.title} · {page.status}</option>)}
        </select>
      </label>
      {activePage && <article className="sm-answer">
        <h4>{activePage.title}</h4>
        <small>{activePage.status} · {activePage.citations.length} citações · {activePage.backlinks.length} backlinks · revisão {activePage.revision}</small>
        <pre className="knowledge-page-text">{activePage.body}</pre>
        <label className="sm-field">Nota humana separada do conteúdo compilado
          <textarea value={focused === activePage.pageId ? noteDraft : activePage.authorNote || ""} onChange={(event) => { setFocused(activePage.pageId); setNoteDraft(event.target.value); }} maxLength={4000} rows={3} />
        </label>
        <button type="button" onClick={() => void annotate()} disabled={working}>Salvar nota humana</button>
      </article>}
      {(wiki.temporal || []).length > 0 && <details><summary>Linha do tempo revisada · {wiki.temporal?.length || 0} registros</summary>{summarizeTemporalObservations(wiki).slice(0, 30).map((entry) => <p key={entry.observationId}><b>{entry.interpretation}</b> · {entry.assertionId} · observado {entry.observedAt.slice(0, 10)} · validade {entry.validFrom || "?"} a {entry.validUntil || "?"} · {entry.note}{!entry.evidenceAvailable ? " · sem prova fonte" : ""}</p>)}</details>}
      <div className="sm-actions">
        <button type="button" onClick={() => download("lms3d-managed-wiki.zip", exportManagedWikiZip(wiki))}>Exportar Obsidian + Canvas</button>
        <button className="quiet" onClick={() => download("lms3d-wiki-snapshot.json", jsonBlob(wiki))}>Backup integral local</button>
        <button className="quiet" onClick={() => download("lms3d-mcp-readonly.json", jsonBlob(makeReadOnlySnapshot(wiki)))}>Snapshot MCP somente leitura</button>
      </div>
      <label className="sm-field">Auditar um Canvas (.canvas) sem aplicar alterações
        <input type="file" accept=".canvas,.json" onChange={(event) => void inspectCanvas(event)} />
      </label>
      {canvasPreview && <p role="status">Canvas válido: {canvasPreview.fileNodes} arquivos, {canvasPreview.edges} relações. {canvasPreview.warnings.join("; ") || "Nenhuma referência ausente detectada."} Importação é prévia, sem writeback.</p>}
      <details><summary>Round-trip de nota humana do Obsidian</summary>
        <p>Edite somente “Nota humana” em um .md exportado. O corpo compilado é protegido e não aceita importação modificada.</p>
        <label className="sm-field">Revisar nota .md<input type="file" accept=".md,text/markdown" onChange={(event) => void inspectManagedNote(event)} /></label>
        {noteImport && <article className="sm-knowledge-assertion"><b>{noteImport.title}</b><p>Antes: {noteImport.beforeNote || "Sem nota"}</p><p>Depois: {noteImport.afterNote || "Remover nota"}</p><button disabled={working} onClick={() => void applyManagedNote()}>Aplicar apenas nota humana</button></article>}
      </details>
    </div>}
    {wiki && mode === "ask" && <div className="knowledge-mode-panel">
      <h4>Consultar e retomar</h4>
      <label className="sm-field">Pergunta ou tema
        <input value={query} onChange={(event) => { setQuery(event.target.value); setVectors(undefined); }} placeholder="O que mudou sobre…?" />
      </label>
      <div className="sm-actions"><button className="primary-button" onClick={search}>Buscar na wiki</button><button className="quiet" onClick={exportResume}>Exportar handoff/resume</button></div>
      {hits.length > 0 && <div className="sm-evidence-list">
        {hits.map((hit) => <article className="sm-knowledge-assertion" key={hit.pageId}>
          <button onClick={() => { const page = wiki.pages.find((item) => item.pageId === hit.pageId); if (page) { selectPage(page); setMode("explore"); } }}>{hit.title}</button>
          <small>BM25 {hit.bm25.toFixed(2)} · vetor {hit.semantic.toFixed(2)} · {hit.cited ? "com citação" : "sem prova"}</small>
          <p>{hit.excerpt}</p>
        </article>)}
      </div>}
      <details className="sm-advanced-disclosure"><summary>Embeddings opcionais · Ollama local</summary>
        <p>O modo padrão é BM25 no navegador. Somente o botão abaixo envia a pergunta e até 10 trechos da wiki ao Ollama em localhost. Não há envio automático nem conexão a serviço externo.</p>
        <label className="sm-field">Endpoint local<input value={ollamaUrl} onChange={(event) => setOllamaUrl(event.target.value)} /></label>
        <label className="sm-field">Modelo instalado<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
        <label className="sm-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />Autorizo este processamento local específico dos trechos selecionados.</label>
        <button onClick={() => void localVectors()} disabled={!query.trim() || !consent || working}>{working ? "Processando…" : "Buscar com vetores locais"}</button>
      </details>
      <p className="sm-local-note">A busca não gera respostas factuais automaticamente; produz resultados citáveis para julgamento humano ou consulta externa autorizada.</p>
    </div>}
    {manifest && !wiki && mode !== "review" && <div className="sm-actions"><button className="primary-button" onClick={() => setMode("review")}>Revisar primeira compilação</button></div>}
  </section>;

}

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import KnowledgeCompilerPanel from "./KnowledgeCompilerPanel";
import type { GraphDataset } from "../core/types";
import type { GraphDeltaProposal, SourceManifest } from "../second-mind/types";
import { loadKnowledgeLedger, saveKnowledgeLedger } from "../second-mind/persistence";
import { chunkManifest, planIncrementalExtraction } from "../knowledge-engine/chunks";
import { createBridgeSemanticExtractor } from "../knowledge-engine/extraction";
import { buildObsidianVaultExport, exportGraphML, previewGraphifyImport, type GraphifyImportPreview } from "../knowledge-engine/interoperability";
import { auditLedger, decideAssertion, ledgerFromGraph, ledgerFromProposal } from "../knowledge-engine/ledger";
import { findKnowledgePath, groundedPathNarrative, pathEvidenceCoverage } from "../knowledge-engine/paths";
import { buildKnowledgeQueryPacketV2, type KnowledgeQueryPacketV2 } from "../knowledge-engine/retrieval";
import { detectAssertionContradictions, suggestEntityMerges } from "../knowledge-engine/reconcile";
import { analyzeTopology } from "../knowledge-engine/topology";
import type { ExtractionResult, GraphPath, KnowledgeChunk, KnowledgeLedger } from "../knowledge-engine/types";
import { createLocalZip } from "../knowledge-engine/zip";

type VisualMode = "semantic" | "evidence" | "inferred" | "contested" | "path";
interface Props {
  dataset: GraphDataset;
  manifest: SourceManifest | null;
  proposal: GraphDeltaProposal | null;
  selectedNodeId: string | null;
  bridgeUrl: string;
  bridgeAccessToken: string;
  onReviewProposal(proposal: GraphDeltaProposal): void;
  onHighlight(nodeId: string): void;
  onVisualMode(mode: VisualMode, links: string[]): void;
  onToast(toast: { type: "ok" | "error" | "info"; message: string }): void;
}
function download(name: string, content: Blob) {
  const uri = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = uri; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(uri), 1000);
}
function jsonBlob(value: unknown) { return new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); }
const MAX_PREVIEW = 12;

export default function KnowledgeWorkbench({ dataset, manifest, proposal, selectedNodeId, bridgeUrl, bridgeAccessToken, onReviewProposal, onHighlight, onVisualMode, onToast }: Props) {
  const [lastDecision, setLastDecision] = useState<KnowledgeLedger | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [evidenceOnly, setEvidenceOnly] = useState(false);
  const [path, setPath] = useState<GraphPath | null>(null);
  const [preview, setPreview] = useState<GraphifyImportPreview | null>(null);
  const [investigationQuestion, setInvestigationQuestion] = useState("");
  const [investigationPacket, setInvestigationPacket] = useState<KnowledgeQueryPacketV2 | null>(null);
  const [previousChunks, setPreviousChunks] = useState<KnowledgeChunk[]>([]);
  const [allowChunkUpload, setAllowChunkUpload] = useState(false);
  const [runningExtract, setRunningExtract] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [visualMode, setVisualMode] = useState<VisualMode>("semantic");

  useEffect(() => {
    let alive = true;
    setLastDecision(null); setPath(null); setExtraction(null); setPreview(null); setInvestigationPacket(null);
    void loadKnowledgeLedger(dataset.meta.id).then((value) => { if (alive) setLastDecision(value || null); }).catch(() => undefined);
    try {
      const raw = sessionStorage.getItem("lms3d.knowledge.chunk-index." + encodeURIComponent(dataset.meta.id));
      setPreviousChunks(raw ? JSON.parse(raw) as KnowledgeChunk[] : []);
    } catch { setPreviousChunks([]); }
    return () => { alive = false; };
  }, [dataset.meta.id]);

  const chunks = useMemo(() => manifest ? chunkManifest(manifest) : [], [manifest]);
  const baseLedger = useMemo(() => ledgerFromGraph(dataset, manifest || undefined), [dataset, manifest]);
  const proposed = useMemo(() => proposal && manifest ? ledgerFromProposal(proposal, manifest) : [], [proposal, manifest]);
  const combinedLedger = useMemo(() => {
    const prior = new Map(lastDecision?.assertions.map((entry) => [entry.assertionId, entry.reviewStatus]) || []);
    const all = [...baseLedger.assertions, ...proposed, ...(extraction?.assertions || [])];
    const unique = new Map(all.map((item) => [item.assertionId, { ...item, reviewStatus: prior.get(item.assertionId) || item.reviewStatus }]));
    return { ...baseLedger, assertions: [...unique.values()], decisions: lastDecision?.decisions || [] } as KnowledgeLedger;
  }, [baseLedger, proposed, extraction, lastDecision]);
  const audit = useMemo(() => auditLedger(combinedLedger, manifest || undefined), [combinedLedger, manifest]);
  const topology = useMemo(() => analyzeTopology(dataset), [dataset]);
  const entityCandidates = useMemo(() => suggestEntityMerges(dataset).slice(0, MAX_PREVIEW), [dataset]);
  const contradictions = useMemo(() => detectAssertionContradictions(combinedLedger.assertions).slice(0, MAX_PREVIEW), [combinedLedger]);
  const incremental = useMemo(() => planIncrementalExtraction(previousChunks, chunks, combinedLedger.assertions), [previousChunks, chunks, combinedLedger]);
  const nodeLabels = useMemo(() => new Map(dataset.nodes.map((node) => [node.id, node.label])), [dataset]);
  const extractChunks = chunks.slice(0, 4);
  const consentBytes = extractChunks.reduce((sum, chunk) => sum + new TextEncoder().encode(chunk.text.slice(0, 3000)).byteLength, 0);

  function switchMode(next: VisualMode, linkIds: string[] = []) {
    setVisualMode(next); onVisualMode(next, linkIds);
  }
  async function decide(assertionId: string, decision: "rejected" | "needs_review") {
    try {
      const updated = decideAssertion(combinedLedger, assertionId, decision);
      await saveKnowledgeLedger(updated);
      setLastDecision(updated);
      onToast({ type: "ok", message: decision === "rejected" ? "Candidata rejeitada no ledger local; o grafo canônico não foi alterado." : "Candidata marcada para revisão no ledger local." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Decisão inválida." }); }
  }
  function findPath() {
    const start = from.trim() || selectedNodeId || dataset.nodes[0]?.id || "";
    const end = to.trim();
    const result = findKnowledgePath(dataset, start, end, { maxHops: 8, requireEvidence: evidenceOnly, manifest: manifest || undefined, assertions: combinedLedger.assertions });
    setPath(result);
    switchMode("path", result.links);
  }
  function exportVault() {
    try {
      const result = buildObsidianVaultExport(dataset, combinedLedger);
      download("lms3d-obsidian-" + dataset.meta.id.replace(/[^\w-]+/g, "-").slice(0, 60) + ".zip", createLocalZip(result.files));
      onToast({ type: "ok", message: "Vault Obsidian e Canvas exportados localmente. O conteúdo integral das fontes não foi incluído." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao exportar." }); }
  }
  async function importGraphify(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Importação Graphify limitada a 5 MiB.");
      setPreview(previewGraphifyImport(JSON.parse(await file.text()) as unknown));
      onToast({ type: "info", message: "Graphify carregado como prévia não verificada; nenhuma relação foi aplicada." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Arquivo Graphify inválido." }); }
  }
  function snapshotChunkIndex() {
    const safeIndex = chunks.map((chunk) => ({ ...chunk, text: "" }));
    try {
      sessionStorage.setItem("lms3d.knowledge.chunk-index." + encodeURIComponent(dataset.meta.id), JSON.stringify(safeIndex));
      setPreviousChunks(safeIndex);
      onToast({ type: "ok", message: "Snapshot local de hashes registrado, sem armazenar o conteúdo dos chunks." });
    } catch { onToast({ type: "error", message: "Não foi possível salvar o índice de chunks nesta sessão." }); }
  }
  async function extract() {
    if (!manifest || !bridgeUrl.trim() || !allowChunkUpload) return;
    setRunningExtract(true);
    try {
      const extractor = createBridgeSemanticExtractor({ endpoint: bridgeUrl, accessToken: bridgeAccessToken, explicitlyAuthorized: allowChunkUpload, maxChunksPerRun: 4 });
      const result = await extractor.extract(extractChunks, { dataset, manifest, maxAssertions: 100 });
      setExtraction(result); setAllowChunkUpload(false);
      onToast({ type: result.complete ? "ok" : "info", message: result.complete ? "Extração concluída. Revise as propostas antes de aceitá-las." : "Extração parcial; confira erros e saídas antes de revisar." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Extração interrompida." }); }
    finally { setRunningExtract(false); }
  }

  return <section className="second-mind-section" role="tabpanel" aria-label="Knowledge Engine">
    <div className="sm-section-heading"><div><h3>Knowledge Engine · Obsidian + IA + grafo espacial</h3><p>As relações são investigáveis, mas a fonte governa e a IA só propõe. Nada é publicado ou escrito automaticamente.</p></div></div>
    <KnowledgeCompilerPanel dataset={dataset} manifest={manifest} ledger={combinedLedger} selectedNodeId={selectedNodeId} onHighlight={onHighlight} onToast={onToast} />
    <details className="sm-advanced-disclosure knowledge-legacy"><summary>Ferramentas anteriores · análise espacial e extração 0.3</summary>
    <div className="sm-metrics">
      <span><b>{topology.communities.length}</b> comunidades detectadas</span>
      <span><b>{topology.components.length}</b> componentes</span>
      <span><b>{topology.bridges.length}</b> pontes</span>
      <span><b>{topology.crossClusterLinks}</b> conexões intercluster</span>
    </div>
    {topology.outOfBudget && <p className="sm-fallback">Análise limitada ao envelope de 5.000 nós e 20.000 relações. Não extrapole os resultados para o dataset inteiro.</p>}
    <div className="sm-actions"><button className="quiet" onClick={() => switchMode("semantic")}>Semântico</button><button className="quiet" onClick={() => switchMode("evidence")}>Evidências</button><button className="quiet" onClick={() => switchMode("inferred")}>Inferências</button><button className="quiet" onClick={() => switchMode("contested")}>Contestadas</button><button className="quiet" onClick={() => switchMode("path", path?.links || [])}>Caminho</button></div>
    <p className="sm-local-note">Camada ativa: <b>{visualMode}</b>. Os clusters canônicos e a semântica dos eixos são preservados.</p>

    <div className="sm-section-heading"><div><h3>Auditoria de relações</h3><p>Aceitação canônica continua exclusivamente no fluxo de propostas revisadas.</p></div></div>
    <div className="sm-metrics"><span><b>{combinedLedger.assertions.length}</b> afirmações</span><span><b>{audit.verified}</b> com evidência atual</span><span><b>{audit.stale}</b> stale</span><span><b>{audit.unsupported}</b> sem suporte</span></div>
    <p className="sm-local-note">Cobertura verificável: {(audit.evidenceCoverage * 100).toFixed(1)}%. Relações já existentes sem fontes não foram retroativamente declaradas verdadeiras.</p>
    <div className="sm-actions"><button onClick={() => download("knowledge-ledger.json", jsonBlob(combinedLedger))}>Exportar ledger</button><button className="quiet" onClick={() => download("topology-report.json", jsonBlob(topology))}>Exportar topologia</button></div>
    <div className="sm-evidence-list">
      {combinedLedger.assertions.filter((item) => item.reviewStatus === "proposed" || item.reviewStatus === "needs_review").slice(0, MAX_PREVIEW).map((item) => <article key={item.assertionId} className="sm-knowledge-assertion">
        <b>{nodeLabels.get(item.subjectId) || item.subjectId} → {item.predicate} → {nodeLabels.get(item.objectId) || item.objectId}</b>
        <small>{item.epistemicStatus} · {item.reviewStatus} · confiança {item.confidence.toFixed(2)}</small>
        {item.evidence.slice(0, 2).map((e, i) => <details key={i}><summary>{e.path}{e.anchor ? "#" + e.anchor : ""}</summary><p>{e.quote}</p></details>)}
        <div className="sm-actions compact"><button onClick={() => void decide(item.assertionId, "needs_review")}>Marcar revisão</button><button className="quiet" onClick={() => void decide(item.assertionId, "rejected")}>Descartar candidata</button></div>
      </article>)}
    </div>
    {entityCandidates.length > 0 && <details className="sm-disclosure"><summary>{entityCandidates.length} sugestões de alias para revisão</summary>{entityCandidates.map((item) => <p key={item.leftId + item.rightId}>{item.leftId} ↔ {item.rightId}: {item.reason}. Nenhum merge automático.</p>)}</details>}
    {contradictions.length > 0 && <details className="sm-disclosure"><summary>{contradictions.length} conflitos potenciais</summary>{contradictions.map((item) => <p key={item.leftAssertionId + item.rightAssertionId}>{item.leftAssertionId} ↔ {item.rightAssertionId}: {item.reason}</p>)}</details>}
    {topology.bridges.length > 0 && <details className="sm-disclosure"><summary>Relações estruturais de ponte</summary>{topology.bridges.slice(0, 15).map((item) => <p key={item.linkId}>{item.source} → {item.target} · {item.linkId}</p>)}</details>}

    <div className="sm-section-heading"><div><h3>Consulta local híbrida · pacote 2.0</h3><p>Trigramas, correspondência lexical, centralidade e fontes; sem embeddings remotos nem envio automático.</p></div></div>
    <label className="sm-field">Questão<input value={investigationQuestion} onChange={(event) => setInvestigationQuestion(event.target.value)} placeholder="Como os conceitos se conectam?" /></label>
    <div className="sm-actions"><button onClick={() => { try { setInvestigationPacket(buildKnowledgeQueryPacketV2(dataset, manifest || undefined, investigationQuestion, combinedLedger.assertions, { selectedNodeId: selectedNodeId || undefined, targetNodeId: to.trim() || undefined })); } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Consulta inválida." }); } }}>Montar pacote local v2</button>{investigationPacket && <button className="quiet" onClick={() => download("knowledge-evidence-packet-v2.json", jsonBlob(investigationPacket))}>Exportar evidências</button>}</div>
    {investigationPacket && <div className="sm-evidence-list"><p>{investigationPacket.nodes.length} nós · {investigationPacket.links.length} links · {investigationPacket.sources.length} fontes selecionadas. O recorte não prova completude.</p>{investigationPacket.nodes.slice(0, MAX_PREVIEW).map((node) => <button key={node.nodeId} onClick={() => onHighlight(node.nodeId)}>{node.label} · score {node.score.toFixed(2)}</button>)}<details><summary>Restrições e fontes recuperadas</summary>{investigationPacket.sources.map((source) => <p key={source.sourceId}>{source.path}: {source.excerpt}</p>)}{investigationPacket.constraints.map((constraint) => <p key={constraint}>{constraint}</p>)}</details></div>}

    <div className="sm-section-heading"><div><h3>Investigação por caminhos</h3><p>Respeita relações dirigidas e só exibe sequências existentes no snapshot atual.</p></div></div>
    <label className="sm-field">Origem (ID de nó)<input list="knowledge-node-list" value={from} onChange={(event) => setFrom(event.target.value)} placeholder={selectedNodeId || dataset.nodes[0]?.id || "id"} /></label>
    <label className="sm-field">Destino (ID de nó)<input list="knowledge-node-list" value={to} onChange={(event) => setTo(event.target.value)} placeholder="Digite ou selecione o ID" /></label>
    <datalist id="knowledge-node-list">{dataset.nodes.slice(0, 2000).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist>
    <label className="sm-consent"><input type="checkbox" checked={evidenceOnly} onChange={(event) => setEvidenceOnly(event.target.checked)} />Exigir citação verificada em cada relação do caminho</label>
    <div className="sm-actions"><button className="primary-button" onClick={findPath}>Encontrar caminho</button>{path && <button className="quiet" onClick={() => download("knowledge-path.json", jsonBlob(path))}>Exportar caminho</button>}</div>
    {path && <article className="sm-answer"><h4>{path.found ? "Caminho encontrado" : "Sem caminho demonstrável"}</h4><p className="sm-path-narrative">{groundedPathNarrative(path, dataset)}</p>{path.found && <><small>Cobertura de citações: {(pathEvidenceCoverage(path) * 100).toFixed(0)}%. Uma aresta sem citação não vira fato por ter sido desenhada.</small><div className="sm-actions compact">{path.nodes.map((id, i) => <button key={id + i} onClick={() => onHighlight(id)}>{nodeLabels.get(id) || id}</button>)}</div></>}</article>}

    <div className="sm-section-heading"><div><h3>Fontes e extração incremental</h3><p>Divisão em seções, fingerprints e auditoria do que realmente mudou.</p></div></div>
    <div className="sm-metrics"><span><b>{chunks.length}</b> chunks</span><span><b>{incremental.changed.length}</b> novos/alterados</span><span><b>{incremental.removedChunkIds.length}</b> removidos</span><span><b>{incremental.staleAssertionIds.length}</b> afirmações dependentes</span></div>
    <div className="sm-actions"><button className="quiet" onClick={snapshotChunkIndex} disabled={!manifest}>Registrar índice local</button><button className="quiet" onClick={() => download("incremental-plan.json", jsonBlob({ changedChunkIds: incremental.changed.map((x) => x.chunkId), removedChunkIds: incremental.removedChunkIds, staleAssertionIds: incremental.staleAssertionIds }))}>Exportar delta</button></div>
    {manifest && bridgeUrl.trim() && <details className="sm-advanced-disclosure"><summary>Extração semântica com IA · ação explícita</summary>
      <p>Até 4 chunks (máximo {consentBytes} bytes) e contexto limitado do grafo serão enviados à ponte configurada. Não há envio ao abrir esta aba.</p>
      <details><summary>Revisar texto exato de cada chunk</summary>{extractChunks.map((chunk) => <pre key={chunk.chunkId}>{chunk.sourceId} · {chunk.chunkId}\n{chunk.text.slice(0, 3000)}</pre>)}</details>
      <label className="sm-consent"><input type="checkbox" checked={allowChunkUpload} onChange={(event) => setAllowChunkUpload(event.target.checked)} />Autorizo este envio específico à ponte {bridgeUrl}.</label>
      <button disabled={!allowChunkUpload || !extractChunks.length || runningExtract} onClick={() => void extract()}>{runningExtract ? "Extraindo…" : "Extrair candidatas"}</button>
    </details>}
    {extraction && <div className="sm-answer"><h4>Resultado da extração</h4><p>{extraction.assertions.length} afirmações candidatas · {extraction.proposals?.length || 0} propostas · {extraction.complete ? "completo" : "parcial"}{extraction.truncated ? " · truncado" : ""}</p>{extraction.errors.map((message, i) => <p key={i}>{message}</p>)}<div className="sm-actions">{extraction.proposals?.map((item, i) => <button key={item.proposalId + i} onClick={() => onReviewProposal(item)}>Revisar proposta {i + 1}</button>)}</div></div>}

    <div className="sm-section-heading"><div><h3>Interoperabilidade</h3><p>Exportação Obsidian nativa, sem substituir o renderer. Graphify entra apenas como prévia não confiável.</p></div></div>
    <div className="sm-actions"><button className="primary-button" onClick={exportVault}>Baixar vault Obsidian + Canvas (.zip)</button><button onClick={() => download("knowledge-graph.graphml", new Blob([exportGraphML(dataset)], { type: "application/xml" }))}>GraphML</button></div>
    <label className="sm-field">Inspecionar graph.json do Graphify<input type="file" accept=".json,application/json" onChange={(event) => void importGraphify(event)} /></label>
    {preview && <article className="sm-answer"><b>Prévia não verificada</b><p>{preview.nodes.length} nós · {preview.links.length} relações. Nenhuma importação foi aplicada ao grafo.</p>{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}<button className="quiet" onClick={() => download("graphify-import-preview.json", jsonBlob(preview))}>Exportar auditoria da prévia</button></article>}
    </details>
  </section>;
}

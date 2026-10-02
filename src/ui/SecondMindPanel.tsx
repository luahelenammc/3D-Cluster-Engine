import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { GraphDataset, GraphNode } from "../core/types";
import type { GraphStore } from "../data/graph-store";
import { requestGraphProposal, getBridgeHealth, normalizeBridgeUrl, requestQueryAnswer } from "../second-mind/ai-bridge";
import { diffDatasets, createHistorySnapshot } from "../second-mind/history";
import { buildSourceMapDataset, compileMarkdownDeterministically, validateProposal, applyGraphDelta } from "../second-mind/proposals";
import { buildEvidencePacket, parseImportedAnswer, queryFallbackMessage, validateQueryAnswer } from "../second-mind/query";
import { listHistorySnapshots, loadVaultManifest, saveHistorySnapshot, saveVaultManifest } from "../second-mind/persistence";
import { buildWritebackExport, createWritebackProposal } from "../second-mind/writeback";
import type { DatasetDiff, GraphDeltaOperation, GraphDeltaProposal, HistorySnapshot, QueryAnswer, QueryEvidencePacket, SourceDiff, SourceManifest, WritebackProposal } from "../second-mind/types";
import { buildSourceManifest } from "../second-mind/markdown";

type PanelTab = "sources" | "changes" | "ask" | "history" | "writeback";
type Toast = { type: "ok" | "error" | "info"; message: string } | null;

interface Props {
  dataset: GraphDataset;
  store: GraphStore;
  selectedNode: GraphNode | null;
  onClose(): void;
  onLoadDataset(dataset: GraphDataset): void;
  onHighlight(nodeId: string): void;
  onToast(toast: Toast): void;
}

const TAB_LABELS: Array<{ id: PanelTab; label: string }> = [
  { id: "sources", label: "Fontes" },
  { id: "changes", label: "Propostas" },
  { id: "ask", label: "Perguntar" },
  { id: "history", label: "Histórico" },
  { id: "writeback", label: "Retorno à fonte" },
];

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function changedSourceIds(diff: SourceDiff | null, manifest: SourceManifest): string[] {
  if (!diff || diff.entries.length === 0) return manifest.sources.map((source) => source.sourceId);
  return diff.entries.filter((entry) => ["added", "modified", "renamed", "ambiguous"].includes(entry.kind)).map((entry) => entry.sourceId).filter((id) => manifest.sources.some((source) => source.sourceId === id));
}

function boundedGraph(dataset: GraphDataset, manifest: SourceManifest, selectedSources: string[]): GraphDataset {
  const needles = manifest.sources.filter((source) => selectedSources.includes(source.sourceId)).flatMap((source) => [source.title, ...source.headings.slice(0, 5).map((heading) => heading.text)]).join(" ").toLocaleLowerCase();
  const scored = dataset.nodes.filter((node) => node.id.length <= 500 && node.cluster.length <= 200).map((node) => {
    const metadata = node.metadata?.secondMind;
    const data = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
    const refs = Array.isArray(data.sourceRefs) ? data.sourceRefs : [];
    const direct = selectedSources.includes(String(data.sourceId || "")) || refs.some((ref) => Boolean(ref && typeof ref === "object" && selectedSources.includes(String((ref as Record<string, unknown>).sourceId))));
    const lexical = `${node.label} ${(node.tags || []).join(" ")}`.toLocaleLowerCase().split(/\W+/).filter((word) => word.length > 2 && needles.includes(word)).length;
    return { node, score: (direct ? 10 : 0) + lexical };
  }).sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id)).slice(0, 50);
  const ids = new Set(scored.map((item) => item.node.id));
  const links = dataset.links.filter((link) => ids.has(link.source) && ids.has(link.target) && (link.id?.length || 0) <= 500).slice(0, 100).map((link) => ({ id: link.id, source: link.source, target: link.target, type: link.type?.slice(0, 120), weight: link.weight, directed: link.directed }));
  const nodes = scored.map(({ node }) => {
    const raw = node.metadata?.secondMind;
    const metadata = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const bounded: Record<string, unknown> = {};
    for (const key of ["kind", "sourceId", "path", "fingerprint", "anchor", "epistemicStatus", "retired"] as const) {
      const value = metadata[key];
      if (typeof value === "string") bounded[key] = value.slice(0, 300);
      else if (typeof value === "boolean") bounded[key] = value;
    }
    if (Array.isArray(metadata.sourceRefs)) bounded.sourceRefs = metadata.sourceRefs.slice(0, 3).flatMap((reference) => {
      if (!reference || typeof reference !== "object") return [];
      const ref = reference as Record<string, unknown>;
      if (typeof ref.sourceId !== "string" || typeof ref.path !== "string" || typeof ref.fingerprint !== "string") return [];
      return [{ sourceId: ref.sourceId.slice(0, 1024), path: ref.path.slice(0, 512), fingerprint: ref.fingerprint.slice(0, 80), ...(typeof ref.anchor === "string" ? { anchor: ref.anchor.slice(0, 120) } : {}) }];
    });
    return { id: node.id, label: node.label.slice(0, 300), cluster: node.cluster, value: node.value, level: node.level, tags: (node.tags || []).slice(0, 20).map((tag) => tag.slice(0, 64)), metadata: Object.keys(bounded).length ? { secondMind: bounded } : undefined };
  });
  const clusters = dataset.clusters.filter((cluster) => cluster.id.length <= 200 && scored.some(({ node }) => node.cluster === cluster.id)).slice(0, 50).map((cluster) => ({ id: cluster.id, label: cluster.label.slice(0, 300) }));
  return { schemaVersion: "1.1", meta: { id: dataset.meta.id, title: dataset.meta.title, version: dataset.meta.version }, clusters, nodes, links, extensions: undefined };
}

function clipUtf8(value: string, maxBytes: number, maxCharacters: number): { text: string; bytes: number } {
  const encoder = new TextEncoder();
  let bytes = 0;
  let characters = 0;
  let text = "";
  for (const character of value) {
    if (characters >= maxCharacters) break;
    const size = encoder.encode(character).byteLength;
    if (bytes + size > maxBytes) break;
    text += character;
    bytes += size;
    characters += 1;
  }
  return { text, bytes };
}

function clipFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const bounded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter).slice(0, 12)) {
    if (typeof value === "string") bounded[key.slice(0, 80)] = value.slice(0, 128);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) bounded[key.slice(0, 80)] = value;
    else if (Array.isArray(value)) bounded[key.slice(0, 80)] = value.slice(0, 8).flatMap((item) => typeof item === "string" ? [item.slice(0, 64)] : typeof item === "number" || typeof item === "boolean" || item === null ? [item] : []);
  }
  return bounded;
}

function clippedManifest(manifest: SourceManifest, ids: string[]): SourceManifest {
  let remainingBytes = 24_000;
  const sources = manifest.sources.filter((source) => ids.includes(source.sourceId)).slice(0, 8).map((source) => {
    const clipped = clipUtf8(source.content, remainingBytes, 3000);
    remainingBytes -= clipped.bytes;
    const links = source.links.slice(0, 40).map((link) => ({ ...link, target: link.target.slice(0, 512), anchor: link.anchor?.slice(0, 120), fromAnchor: link.fromAnchor?.slice(0, 120), resolvedSourceId: link.resolvedSourceId?.slice(0, 1024), candidates: link.candidates?.slice(0, 3).map((candidate) => candidate.slice(0, 256)) }));
    const headings = source.headings.slice(0, 50).map((heading) => ({ ...heading, text: heading.text.slice(0, 300), anchor: heading.anchor.slice(0, 120) }));
    return { ...source, headings, tags: source.tags.slice(0, 40).map((tag) => tag.slice(0, 80)), frontmatter: clipFrontmatter(source.frontmatter), links, content: clipped.text, byteLength: clipped.bytes };
  });
  return { ...manifest, sources };
}

function opLabel(operation: GraphDeltaOperation): string {
  if (operation.kind === "add-node") return `Adicionar nó · ${operation.node.label}`;
  if (operation.kind === "update-node") return `Atualizar nó · ${operation.nodeId}`;
  if (operation.kind === "retire-node") return `Aposentar nó · ${operation.nodeId}`;
  if (operation.kind === "delete-node") return `Excluir nó · ${operation.nodeId}`;
  if (operation.kind === "add-link") return `Adicionar relação · ${operation.link.source} → ${operation.link.target}`;
  if (operation.kind === "update-link") return `Atualizar relação · ${operation.linkId}`;
  if (operation.kind === "retire-link") return `Aposentar relação · ${operation.linkId}`;
  if (operation.kind === "delete-link") return `Excluir relação · ${operation.linkId}`;
  if (operation.kind === "add-cluster") return `Adicionar cluster · ${operation.cluster.label}`;
  if (operation.kind === "update-cluster") return `Atualizar cluster · ${operation.clusterId}`;
  return `Excluir cluster · ${operation.clusterId}`;
}

function operationReady(operation: GraphDeltaOperation, dataset: GraphDataset): string | null {
  const nodeIds = new Set(dataset.nodes.map((node) => node.id));
  const clusterIds = new Set(dataset.clusters.map((cluster) => cluster.id));
  const linkIds = new Set(dataset.links.map((link) => link.id));
  if (operation.kind === "add-node" && !clusterIds.has(operation.node.cluster)) return "Aceite primeiro o cluster provisório indicado nesta proposta.";
  if (operation.kind === "add-link" && (!nodeIds.has(operation.link.source) || !nodeIds.has(operation.link.target))) return "Aceite primeiro os nós de origem e destino.";
  if (operation.kind === "update-node" && !nodeIds.has(operation.nodeId)) return "O nó-alvo não existe no estado atual.";
  if (["retire-node", "delete-node"].includes(operation.kind) && !nodeIds.has("nodeId" in operation ? operation.nodeId : "")) return "O nó-alvo não existe no estado atual.";
  if (["update-link", "retire-link", "delete-link"].includes(operation.kind) && !linkIds.has("linkId" in operation ? operation.linkId : "")) return "A relação-alvo não existe no estado atual.";
  if (operation.kind === "update-cluster" && !clusterIds.has(operation.clusterId)) return "O cluster-alvo não existe no estado atual.";
  if (operation.kind === "delete-cluster" && dataset.nodes.some((node) => node.cluster === operation.clusterId) && !operation.reassignTo) return "A exclusão precisa indicar um cluster de destino.";
  return null;
}

function diffLabel(diff: DatasetDiff | null) {
  if (!diff) return "";
  const count = (item: { added: string[]; removed: string[]; changed: string[] }) => item.added.length + item.removed.length + item.changed.length;
  const config = Object.entries(diff.semanticConfig).filter(([, changed]) => changed).map(([key]) => ({ metadata: "metadados", axes: "eixos semânticos", extensions: "extensões" }[key as "metadata" | "axes" | "extensions"]));
  return `${count(diff.nodes)} mudanças em nós · ${count(diff.links)} em relações · ${count(diff.clusters)} em clusters${config.length ? ` · configuração: ${config.join(", ")}` : ""}`;
}

export default function SecondMindPanel({ dataset, store, selectedNode, onClose, onLoadDataset, onHighlight, onToast }: Props) {
  const [tab, setTab] = useState<PanelTab>("sources");
  const [manifest, setManifest] = useState<SourceManifest | null>(null);
  const [sourceDiff, setSourceDiff] = useState<SourceDiff | null>(null);
  const [loadingVault, setLoadingVault] = useState(false);
  const [mode, setMode] = useState<"source-map" | "semantic-compile">("semantic-compile");
  const [proposal, setProposal] = useState<GraphDeltaProposal | null>(null);
  const [decisionLog, setDecisionLog] = useState<Array<{ id: string; state: "accepted" | "rejected" }>>([]);
  const [proposalJson, setProposalJson] = useState("");
  const [query, setQuery] = useState("");
  const [packet, setPacket] = useState<QueryEvidencePacket | null>(null);
  const [answer, setAnswer] = useState<QueryAnswer | null>(null);
  const [answerJson, setAnswerJson] = useState("");
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [bridgeAccessToken, setBridgeAccessToken] = useState("");
  const [bridgeHealth, setBridgeHealth] = useState<{ state: "unknown" | "ready" | "unavailable"; message: string }>({ state: "unknown", message: "Ponte opcional; nenhuma conexão é feita por padrão." });
  const [aiConsent, setAiConsent] = useState(false);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState("");
  const [restorePreview, setRestorePreview] = useState<DatasetDiff | null>(null);
  const [writeback, setWriteback] = useState<WritebackProposal | null>(null);
  const [sending, setSending] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const previousManifest = useRef<SourceManifest | undefined>(undefined);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
    const stored = localStorage.getItem("lms3d.ai-bridge-url.v1");
    if (stored) setBridgeUrl(stored);
    void loadVaultManifest().then((value) => { if (value) { setManifest(value); previousManifest.current = value; } }).catch(() => undefined);
  }, []);

  useEffect(() => { if (bridgeUrl.trim()) localStorage.setItem("lms3d.ai-bridge-url.v1", bridgeUrl.trim()); else localStorage.removeItem("lms3d.ai-bridge-url.v1"); }, [bridgeUrl]);
  useEffect(() => {
    setRestorePreview(null);
    void listHistorySnapshots(dataset.meta.id).then(setHistory).catch(() => setHistory([]));
  }, [dataset.meta.id]);

  const proposalValidation = useMemo(() => proposal ? validateProposal(proposal, dataset, manifest || undefined) : null, [proposal, dataset, manifest]);
  const pendingOperations = proposal?.operations || [];
  const aiSourceIds = useMemo(() => manifest ? changedSourceIds(sourceDiff, manifest).slice(0, 8) : [], [sourceDiff, manifest]);
  const aiManifest = useMemo(() => manifest ? clippedManifest(manifest, aiSourceIds) : null, [manifest, aiSourceIds]);
  const aiSources = aiManifest?.sources || [];
  const aiGraph = useMemo(() => manifest ? boundedGraph(dataset, manifest, aiSourceIds) : null, [dataset, manifest, aiSourceIds]);

  async function importVault(files: File[]) {
    setLoadingVault(true);
    try {
      const result = await buildSourceManifest(files, previousManifest.current);
      await saveVaultManifest(result.manifest);
      previousManifest.current = result.manifest;
      setManifest(result.manifest); setSourceDiff(result.diff); setProposal(null); setDecisionLog([]); setAiConsent(false);
      onToast({ type: "ok", message: `Vault lido localmente: ${result.manifest.sources.length} notas · ${result.diff.added} novas · ${result.diff.modified} alteradas · ${result.diff.removed} removidas.` });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao ler o vault." }); }
    finally { setLoadingVault(false); }
  }

  function generateLocalProposal() {
    if (!manifest) return onToast({ type: "info", message: "Importe um vault Markdown primeiro." });
    const ids = changedSourceIds(sourceDiff, manifest);
    const next = compileMarkdownDeterministically(dataset, manifest, ids);
    setProposal(next); setDecisionLog([]); setProposalJson(""); setTab("changes");
    onToast({ type: "info", message: `${next.operations.length} candidato(s) prontos para revisão. Nenhuma alteração foi aplicada.` });
  }

  async function compileWithBridge() {
    if (!manifest || !aiManifest || !aiGraph || !bridgeUrl.trim()) return onToast({ type: "info", message: "Importe fontes e configure a URL de uma ponte primeiro." });
    if (dataset.meta.id.length > 200) return onToast({ type: "error", message: "Este dataset ID excede o limite de 200 caracteres da proposta GraphDelta." });
    if (!aiConsent) return onToast({ type: "info", message: "Marque a autorização de envio depois de revisar os trechos listados." });
    setSending(true);
    try {
      const url = normalizeBridgeUrl(bridgeUrl);
      const health = await getBridgeHealth(url, bridgeAccessToken);
      if (!health.providerConfigured) throw new Error("A ponte está acessível, mas não há provedor configurado no servidor.");
      const input = { dataset: aiGraph, manifest: aiManifest, changedSourceIds: aiManifest.sources.map((source) => source.sourceId) };
      const result = await requestGraphProposal(url, input, bridgeAccessToken);
      const validation = validateProposal(result, dataset, aiManifest);
      if (!validation.valid) throw new Error(`A resposta não passou pela validação local: ${validation.errors.join(" ")}`);
      setProposal(result); setDecisionLog([]); setTab("changes"); setAiConsent(false);
      onToast({ type: "ok", message: `${result.operations.length} proposta(s) recebida(s); nada foi gravado automaticamente.` });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha na compilação pela ponte." }); }
    finally { setSending(false); }
  }

  function acceptOperations(ids: string[]) {
    if (!proposal) return;
    try {
      const next = applyGraphDelta(dataset, proposal, ids, manifest || undefined);
      store.commitDataset(next);
      setDecisionLog((current) => [...current, ...ids.map((id) => ({ id, state: "accepted" as const }))]);
      const remaining = proposal.operations.filter((operation) => !ids.includes(operation.operationId));
      setProposal(remaining.length ? { ...proposal, operations: remaining } : null);
      void saveHistorySnapshot(createHistorySnapshot(next, { sourceManifestFingerprint: manifest?.fingerprint, acceptedProposalId: proposal.proposalId, reason: `proposal:${ids.length} operation(s) accepted` })).then(() => listHistorySnapshots(next.meta.id).then(setHistory)).catch(() => onToast({ type: "error", message: "Proposta aplicada, mas não foi possível gravar o snapshot local." }));
      onToast({ type: "ok", message: `${ids.length} operação(ões) aceita(s). O estado canônico foi validado e permanece desfazível.` });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "A proposta não pôde ser aplicada." }); }
  }

  function rejectOperation(operation: GraphDeltaOperation) {
    if (!proposal) return;
    const rejected = new Set([operation.operationId]);
    if (operation.kind === "add-cluster") for (const candidate of proposal.operations) if (candidate.kind === "add-node" && candidate.node.cluster === operation.cluster.id) rejected.add(candidate.operationId);
    if (operation.kind === "add-node") for (const candidate of proposal.operations) if (candidate.kind === "add-link" && (candidate.link.source === operation.node.id || candidate.link.target === operation.node.id)) rejected.add(candidate.operationId);
    setDecisionLog((current) => [...current, ...[...rejected].map((id) => ({ id, state: "rejected" as const }))]);
    const remaining = proposal.operations.filter((candidate) => !rejected.has(candidate.operationId));
    setProposal(remaining.length ? { ...proposal, operations: remaining } : null);
    onToast({ type: "info", message: `${rejected.size} operação(ões) rejeitada(s); dependências diretas também foram removidas.` });
  }

  function importProposal() {
    if (!proposalJson.trim()) return;
    try {
      const parsed = JSON.parse(proposalJson) as GraphDeltaProposal;
      const validation = validateProposal(parsed, dataset, manifest || undefined);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      setProposal(parsed); setDecisionLog([]); setTab("changes");
      onToast({ type: "ok", message: "Proposta importada para revisão; ainda não foi aplicada." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "JSON de proposta inválido." }); }
  }

  function buildPacket() {
    try { const next = buildEvidencePacket(dataset, manifest || undefined, query, selectedNode?.id); setPacket(next); setAnswer(null); setAnswerJson(""); setAiConsent(false); }
    catch (error) { onToast({ type: "info", message: error instanceof Error ? error.message : "Não foi possível montar o pacote." }); }
  }

  async function askBridge() {
    if (!packet || !bridgeUrl.trim()) return onToast({ type: "info", message: "Monte primeiro um pacote de evidências e configure a ponte." });
    if (!aiConsent) return onToast({ type: "info", message: "Revise os trechos e autorize explicitamente o envio." });
    setSending(true);
    try {
      const url = normalizeBridgeUrl(bridgeUrl);
      const health = await getBridgeHealth(url, bridgeAccessToken);
      if (!health.providerConfigured) throw new Error("A ponte está acessível, mas não há provedor configurado no servidor.");
      const result = await requestQueryAnswer(url, packet, bridgeAccessToken);
      const validation = validateQueryAnswer(result, packet);
      if (!validation.valid) throw new Error(`Resposta rejeitada localmente: ${validation.errors.join(" ")}`);
      setAnswer(result); setAiConsent(false);
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha na consulta pela ponte." }); }
    finally { setSending(false); }
  }

  async function checkBridge() {
    if (!bridgeUrl.trim()) { setBridgeHealth({ state: "unavailable", message: "Nenhuma URL de ponte configurada." }); return; }
    try {
      const health = await getBridgeHealth(bridgeUrl, bridgeAccessToken);
      setBridgeHealth({ state: health.providerConfigured ? "ready" : "unavailable", message: health.providerConfigured ? "Ponte ativa. Nenhum conteúdo foi enviado nesta verificação." : "Serviço encontrado, sem provedor configurado." });
    } catch (error) { setBridgeHealth({ state: "unavailable", message: error instanceof Error ? error.message : "Ponte indisponível." }); }
  }

  async function recordSnapshot(reason: string) {
    try {
      await saveHistorySnapshot(createHistorySnapshot(dataset, { sourceManifestFingerprint: manifest?.fingerprint, reason }));
      setHistory(await listHistorySnapshots(dataset.meta.id));
      onToast({ type: "ok", message: "Snapshot semântico registrado neste dispositivo." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao gravar histórico local." }); }
  }

  async function previewRestore(snapshot: HistorySnapshot) {
    setSelectedSnapshot(snapshot.snapshotId);
    setRestorePreview(diffDatasets(dataset, snapshot.dataset));
  }

  async function restoreSnapshot() {
    const snapshot = history.find((item) => item.snapshotId === selectedSnapshot);
    if (!snapshot || !restorePreview) return;
    try {
      await saveHistorySnapshot(createHistorySnapshot(dataset, { sourceManifestFingerprint: manifest?.fingerprint, reason: `before restore ${snapshot.snapshotId}` }));
      store.commitDataset(snapshot.dataset);
      await saveHistorySnapshot(createHistorySnapshot(snapshot.dataset, { sourceManifestFingerprint: snapshot.sourceManifestFingerprint, reason: `restored ${snapshot.snapshotId}` }));
      setHistory(await listHistorySnapshots(snapshot.datasetId)); setRestorePreview(null);
      onToast({ type: "ok", message: "Snapshot restaurado após prévia; o estado anterior está no histórico e em desfazer." });
    } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao restaurar snapshot." }); }
  }

  function createWriteback() {
    if (!selectedNode || !manifest) return onToast({ type: "info", message: "Selecione um nó com proveniência Markdown e importe o vault atual." });
    try { setWriteback(createWritebackProposal(selectedNode, manifest)); }
    catch (error) { onToast({ type: "info", message: error instanceof Error ? error.message : "Não há caminho seguro para writeback." }); }
  }

  const restoreSnapshotData = history.find((item) => item.snapshotId === selectedSnapshot);

  return <div className="second-mind-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="second-mind-panel" role="dialog" aria-modal="true" aria-labelledby="second-mind-title">
      <header className="second-mind-header">
        <div><p className="eyebrow">SECOND MIND · CAMADA LOCAL</p><h2 id="second-mind-title">Fontes, propostas e continuidade</h2><p>O vault fica neste dispositivo. A engine não envia conteúdo sem uma autorização explícita por ação.</p></div>
        <button className="close-button" onClick={onClose} aria-label="Fechar Second Mind">×</button>
      </header>
      <nav className="second-mind-tabs" role="tablist" aria-label="Áreas do Second Mind">
        {TAB_LABELS.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}>{item.label}{item.id === "changes" && pendingOperations.length > 0 ? <b>{pendingOperations.length}</b> : null}</button>)}
      </nav>

      <div className="second-mind-body">
        {tab === "sources" && <section className="second-mind-section" role="tabpanel">
          <div className="sm-section-heading"><div><h3>Entrada Markdown / Obsidian</h3><p>Leitura local, manifestação com proveniência e diff. Arquivos e pastas não viram ontologia por acidente.</p></div></div>
          <div className="sm-actions"><button onClick={() => filesInput.current?.click()} disabled={loadingVault}>Selecionar notas</button><button onClick={() => folderInput.current?.click()} disabled={loadingVault}>Selecionar pasta</button><button className="quiet" onClick={() => void generateLocalProposal()} disabled={!manifest}>Gerar candidatos locais</button></div>
          <input ref={filesInput} className="sr-only" type="file" accept=".md,text/markdown" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { void importVault(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ""; }} />
          <input ref={folderInput} className="sr-only" type="file" accept=".md,text/markdown" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { void importVault(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ""; }} />
          <p className="sm-local-note">{loadingVault ? "Lendo arquivos neste dispositivo…" : "Limites: 2.000 notas, 5 MiB por nota, 25 MiB por importação. Nenhum upload ocorre nesta etapa."}</p>
          {manifest ? <>
            <div className="sm-metrics"><span><b>{manifest.sources.length}</b> notas</span><span><b>{manifest.sources.reduce((sum, source) => sum + source.headings.length, 0)}</b> títulos</span><span><b>{manifest.sources.reduce((sum, source) => sum + source.links.length, 0)}</b> links</span><span><b>{manifest.sources.reduce((sum, source) => sum + source.tags.length, 0)}</b> tags</span></div>
            {sourceDiff && <div className="sm-diff-strip"><b>Reingestão</b><span>{sourceDiff.added} novas · {sourceDiff.modified} alteradas · {sourceDiff.removed} removidas · {sourceDiff.renamed} renomeadas · {sourceDiff.ambiguous} ambíguas · {sourceDiff.unchanged} iguais</span></div>}
            <label className="sm-field">Modo de leitura<select value={mode} onChange={(event) => setMode(event.target.value as "source-map" | "semantic-compile")}><option value="semantic-compile">Conteúdo como proveniência · recomendado</option><option value="source-map">Mapa documental de arquivos e links</option></select></label>
            <p className="sm-explanation">{mode === "source-map" ? "Cria um dataset documental explícito a partir de arquivos e links internos. Ele substitui o grafo aberto em uma única transação desfazível." : "Títulos e relações Markdown viram apenas candidatos com evidência; nada entra no grafo sem revisão."}</p>
            {mode === "source-map" && <button className="primary-button" onClick={() => { const mapped = buildSourceMapDataset(manifest); onLoadDataset(mapped); setTab("history"); void saveHistorySnapshot(createHistorySnapshot(mapped, { sourceManifestFingerprint: manifest.fingerprint, reason: "source-map compiled locally" })).then(() => listHistorySnapshots(mapped.meta.id).then(setHistory)); onToast({ type: "ok", message: "Mapa de fontes criado localmente. A operação pode ser desfeita." }); }}>Criar mapa de fontes</button>}
            {mode === "semantic-compile" && <div className="sm-ai-box">
              <label className="sm-field">Ponte opcional<input type="url" value={bridgeUrl} onChange={(event) => { setBridgeUrl(event.target.value); setAiConsent(false); setBridgeHealth({ state: "unknown", message: "Verifique a URL antes de enviar." }); }} placeholder="https://sua-ponte.example" /></label>
              <label className="sm-field">Token de acesso da ponte<input type="password" autoComplete="off" value={bridgeAccessToken} onChange={(event) => { setBridgeAccessToken(event.target.value); setAiConsent(false); }} placeholder="Opcional · exigido se a ponte estiver protegida" /><small>Fica apenas na memória desta aba. A chave do provedor permanece no servidor.</small></label>
              <div className={`sm-health ${bridgeHealth.state}`}>{bridgeHealth.message}<button type="button" className="quiet" onClick={() => void checkBridge()}>Verificar</button></div>
              {aiSources.length > 0 && <><details className="sm-disclosure"><summary>Revisar manifesto exato de fontes enviado ({aiSources.length} notas, até 24 mil bytes)</summary><pre>{JSON.stringify(aiManifest, null, 2)}</pre></details><details className="sm-disclosure"><summary>Revisar recorte exato do grafo enviado</summary><pre>{JSON.stringify(aiGraph, null, 2)}</pre></details></>}
              <label className="sm-consent"><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} disabled={!aiSources.length} />Se eu escolher “Compilar com IA”, autorizo enviar à ponte configurada somente as fontes e o recorte de grafo exibidos acima. A resposta volta como proposta revisável.</label>
              <button className="sm-secondary-action" onClick={() => void compileWithBridge()} disabled={!manifest || !bridgeUrl.trim() || !aiConsent || sending}>{sending ? "Compilando…" : "Compilar com IA"}</button>
              <small>Sem ponte ativa, “Gerar candidatos locais” usa apenas títulos e links explícitos, sem modelo e sem rede.</small>
            </div>}
            <div className="sm-source-list"><h4>Notas no manifesto local</h4>{manifest.sources.slice(0, 30).map((source) => <details key={source.sourceId}><summary>{source.path} <small>{source.headings.length} títulos · {source.links.length} links · {source.tags.length} tags</small></summary><p>{source.tags.length ? `Tags: ${source.tags.join(", ")}` : "Sem tags"}</p>{source.headings.map((heading) => <span className="sm-heading-chip" key={`${source.sourceId}#${heading.anchor}`}>{"#".repeat(heading.depth)} {heading.text}</span>)}{source.links.filter((link) => link.resolution !== "resolved").map((link, index) => <small className="sm-warning" key={`${link.target}:${index}`}>{link.resolution === "ambiguous" ? "Ambíguo" : "Sem destino"}: {link.target}{link.candidates?.length ? ` · ${link.candidates.join(", ")}` : ""}</small>)}</details>)}{manifest.sources.length > 30 && <p>Exibindo as primeiras 30 notas; o manifesto completo segue localmente.</p>}</div>
          </> : <div className="sm-empty"><b>Nenhuma fonte ativa</b><p>Selecione arquivos Markdown ou uma pasta. A leitura não pede login nem transmite conteúdo.</p></div>}
        </section>}

        {tab === "changes" && <section className="second-mind-section" role="tabpanel">
          <div className="sm-section-heading"><div><h3>Propostas GraphDelta</h3><p>Compilador e IA sugerem; a revisão humana autoriza. Aceitar uma operação grava uma transação desfazível no GraphStore.</p></div></div>
          {proposal ? <>
            <div className="sm-proposal-summary"><b>{proposal.summary}</b><span>{proposal.compiler} · dataset {proposal.datasetId} · {proposal.operations.length} pendentes</span>{proposalValidation?.warnings.map((warning) => <small className="sm-warning" key={warning}>{warning}</small>)}{proposalValidation?.errors.map((error) => <small className="sm-error" key={error}>{error}</small>)}</div>
            <div className="sm-actions"><button className="primary-button" onClick={() => acceptOperations(pendingOperations.map((operation) => operation.operationId))} disabled={!proposalValidation?.valid || Boolean(proposalValidation.warnings.length)}>Aceitar grupo seguro</button><button className="danger-quiet" onClick={() => { setProposal(null); setDecisionLog((current) => [...current, ...pendingOperations.map((operation) => ({ id: operation.operationId, state: "rejected" as const }))]); }}>Rejeitar restantes</button></div>
            <div className="sm-operation-list">{pendingOperations.map((operation) => { const blocker = operationReady(operation, dataset); return <article className="sm-operation" key={operation.operationId}>
              <div className="sm-operation-head"><b>{opLabel(operation)}</b><span>{Math.round(operation.confidence * 100)}% · {operation.epistemicStatus}</span></div>
              <p>{operation.rationale}</p>
              <details><summary>Antes/depois e evidência</summary><pre>{JSON.stringify(operation.kind === "add-node" ? { before: null, after: operation.node } : operation.kind === "add-link" ? { before: null, after: operation.link } : operation, null, 2)}</pre>{operation.evidence.map((evidence, index) => <blockquote key={`${evidence.sourceId}:${index}`}><b>{evidence.path}{evidence.anchor ? `#${evidence.anchor}` : ""}</b><span>{evidence.derivation}</span><p>{evidence.quote}</p></blockquote>)}</details>
              {blocker && <small className="sm-warning">{blocker}</small>}
              <div className="sm-actions compact"><button onClick={() => acceptOperations([operation.operationId])} disabled={Boolean(blocker) || !proposalValidation?.valid}>Aceitar</button><button className="danger-quiet" onClick={() => rejectOperation(operation)}>Rejeitar</button></div>
            </article>; })}</div>
          </> : <div className="sm-empty"><b>Sem proposta pendente</b><p>Gere candidatos determinísticos na aba Fontes, consulte uma ponte opcional ou importe uma proposta JSON. O estado canônico ainda não mudou.</p></div>}
          <details className="sm-import-proposal"><summary>Importar proposta JSON externa</summary><textarea rows={8} value={proposalJson} onChange={(event) => setProposalJson(event.target.value)} placeholder="Cole um objeto GraphDeltaProposal com evidência e referências." /><button onClick={importProposal}>Validar e carregar para revisão</button></details>
          {decisionLog.length > 0 && <div className="sm-decision-log"><b>Decisões desta sessão</b>{decisionLog.map((item, index) => <span key={`${item.id}:${index}`}>{item.state === "accepted" ? "✓ Aceita" : "× Rejeitada"} · {item.id}</span>)}</div>}
        </section>}

        {tab === "ask" && <section className="second-mind-section" role="tabpanel">
          <div className="sm-section-heading"><div><h3>Consulta com evidência</h3><p>Busca lexical e vizinhança local montam um pacote pequeno. Sem provedor, exporte-o ou importe resposta externa estruturada.</p></div></div>
          <label className="sm-field">Pergunta<textarea rows={3} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="O que as fontes dizem sobre…" /></label>
          <div className="sm-actions"><button className="primary-button" onClick={buildPacket}>Montar pacote local</button><button className="quiet" disabled={!packet} onClick={() => packet && downloadJson("evidence-packet.json", packet)}>Exportar pacote</button></div>
          <label className="sm-field">Ponte opcional<input type="url" value={bridgeUrl} onChange={(event) => { setBridgeUrl(event.target.value); setAiConsent(false); setBridgeHealth({ state: "unknown", message: "Verifique a URL antes de enviar." }); }} placeholder="https://sua-ponte.example" /></label>
          <label className="sm-field">Token de acesso da ponte<input type="password" autoComplete="off" value={bridgeAccessToken} onChange={(event) => { setBridgeAccessToken(event.target.value); setAiConsent(false); }} placeholder="Opcional · exigido se a ponte estiver protegida" /><small>Fica apenas na memória desta aba. A chave do provedor permanece no servidor.</small></label>
          <div className={`sm-health ${bridgeHealth.state}`}>{bridgeHealth.message}<button type="button" className="quiet" onClick={() => void checkBridge()}>Verificar</button></div>
          {packet && <>
            <p className="sm-fallback">{queryFallbackMessage(packet)}</p>
            <div className="sm-evidence-summary"><b>{packet.nodes.length} nós · {packet.sources.length} trechos</b><small>Dataset: {packet.datasetId}</small></div>
            <div className="sm-evidence-list">{packet.nodes.map((node) => <button key={node.nodeId} onClick={() => onHighlight(node.nodeId)}><b>{node.label}</b><span>nó {node.nodeId} · score {node.score}</span></button>)}{packet.sources.map((source) => <details key={source.sourceId}><summary>{source.path}{source.anchor ? ` · #${source.anchor}` : ""}</summary><p>{source.excerpt}</p></details>)}</div>
            <details className="sm-disclosure"><summary>Revisar exatamente o pacote enviado</summary><pre>{JSON.stringify(packet, null, 2)}</pre></details>
            {packet.sources.length + packet.nodes.length > 0 && <label className="sm-consent"><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />Autorizo enviar este pacote de evidências, com os trechos acima, para a ponte em {bridgeUrl || "(URL ainda vazia)"}. O vault inteiro não será enviado.</label>}
            <button className="sm-secondary-action" onClick={() => void askBridge()} disabled={!bridgeUrl.trim() || !aiConsent || !packet || sending}>{sending ? "Consultando…" : "Perguntar ao provedor"}</button>
            <details className="sm-import-answer"><summary>Importar resposta estruturada</summary><textarea rows={6} value={answerJson} onChange={(event) => setAnswerJson(event.target.value)} placeholder='{"answer":"...","nodeIds":[],"sourceRefs":[]}' /><button onClick={() => { try { setAnswer(parseImportedAnswer(answerJson, packet)); onToast({ type: "ok", message: "Resposta importada e referências verificadas contra o pacote." }); } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Resposta inválida." }); } }}>Validar resposta e evidências</button></details>
            {answer && <article className="sm-answer"><h4>Resposta</h4><p>{answer.answer}</p>{answer.uncertainty && <small>Incerteza: {answer.uncertainty}</small>}<div>{answer.nodeIds.map((nodeId) => <button key={nodeId} onClick={() => onHighlight(nodeId)}>Abrir nó {nodeId}</button>)}{answer.sourceRefs.map((ref) => <span key={ref.sourceId}>{ref.path}{ref.anchor ? `#${ref.anchor}` : ""}</span>)}</div></article>}
          </>}
        </section>}

        {tab === "history" && <section className="second-mind-section" role="tabpanel">
          <div className="sm-section-heading"><div><h3>Histórico semântico local</h3><p>Posições de câmera e coordenadas baked não entram no diff semântico. Restaurar sempre preserva uma cópia do estado atual.</p></div><button onClick={() => void recordSnapshot("manual checkpoint")}>Registrar snapshot</button></div>
          <div className="sm-history-list">{history.length ? history.map((snapshot) => <article className={selectedSnapshot === snapshot.snapshotId ? "selected" : ""} key={snapshot.snapshotId}>
            <div><b>{new Date(snapshot.createdAt).toLocaleString()}</b><span>{snapshot.reason}</span><small>hash {snapshot.stateHash.slice(0, 22)}…{snapshot.sourceManifestFingerprint ? ` · fonte ${snapshot.sourceManifestFingerprint.slice(0, 14)}…` : ""}</small></div>
            <div className="sm-actions compact"><button onClick={() => void previewRestore(snapshot)}>Comparar</button><button className="quiet" onClick={() => downloadJson(`${snapshot.snapshotId}.json`, snapshot)}>Exportar</button></div>
          </article>) : <div className="sm-empty"><b>Ainda sem snapshots</b><p>Snapshots surgem após aceitar uma proposta, criar um mapa de fontes ou registrar um checkpoint.</p></div>}</div>
          {restoreSnapshotData && restorePreview && <div className="sm-restore-preview"><b>Prévia de {restoreSnapshotData.snapshotId}</b><p>{diffLabel(restorePreview)}</p><div className="sm-diff-columns">{(["nodes", "links", "clusters"] as const).map((key) => <div key={key}><b>{key === "nodes" ? "Nós" : key === "links" ? "Relações" : "Clusters"}</b><span>+ {restorePreview[key].added.length} · − {restorePreview[key].removed.length} · Δ {restorePreview[key].changed.length}</span></div>)}<div><b>Configuração semântica</b><span>{restorePreview.semanticConfig.metadata ? "Metadados · " : ""}{restorePreview.semanticConfig.axes ? "Eixos · " : ""}{restorePreview.semanticConfig.extensions ? "Extensões" : ""}{!Object.values(restorePreview.semanticConfig).some(Boolean) ? "Sem mudanças" : ""}</span></div></div><button className="primary-button" onClick={() => void restoreSnapshot()}>Restaurar com cópia de segurança</button></div>}
        </section>}

        {tab === "writeback" && <section className="second-mind-section" role="tabpanel">
          <div className="sm-section-heading"><div><h3>Retorno governado à fonte</h3><p>Adapter atual: leitura, diff, IDs estáveis, âncoras e export de patch. Escrita direta indisponível; arquivo original nunca é alterado aqui.</p></div></div>
          <div className="sm-evidence-summary"><b>{selectedNode ? selectedNode.label : "Nenhum nó selecionado"}</b><small>{selectedNode ? `ID ${selectedNode.id}` : "Selecione um nó com proveniência Markdown no inspector."}</small></div>
          <button className="primary-button" onClick={createWriteback} disabled={!selectedNode || !manifest}>Criar proposta de writeback</button>
          {writeback && <article className="sm-writeback"><h4>{writeback.targetPath}{writeback.anchor ? ` · #${writeback.anchor}` : " · fim do arquivo"}</h4><p>Alvo: nó {writeback.nodeId}. Estratégia delimitada por marcador gerenciado; a prosa original não é reescrita.</p><div className="sm-before-after"><section><b>Antes</b><pre>{writeback.before || "(nenhum bloco gerenciado)"}</pre></section><section><b>Depois</b><pre>{writeback.after}</pre></section></div><pre className="sm-diff">{writeback.diff}</pre><button onClick={() => downloadJson(`writeback-${writeback.nodeId}.json`, buildWritebackExport(writeback))}>Exportar pacote de patch</button></article>}
        </section>}
      </div>
      <footer className="second-mind-footer"><span>Fonte = autoridade · grafo = representação · IA = proposta · Moon = autorização final</span><button onClick={onClose}>Fechar</button></footer>
    </section>
  </div>;
}

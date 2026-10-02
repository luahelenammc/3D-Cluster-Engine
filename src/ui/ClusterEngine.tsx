"use client";

import { FormEvent, lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { clusterColor } from "../core/colors";
import { computeSemanticTargets, resolveSemanticAxes } from "../core/spatial";
import type { AxisDimension, GraphDataset, GraphLink, GraphNode, GraphViewMode, RuntimeGraph, SemanticAxisConfig, SemanticAxisSource, ValidationIssue } from "../core/types";
import { importFiles, downloadDataset } from "../data/adapters";
import { GraphStore } from "../data/graph-store";
import { validateDataset } from "../data/validate";
import type { GraphCanvasApi } from "../renderer/GraphCanvas";
import { EMPTY_GRAPH_INTERACTION, reduceGraphInteraction, searchGraphNodes, type LabelDensity } from "../renderer/interaction";

const GraphCanvas = lazy(() => import("../renderer/GraphCanvas").then((module) => ({ default: module.GraphCanvas })));
const SecondMindPanel = lazy(() => import("./SecondMindPanel"));

type Toast = { type: "ok" | "error" | "info"; message: string } | null;

const AXIS_DIMENSIONS: AxisDimension[] = ["x", "y", "z"];
const AXIS_SOURCES: Array<{ value: SemanticAxisSource; label: string }> = [
  { value: "cluster", label: "Cluster / território" },
  { value: "field", label: "Campo numérico" },
  { value: "degree", label: "Conexões totais" },
  { value: "inDegree", label: "Entradas" },
  { value: "outDegree", label: "Saídas" },
  { value: "graphDepth", label: "Profundidade do grafo" },
  { value: "stableIndex", label: "Ordem estável" },
];

function idOf(endpoint: string | GraphNode) { return typeof endpoint === "string" ? endpoint : endpoint.id; }
function isMobileViewport() { return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches; }

export default function ClusterEngine() {
  const [store, setStore] = useState<GraphStore | null>(null);
  const [dataset, setDataset] = useState<GraphDataset | null>(null);
  const [interaction, dispatchInteraction] = useReducer(reduceGraphInteraction, EMPTY_GRAPH_INTERACTION);
  const selectedId = interaction.selectedNodeId;
  const inspectedId = interaction.inspectedNodeId;
  const [query, setQuery] = useState("");
  const [visibleClusters, setVisibleClusters] = useState<Set<string>>(new Set());
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [simulation, setSimulation] = useState<"running" | "paused" | "settled">("running");
  const [toast, setToast] = useState<Toast>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [leftOpen, setLeftOpen] = useState(() => !isMobileViewport());
  const [rightOpen, setRightOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showAddNode, setShowAddNode] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [showSecondMind, setShowSecondMind] = useState(false);
  const [viewMode, setViewMode] = useState<GraphViewMode>(() => typeof window !== "undefined" && localStorage.getItem("lms3d.view-mode.v1") === "2d" ? "2d" : "3d");
  const [labelDensity, setLabelDensity] = useState<LabelDensity>(() => {
    const stored = localStorage.getItem("lms3d.label-density.v1");
    return stored === "essential" || stored === "more" ? stored : "context";
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const graphApi = useRef<GraphCanvasApi>(null);
  const detailActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem("lms3d.theme") as "dark" | "light" | null;
    // Theme preference is an external browser setting loaded after hydration.
    if (storedTheme) setTheme(storedTheme);
    fetch(`${import.meta.env.BASE_URL}datasets/demo/dataset.json`).then((response) => response.json()).then((data: GraphDataset) => {
      const next = new GraphStore(data);
      setStore(next);
      setDataset(next.getDataset() as GraphDataset);
      setVisibleClusters(new Set((data.clusters || []).map((cluster) => cluster.id)));
      setVisibleTypes(new Set(data.links.map((link) => link.type || "related")));
    }).catch((error: Error) => setToast({ type: "error", message: `Não foi possível abrir o demo: ${error.message}` }));
  }, []);

  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => {
      const next = store.getDataset() as GraphDataset;
      setDataset(next);
      const result = validateDataset(next);
      setIssues(result.issues);
      if (store.dirty) localStorage.setItem("lms3d.autosave", JSON.stringify(next));
    });
  }, [store]);

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("lms3d.theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("lms3d.view-mode.v1", viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem("lms3d.label-density.v1", labelDensity); }, [labelDensity]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const adaptPanels = (event: MediaQueryListEvent) => {
      setLeftOpen(!event.matches);
      setRightOpen(Boolean(interaction.inspectedNodeId));
    };
    media.addEventListener("change", adaptPanels);
    return () => media.removeEventListener("change", adaptPanels);
  }, [interaction.inspectedNodeId]);

  const clusters = dataset?.clusters || [];
  const axes = useMemo(() => resolveSemanticAxes(dataset?.layout), [dataset?.layout]);
  const semanticTargets = useMemo(() => dataset ? computeSemanticTargets(dataset.nodes, dataset.links, dataset.clusters, axes) : new Map(), [dataset, axes]);
  const linkTypes = useMemo(() => [...new Set((dataset?.links || []).map((link) => link.type || "related"))], [dataset]);
  const selectedNode = dataset?.nodes.find((node) => node.id === selectedId) || null;
  const inspectedNode = dataset?.nodes.find((node) => node.id === inspectedId) || null;
  const selectedSemanticZ = selectedNode ? semanticTargets.get(selectedNode.id)?.z : undefined;
  const selectedRelationCount = selectedNode ? dataset?.links.filter((link) => link.source === selectedNode.id || link.target === selectedNode.id).length || 0 : 0;
  const searchResults = useMemo(() => {
    if (!dataset) return [];
    return searchGraphNodes(dataset.nodes, query);
  }, [dataset, query]);

  const visibleGraph: RuntimeGraph = useMemo(() => {
    if (!store || !dataset) return { nodes: [], links: [] };
    const runtime = store.getRuntimeSnapshot();
    const nodeIds = new Set(runtime.nodes.filter((node) => visibleClusters.has(node.cluster) && node.visible !== false).map((node) => node.id));
    return { nodes: runtime.nodes.filter((node) => nodeIds.has(node.id)), links: runtime.links.filter((link) => nodeIds.has(idOf(link.source)) && nodeIds.has(idOf(link.target)) && visibleTypes.has(link.type || "related") && link.visible !== false) };
  }, [store, dataset, visibleClusters, visibleTypes]);

  useEffect(() => {
    const visibleIds = new Set(visibleGraph.nodes.map((node) => node.id));
    if (selectedId && !visibleIds.has(selectedId)) {
      dispatchInteraction({ type: "remove-hidden", visibleIds });
      setRightOpen(false);
    }
  }, [visibleGraph, selectedId]);

  if (!store || !dataset) return <main className="loading-screen"><div className="loading-orbit" /><p>Inicializando a constelação…</p></main>;

  function toggleCluster(id: string, isolate = false) {
    setVisibleClusters((current) => {
      if (isolate) return new Set([id]);
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectNode(id: string | null) {
    dispatchInteraction({ type: "select", nodeId: id });
    if (id === null) setRightOpen(false);
    else if (isMobileViewport()) setLeftOpen(false);
  }

  function inspectNode(id: string) {
    dispatchInteraction({ type: "inspect", nodeId: id });
    setRightOpen(true);
    if (isMobileViewport()) setLeftOpen(false);
  }

  function closeInspector() {
    dispatchInteraction({ type: "close-inspector" });
    setRightOpen(false);
    requestAnimationFrame(() => detailActionRef.current?.focus());
  }

  function loadSecondMindDataset(next: GraphDataset) {
    store?.commitDataset(next);
    dispatchInteraction({ type: "select", nodeId: null });
    dispatchInteraction({ type: "close-inspector" });
    setRightOpen(false);
    setVisibleClusters(new Set(next.clusters.map((cluster) => cluster.id)));
    setVisibleTypes(new Set(next.links.map((link) => link.type || "related")));
    window.dispatchEvent(new CustomEvent("lms3d:local-dataset"));
  }

  function highlightFromSecondMind(id: string) {
    inspectNode(id);
    setShowSecondMind(false);
    graphApi.current?.focus(id);
  }

  function toggleLeftPanel() {
    const next = !leftOpen;
    setLeftOpen(next);
    if (next && isMobileViewport()) {
      dispatchInteraction({ type: "close-inspector" });
      setRightOpen(false);
    }
  }

  function updateAxis(dimension: AxisDimension, patch: Partial<SemanticAxisConfig>) {
    if (!store) return;
    store.setLayout({ axes: { ...axes, [dimension]: { ...axes[dimension], ...patch } } });
  }

  async function handleFiles(files: File[]) {
    try {
      const result = await importFiles(files);
      const next = new GraphStore(result.dataset);
      setStore(next); setDataset(result.dataset); selectNode(null); closeInspector();
      setVisibleClusters(new Set((result.dataset.clusters || []).map((cluster) => cluster.id)));
      setVisibleTypes(new Set(result.dataset.links.map((link) => link.type || "related")));
      setToast({ type: "ok", message: `${result.adapter} carregado: ${result.dataset.nodes.length} nós, ${result.dataset.links.length} links${result.warnings.length ? ` · ${result.warnings.length} aviso(s)` : ""}.` });
    } catch (error) { setToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao importar." }); }
  }

  function restoreAutosave() {
    try {
      const raw = localStorage.getItem("lms3d.autosave");
      if (!raw) return setToast({ type: "info", message: "Nenhum autosave local encontrado." });
      const saved = JSON.parse(raw) as GraphDataset;
      const result = validateDataset(saved);
      if (!result.valid) throw new Error("O autosave local está inválido.");
      const next = new GraphStore(saved); setStore(next); setDataset(saved); selectNode(null); closeInspector();
      setVisibleClusters(new Set((saved.clusters || []).map((cluster) => cluster.id)));
      setVisibleTypes(new Set(saved.links.map((link) => link.type || "related")));
      setToast({ type: "ok", message: "Autosave restaurado." });
    } catch (error) { setToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao restaurar." }); }
  }

  return (
    <main className="engine-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">LMS</span><div><strong>3D Cluster Engine</strong><span>{dataset.meta.title}</span></div></div>
        <div className="search-wrap">
          <span aria-hidden="true">⌕</span><input aria-label="Buscar nós" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nós, tags, metadata…" />
          {searchResults.length > 0 && <div className="search-results">{searchResults.map((node) => <button key={node.id} onClick={() => { selectNode(node.id); graphApi.current?.focus(node.id); setQuery(""); }}><i style={{ background: clusterColor(node.cluster, clusters.find((c) => c.id === node.cluster)?.color) }} /><span><strong>{node.label}</strong><small>{node.cluster} · {node.id}</small></span></button>)}</div>}
        </div>
        <div className="toolbar">
          <button className="icon-button" onClick={toggleLeftPanel} aria-label="Alternar painel esquerdo">☰</button>
          <div className="view-mode-switch" role="group" aria-label="Modo de visualização"><button type="button" aria-pressed={viewMode === "3d"} className={viewMode === "3d" ? "active" : ""} onClick={() => setViewMode("3d")}>3D</button><button type="button" aria-pressed={viewMode === "2d"} className={viewMode === "2d" ? "active" : ""} onClick={() => setViewMode("2d")}>2D</button></div>
          <button className="second-mind-launch" onClick={() => setShowSecondMind(true)}>Second Mind</button>
          <button onClick={() => fileRef.current?.click()}>Importar</button>
          <input ref={fileRef} className="sr-only" type="file" multiple accept=".json,.csv" onChange={(event) => handleFiles(Array.from(event.target.files || []))} />
          <button onClick={() => downloadDataset(dataset)}>Exportar</button>
          <button className="icon-button" disabled={!store.canUndo()} onClick={() => store.undo()} aria-label="Desfazer">↶</button>
          <button className="icon-button" disabled={!store.canRedo()} onClick={() => store.redo()} aria-label="Refazer">↷</button>
          <button onClick={() => { if (simulation === "paused") graphApi.current?.resume(); else graphApi.current?.pause(); }}>{simulation === "paused" ? "Retomar" : "Pausar"}</button>
          <button className="icon-button" onClick={() => graphApi.current?.fit()} aria-label="Enquadrar grafo">◎</button>
          <button className="icon-button" onClick={() => setShowSettings((value) => !value)} aria-label="Configurações">⚙</button>
          <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Alternar tema">{theme === "dark" ? "☾" : "☀"}</button>
          <span className={`dirty-dot ${store.dirty ? "is-dirty" : ""}`} title={store.dirty ? "Alterações não exportadas" : "Sem alterações"} />
        </div>
      </header>

      {showSettings && <section className="settings-popover">
        <div><strong>Layout</strong><button className="close-button" onClick={() => setShowSettings(false)}>×</button></div>
        <label>Modo<select value={dataset.layout?.mode || "live"} onChange={(event) => store.setLayout({ mode: event.target.value as "live" | "baked" | "hybrid" })}><option value="live">Live</option><option value="hybrid">Hybrid</option><option value="baked">Baked</option></select></label>
        <label>Coesão secundária dos clusters<input type="range" min="0" max="0.18" step="0.01" value={dataset.layout?.clusterStrength ?? 0.05} onChange={(event) => store.setLayout({ clusterStrength: Number(event.target.value) })} /></label>
        <label className="switch-row"><input type="checkbox" checked={axes.enabled} onChange={(event) => store.setLayout({ axes: { ...axes, enabled: event.target.checked } })} /> Posicionamento semântico por 3 eixos</label>
        {axes.enabled && <div className="axis-settings">
          {AXIS_DIMENSIONS.map((dimension) => {
            const axis = axes[dimension];
            return <section className="axis-setting" key={dimension}>
              <div className="axis-setting-head"><b>{dimension.toUpperCase()}</b><span>{axis.label}</span></div>
              <label>Significado<input type="text" value={axis.label} onChange={(event) => updateAxis(dimension, { label: event.target.value })} /></label>
              <label>Fonte<select value={axis.source} onChange={(event) => updateAxis(dimension, { source: event.target.value as SemanticAxisSource })}>{AXIS_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label>
              {axis.source === "field" && <label>Campo<input type="text" value={axis.field || ""} onChange={(event) => updateAxis(dimension, { field: event.target.value })} placeholder="level ou metadata.maturity" /></label>}
            </section>;
          })}
        </div>}
        <div className="button-row"><button disabled={viewMode === "2d"} title={viewMode === "2d" ? "Bake indisponível em 2D para preservar o eixo Z canônico." : undefined} onClick={() => { graphApi.current?.pause(); store.applyPositions(graphApi.current?.getPositions() || {}); setToast({ type: "ok", message: "Layout gravado no dataset." }); }}>Bake layout</button><button onClick={() => { store.clearPositions(); graphApi.current?.reheat(); }}>Limpar bake</button></div>
        {viewMode === "2d" && <p className="settings-note">O modo 2D não grava posições: o eixo Z permanece intacto no dataset.</p>}
        <button onClick={() => { setShowSettings(false); setShowJsonEditor(true); }}>Editar JSON canônico</button>
        <button onClick={restoreAutosave}>Restaurar autosave local</button>
        <button className="danger-quiet" onClick={() => { localStorage.removeItem("lms3d.autosave"); setToast({ type: "info", message: "Dados locais removidos." }); }}>Limpar dados locais</button>
      </section>}

      <section className={`workspace ${leftOpen ? "left-open" : ""} ${rightOpen ? "right-open" : ""}`}>
        {leftOpen && <aside className="sidebar left-sidebar">
          <div className="panel-intro"><p className="eyebrow">DATASET</p><h1>{dataset.meta.title}</h1><p>{dataset.meta.description}</p></div>
          <div className="stat-strip"><span><strong>{dataset.nodes.length}</strong> nós</span><span><strong>{dataset.links.length}</strong> links</span><span><strong>{clusters.length}</strong> clusters</span></div>
          <div className="section-head"><h2>Clusters</h2><button onClick={() => setVisibleClusters(new Set(clusters.map((cluster) => cluster.id)))}>todos</button></div>
          <div className="cluster-list">{clusters.map((cluster) => { const count = dataset.nodes.filter((node) => node.cluster === cluster.id).length; const active = visibleClusters.has(cluster.id); return <button key={cluster.id} className={active ? "active" : ""} onClick={(event) => toggleCluster(cluster.id, event.altKey)} title="Clique alterna. Alt+clique isola."><i style={{ background: clusterColor(cluster.id, cluster.color) }} /><span><strong>{cluster.label}</strong><small>{count} nós</small></span><em>{active ? "●" : "○"}</em></button>; })}</div>
          <div className="section-head"><h2>Relações</h2><button onClick={() => setVisibleTypes(new Set(linkTypes))}>todas</button></div>
          <div className="chip-list">{linkTypes.map((type) => <button key={type} className={visibleTypes.has(type) ? "active" : ""} onClick={() => setVisibleTypes((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; })}>{type}</button>)}</div>
          <div className="panel-actions"><button onClick={() => setShowAddNode(true)}>＋ Nó</button><button onClick={() => setShowAddLink(true)}>＋ Link</button></div>
        </aside>}

        <section className="canvas-stage">
          <Suspense fallback={<div className="graph-canvas-loading" role="img" aria-label="Carregando visualização do grafo…" />}><GraphCanvas ref={graphApi} graph={visibleGraph} clusters={clusters} layout={dataset.layout} visual={dataset.visual} selectedId={selectedId} inspectedId={inspectedId} labelDensity={labelDensity} viewMode={viewMode} onSelect={selectNode} onInspect={inspectNode} onSimulation={setSimulation} /></Suspense>
          <div className="label-density-control" role="group" aria-label="Densidade dos rótulos">
            {([{ id: "essential", label: "Essenciais" }, { id: "context", label: "Contexto" }, { id: "more", label: "Mais" }] as const).map((option) => <button key={option.id} type="button" aria-pressed={labelDensity === option.id} onClick={() => setLabelDensity(option.id)}>{option.label}</button>)}
          </div>
          <div className={`axes-caption ${selectedNode ? "has-selection" : ""}`} aria-hidden="true">{viewMode === "2d" ? <><span><b>X</b>{axes.x.label}</span><span><b>Y</b>{axes.y.label}</span><span><b>Z</b>oculto no plano · preservado no inspector</span></> : axes.enabled ? AXIS_DIMENSIONS.map((dimension) => <span key={dimension}><b>{dimension.toUpperCase()}</b>{axes[dimension].label}</span>) : <span><b>·</b>layout livre</span>}</div>
          {selectedNode && <section className="selected-node-summary" aria-label="Nó selecionado">
            <div><strong>{selectedNode.label}</strong><span>{clusters.find((cluster) => cluster.id === selectedNode.cluster)?.label || selectedNode.cluster} · {selectedRelationCount} relações</span></div>
            <button ref={detailActionRef} type="button" onClick={() => inspectNode(selectedNode.id)} aria-expanded={rightOpen} aria-controls="node-inspector">Detalhes</button>
            <button type="button" onClick={() => graphApi.current?.focus(selectedNode.id)}>Focar</button>
            <button type="button" className="summary-clear" onClick={() => selectNode(null)}>Limpar</button>
          </section>}
          <span className="sr-only" aria-live="polite">{selectedNode ? `Selecionado: ${selectedNode.label}. Use Detalhes para abrir a inspeção.` : "Nenhum nó selecionado."}</span>
        </section>

        {rightOpen && inspectedNode && <><div className="inspector-scrim" aria-hidden="true" onClick={closeInspector} /><Inspector dataset={dataset} node={inspectedNode} semanticZ={selectedSemanticZ} viewMode={viewMode} store={store} onSelect={selectNode} onClose={closeInspector} onFocus={(id) => graphApi.current?.focus(id)} onToast={setToast} /></>}
      </section>

      <footer className="statusbar"><span><i className={`status-light ${simulation}`} /> física: {simulation}</span><span>{visibleGraph.nodes.length}/{dataset.nodes.length} nós visíveis</span><span>{visibleGraph.links.length}/{dataset.links.length} links visíveis</span><span>layout: {dataset.layout?.mode || "live"}</span><span>{axes.enabled ? "eixos: semânticos" : "eixos: livres"}</span><span>{issues.length ? `${issues.length} aviso(s)` : "dados válidos"}</span><span className="status-spacer" /><span>{viewMode === "2d" ? "plano XY · pan · zoom · arraste · Z no inspector" : "arraste · órbita · scroll zoom"}</span></footer>
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      {showSecondMind && <Suspense fallback={<div className="second-mind-backdrop"><div className="second-mind-panel" role="status">Carregando Second Mind…</div></div>}><SecondMindPanel dataset={dataset} store={store} selectedNode={selectedNode} onClose={() => setShowSecondMind(false)} onLoadDataset={loadSecondMindDataset} onHighlight={highlightFromSecondMind} onToast={setToast} /></Suspense>}
      {showAddNode && <AddNodeDialog dataset={dataset} onClose={() => setShowAddNode(false)} onAdd={(node) => { try { store.addNode(node); setShowAddNode(false); selectNode(node.id); setToast({ type: "ok", message: "Nó criado." }); } catch (error) { setToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao criar nó." }); } }} />}
      {showAddLink && <AddLinkDialog dataset={dataset} onClose={() => setShowAddLink(false)} onAdd={(link) => { try { store.addLink(link); setShowAddLink(false); setToast({ type: "ok", message: "Link criado." }); } catch (error) { setToast({ type: "error", message: error instanceof Error ? error.message : "Falha ao criar link." }); } }} />}
      {showJsonEditor && <JsonEditorDialog dataset={dataset} onClose={() => setShowJsonEditor(false)} onApply={(next) => { try { const result = validateDataset(next); if (!result.valid) throw new Error(result.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`).join("\n")); store.replace(next, true); setVisibleClusters(new Set((next.clusters || []).map((cluster) => cluster.id))); setVisibleTypes(new Set(next.links.map((link) => link.type || "related"))); selectNode(null); setShowJsonEditor(false); setToast({ type: "ok", message: "Dataset canônico substituído." }); } catch (error) { setToast({ type: "error", message: error instanceof Error ? error.message : "JSON inválido." }); } }} />}
    </main>
  );
}

function Inspector({ dataset, node, store, semanticZ, viewMode, onSelect, onClose, onFocus, onToast }: { dataset: GraphDataset; node: GraphNode | null; semanticZ?: number; viewMode: GraphViewMode; store: GraphStore; onSelect(id: string | null): void; onClose(): void; onFocus(id: string): void; onToast(toast: Toast): void }) {
  const titleRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (isMobileViewport()) titleRef.current?.focus(); }, []);
  if (!node) return <aside className="sidebar inspector"><p className="eyebrow">INSPECTOR</p><div className="empty-inspector"><span>✦</span><h2>Escolha um nó</h2><p>Clique numa esfera ou use a busca. O mapa continua sendo dado: tudo o que você editar pode ser exportado.</p><dl><div><dt>Schema</dt><dd>{dataset.schemaVersion}</dd></div><div><dt>Versão</dt><dd>{dataset.meta.version}</dd></div><div><dt>Fonte</dt><dd>{dataset.meta.source || "local"}</dd></div></dl></div></aside>;
  const incoming = dataset.links.filter((link) => link.target === node.id);
  const outgoing = dataset.links.filter((link) => link.source === node.id);
  return <aside id="node-inspector" className="sidebar inspector" role="dialog" aria-modal={isMobileViewport() ? "true" : undefined} aria-labelledby="inspector-title" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); return; } if (!isMobileViewport() || event.key !== "Tab") return; const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')); if (!items.length) return; const first = items[0]; const last = items[items.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }}><div className="inspector-head"><p className="eyebrow" id="inspector-title" ref={titleRef} tabIndex={-1}>DETALHES DO NÓ</p><button type="button" aria-label="Fechar detalhes" onClick={onClose}>×</button></div>{viewMode === "2d" && <div className="semantic-z-card"><span>Z · {dataset.layout?.axes?.z?.label || "Centralidade relacional"}</span><strong>{Number.isFinite(semanticZ) ? Number(semanticZ).toFixed(2) : "indisponível"}</strong><small>O valor continua semântico; o plano 2D não o usa como profundidade visível.</small></div>}<NodeEditor key={node.id} node={node} dataset={dataset} onSave={(patch) => { try { store.updateNode(node.id, patch); onToast({ type: "ok", message: "Nó atualizado." }); } catch (error) { onToast({ type: "error", message: error instanceof Error ? error.message : "Edição inválida." }); } }} /><div className="inspector-buttons"><button onClick={() => onFocus(node.id)}>Focar câmera</button><button onClick={() => store.updateNode(node.id, { pinned: !node.pinned })}>{node.pinned ? "Desafixar" : "Fixar"}</button><button className="danger-quiet" onClick={() => { if (confirm(`Excluir ${node.label} e seus links?`)) { store.removeNode(node.id); onSelect(null); } }}>Excluir</button></div><div className="relations"><h3>Relações</h3><p>{incoming.length} entradas · {outgoing.length} saídas</p>{[...incoming, ...outgoing].slice(0, 8).map((link, index) => { const other = link.source === node.id ? link.target : link.source; return <button key={link.id || index} onClick={() => { onSelect(other); onFocus(other); }}><span>{link.source === node.id ? "→" : "←"}</span><strong>{dataset.nodes.find((item) => item.id === other)?.label || other}</strong><small>{link.type || "related"}</small></button>; })}</div></aside>;
}

function NodeEditor({ node, dataset, onSave }: { node: GraphNode; dataset: GraphDataset; onSave(patch: Partial<GraphNode>): void }) {
  const [label, setLabel] = useState(node.label); const [cluster, setCluster] = useState(node.cluster); const [value, setValue] = useState(String(node.value ?? "")); const [level, setLevel] = useState(String(node.level ?? "")); const [tags, setTags] = useState((node.tags || []).join(", ")); const [metadata, setMetadata] = useState(JSON.stringify(node.metadata || {}, null, 2));
  function submit(event: FormEvent) { event.preventDefault(); try { onSave({ label: label.trim(), cluster, value: value === "" ? undefined : Number(value), level: level === "" ? undefined : Number(level), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), metadata: JSON.parse(metadata) }); } catch { alert("Metadata precisa ser JSON válido."); } }
  return <form className="editor-form" onSubmit={submit}><label>ID<input value={node.id} disabled /></label><label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} required /></label><div className="form-grid"><label>Cluster<select value={cluster} onChange={(event) => setCluster(event.target.value)}>{(dataset.clusters || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Valor<input type="number" min="0" value={value} onChange={(event) => setValue(event.target.value)} /></label></div><div className="form-grid"><label>Nível<input type="number" value={level} onChange={(event) => setLevel(event.target.value)} /></label><label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tag, outra" /></label></div><label>Metadata<textarea rows={7} value={metadata} onChange={(event) => setMetadata(event.target.value)} spellCheck={false} /></label><button className="primary-button" type="submit">Aplicar mudanças</button></form>;
}

function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}>×</button></div>{children}</section></div>; }

function AddNodeDialog({ dataset, onClose, onAdd }: { dataset: GraphDataset; onClose(): void; onAdd(node: GraphNode): void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onAdd({ id: String(form.get("id")), label: String(form.get("label")), cluster: String(form.get("cluster")), value: Number(form.get("value") || 1), level: Number(form.get("level") || 0), metadata: {} }); }
  return <Modal title="Criar nó" onClose={onClose}><form className="editor-form" onSubmit={submit}><label>ID<input name="id" required pattern="[A-Za-z0-9._:-]+" /></label><label>Label<input name="label" required /></label><label>Cluster<select name="cluster">{(dataset.clusters || []).map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.label}</option>)}</select></label><div className="form-grid"><label>Valor<input name="value" type="number" min="0" defaultValue="5" /></label><label>Nível<input name="level" type="number" defaultValue="1" /></label></div><button className="primary-button">Criar nó</button></form></Modal>;
}

function AddLinkDialog({ dataset, onClose, onAdd }: { dataset: GraphDataset; onClose(): void; onAdd(link: GraphLink): void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onAdd({ id: String(form.get("id")) || undefined, source: String(form.get("source")), target: String(form.get("target")), type: String(form.get("type") || "related"), weight: Number(form.get("weight") || 1), directed: form.get("directed") === "on" }); }
  return <Modal title="Criar link" onClose={onClose}><form className="editor-form" onSubmit={submit}><label>ID<input name="id" placeholder="opcional" /></label><div className="form-grid"><label>Origem<select name="source">{dataset.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>Destino<select name="target">{dataset.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label></div><div className="form-grid"><label>Tipo<input name="type" defaultValue="related" /></label><label>Peso<input name="weight" type="number" min="0" step="0.1" defaultValue="1" /></label></div><label className="switch-row"><input name="directed" type="checkbox" /> Direcionado</label><button className="primary-button">Criar link</button></form></Modal>;
}

function JsonEditorDialog({ dataset, onClose, onApply }: { dataset: GraphDataset; onClose(): void; onApply(dataset: GraphDataset): void }) {
  const [value, setValue] = useState(JSON.stringify(dataset, null, 2));
  const [error, setError] = useState("");
  function apply() { try { const parsed = JSON.parse(value) as GraphDataset; const result = validateDataset(parsed); if (!result.valid) throw new Error(result.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`).join("\n")); onApply(parsed); } catch (cause) { setError(cause instanceof Error ? cause.message : "JSON inválido."); } }
  return <Modal title="Editor canônico" onClose={onClose}><p className="modal-note">Autoridade total sobre nós, links, clusters e configuração. A aplicação só aceita o corpo quando ele passa pela validação estrutural e semântica.</p><textarea className="json-editor" value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} spellCheck={false} />{error && <pre className="validation-error">{error}</pre>}<div className="modal-actions"><button onClick={onClose}>Cancelar</button><button className="primary-button" onClick={apply}>Validar e aplicar</button></div></Modal>;
}

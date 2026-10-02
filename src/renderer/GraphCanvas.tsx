"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import SpriteText from "three-spritetext";
import { clusterColor, escapeHtml } from "../core/colors";
import { createSemanticAxesForce, resolveSemanticAxes } from "../core/spatial";
import { projectRuntimeGraph } from "../core/view-projection";
import { DEFAULT_LAYOUT, DEFAULT_VISUAL, type ClusterDefinition, type GraphViewMode, type LayoutConfig, type RuntimeGraph, type RuntimeNode, type VisualConfig } from "../core/types";

export interface GraphCanvasApi {
  fit(): void;
  pause(): void;
  resume(): void;
  reheat(): void;
  focus(nodeId: string): void;
  getPositions(): Record<string, { x: number; y: number; z: number }>;
}

interface Props {
  graph: RuntimeGraph;
  clusters: ClusterDefinition[];
  layout?: Partial<LayoutConfig>;
  visual?: Partial<VisualConfig>;
  selectedId: string | null;
  viewMode: GraphViewMode;
  onSelect(id: string | null): void;
  onSimulation(state: "running" | "paused" | "settled"): void;
}

function endpointId(endpoint: string | RuntimeNode): string { return typeof endpoint === "string" ? endpoint : endpoint.id; }

function fibonacciCenters(ids: string[]) {
  const centers = new Map<string, { x: number; y: number; z: number }>();
  const sorted = [...ids].sort();
  const radius = Math.max(55, 35 * Math.sqrt(sorted.length));
  const phi = Math.PI * (3 - Math.sqrt(5));
  sorted.forEach((id, index) => {
    const y = 1 - (index / Math.max(1, sorted.length - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * index;
    centers.set(id, { x: Math.cos(theta) * r * radius, y: y * radius, z: Math.sin(theta) * r * radius });
  });
  return centers;
}

function planarCenters(ids: string[]) {
  const centers = new Map<string, { x: number; y: number; z: number }>();
  const sorted = [...ids].sort();
  const radius = Math.max(55, 35 * Math.sqrt(sorted.length));
  sorted.forEach((id, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, sorted.length);
    centers.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 });
  });
  return centers;
}

function clusterForce(nodes: RuntimeNode[], clusters: ClusterDefinition[], strength: number, viewMode: GraphViewMode) {
  const centers = viewMode === "2d" ? planarCenters(clusters.map((cluster) => cluster.id)) : fibonacciCenters(clusters.map((cluster) => cluster.id));
  const force = (alpha: number) => {
    if (strength <= 0) return;
    for (const node of nodes) {
      if (node.pinned) continue;
      const center = centers.get(node.cluster) || { x: 0, y: 0, z: 0 };
      node.vx = (node.vx || 0) + (center.x - (node.x || 0)) * strength * alpha;
      node.vy = (node.vy || 0) + (center.y - (node.y || 0)) * strength * alpha;
      node.vz = (node.vz || 0) + (center.z - (node.z || 0)) * strength * alpha;
    }
  };
  force.initialize = () => undefined;
  return force;
}

export const GraphCanvas = forwardRef<GraphCanvasApi, Props>(function GraphCanvas({ graph, clusters, layout: layoutInput, visual: visualInput, selectedId, viewMode, onSelect, onSimulation }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  const dataRef = useRef(graph);
  const previousViewMode = useRef<GraphViewMode | null>(null);
  const cameras = useRef<Record<GraphViewMode, { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } | null>>({ "3d": null, "2d": null });
  const clusterMap = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const axes = resolveSemanticAxes(layoutInput);
  const layout = { ...DEFAULT_LAYOUT, ...layoutInput, axes };
  const visual = { ...DEFAULT_VISUAL, ...visualInput };
  const renderGraph = useMemo<RuntimeGraph>(() => projectRuntimeGraph(graph, viewMode), [graph, viewMode]);

  useImperativeHandle(ref, () => ({
    fit: () => graphRef.current?.zoomToFit(650, 44),
    pause: () => { graphRef.current?.pauseAnimation(); onSimulation("paused"); },
    resume: () => { graphRef.current?.resumeAnimation(); onSimulation("running"); },
    reheat: () => { graphRef.current?.d3ReheatSimulation(); onSimulation("running"); },
    focus: (nodeId) => {
      const node = dataRef.current.nodes.find((item) => item.id === nodeId);
      if (!node || node.x === undefined) return;
      if (viewMode === "2d") {
        const camera = graphRef.current?.camera?.();
        const distance = Math.max(300, Math.abs(camera?.position?.z || 820));
        graphRef.current?.cameraPosition({ x: node.x, y: node.y || 0, z: distance }, node, 700);
        return;
      }
      const distance = 85;
      const ratio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
      graphRef.current?.cameraPosition({ x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio }, node, 700);
    },
    getPositions: () => Object.fromEntries(dataRef.current.nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)).map((node) => [node.id, { x: Number(node.x!.toFixed(3)), y: Number(node.y!.toFixed(3)), z: Number(node.z!.toFixed(3)) }])),
  }), [onSimulation, viewMode]);

  useEffect(() => {
    let disposed = false;
    const hostElement = hostRef.current;
    if (!hostElement) return;
    import("3d-force-graph").then(({ default: ForceGraph3D }) => {
      if (disposed || !hostRef.current) return;
      const instance = new (ForceGraph3D as any)()(hostRef.current, { controlType: "orbit" });
      graphRef.current = instance;
      setReady(true);
      instance.backgroundColor(visual.background).showNavInfo(false).nodeResolution(12).nodeRelSize(4).linkOpacity(visual.linkOpacity).nodeThreeObjectExtend(true).linkDirectionalParticleWidth(1.4).linkDirectionalParticleSpeed(0.006).onNodeHover((node: RuntimeNode | null) => {
        if (draggedIdRef.current) return;
        setHoveredId(node?.id || null);
      }).onNodeDrag((node: RuntimeNode) => {
        const nodeId = node.id;
        if (draggedIdRef.current !== nodeId) {
          draggedIdRef.current = nodeId;
          setDraggedId(nodeId);
        }
        setHoveredId(nodeId);
      }).onNodeDragEnd(() => {
        draggedIdRef.current = null;
        setDraggedId(null);
        setHoveredId(null);
      }).onNodeClick((node: RuntimeNode) => onSelect(node.id)).onBackgroundClick(() => onSelect(null)).onEngineTick(() => onSimulation("running")).onEngineStop(() => onSimulation("settled"));
      const resize = () => { if (hostRef.current) instance.width(hostRef.current.clientWidth).height(hostRef.current.clientHeight); };
      const observer = new ResizeObserver(resize);
      observer.observe(hostRef.current);
      resize();
      (hostRef.current as HTMLDivElement & { _observer?: ResizeObserver })._observer = observer;
    });
    return () => {
      disposed = true;
      draggedIdRef.current = null;
      const host = hostElement as HTMLDivElement & { _observer?: ResizeObserver };
      host?._observer?.disconnect();
      graphRef.current?._destructor?.();
      graphRef.current = null;
    };
    // The renderer is mounted exactly once; changing callbacks are consumed by graph-data refreshes.
  }, []);

  useEffect(() => {
    const instance = graphRef.current;
    if (!instance || !ready) return;
    const camera = instance.camera?.();
    const controls = instance.controls?.();
    const previous = previousViewMode.current;
    if (!previous && viewMode === "2d" && camera && controls?.target) {
      cameras.current["3d"] = {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      };
    }
    if (previous && previous !== viewMode && camera && controls?.target) {
      cameras.current[previous] = {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      };
    }
    instance.numDimensions(viewMode === "2d" ? 2 : 3);
    if (controls) {
      controls.enableRotate = viewMode === "3d";
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.update?.();
    }
    if (viewMode === "2d") {
      if (camera?.up?.set) camera.up.set(0, 1, 0);
      const saved = cameras.current["2d"];
      instance.cameraPosition(saved?.position || { x: 0, y: 0, z: 820 }, saved?.target || { x: 0, y: 0, z: 0 }, 0);
    } else {
      const saved = cameras.current["3d"];
      if (saved) instance.cameraPosition(saved.position, saved.target, 0);
    }
    previousViewMode.current = viewMode;
    instance.d3ReheatSimulation?.();
  }, [viewMode, ready]);

  useEffect(() => {
    const instance = graphRef.current;
    if (!instance) return;
    dataRef.current = renderGraph;
    const activeId = draggedId || selectedId || hoveredId;
    const activeNeighbors = new Set<string>();
    if (activeId) renderGraph.links.forEach((link) => { if (endpointId(link.source) === activeId) activeNeighbors.add(endpointId(link.target)); if (endpointId(link.target) === activeId) activeNeighbors.add(endpointId(link.source)); });
    const activeNode = renderGraph.nodes.find((node) => node.id === activeId);
    const activeColor = activeNode ? clusterColor(activeNode.cluster, clusterMap.get(activeNode.cluster)?.color) : "#ffffff";
    const values = renderGraph.nodes.map((node) => Number(node.value || 0)).sort((a, b) => a - b);
    const relevanceThreshold = values[Math.max(0, Math.floor(values.length * 0.7))] || 0;
    const isIncident = (link: any) => Boolean(activeId && (endpointId(link.source) === activeId || endpointId(link.target) === activeId));
    instance.nodeColor((node: RuntimeNode) => {
      if (activeId && visual.dimUnrelatedOnSelection && node.id !== activeId && !activeNeighbors.has(node.id)) return "#202633";
      return node.color || clusterColor(node.cluster, clusterMap.get(node.cluster)?.color);
    }).nodeVal((node: RuntimeNode) => node.id === activeId ? Math.min(visual.nodeSizeMax + 6, (node.value || 4) + 8) : activeNeighbors.has(node.id) ? Math.min(visual.nodeSizeMax + 2, (node.value || 4) + 3) : Math.max(visual.nodeSizeMin, Math.min(visual.nodeSizeMax, node.value || 4))).nodeLabel((node: RuntimeNode) => `<div class="graph-tooltip"><b>${escapeHtml(node.label)}</b><span>${escapeHtml(clusterMap.get(node.cluster)?.label || node.cluster)}</span>${viewMode === "2d" ? `<span>Z · ${escapeHtml(axes.z.label)}: ${Number(node.semanticZ || 0).toFixed(1)}</span>` : ""}</div>`).nodeThreeObject((node: RuntimeNode) => {
      const central = node.id === activeId;
      const neighbor = activeNeighbors.has(node.id);
      const showIdleRelevant = !activeId && visual.showLabels === "hover" && Number(node.value || 0) >= relevanceThreshold;
      const showLabel = visual.showLabels === "always" || central || neighbor || showIdleRelevant;
      const group = new Group();
      if (central) {
        const radius = Math.max(7, Math.min(17, Number(node.value || 4) + 6));
        const halo = new Mesh(new SphereGeometry(radius, 18, 18), new MeshBasicMaterial({ color: activeColor, transparent: true, opacity: 0.42, wireframe: true, depthWrite: false, blending: AdditiveBlending }));
        group.add(halo);
      }
      if (showLabel && visual.showLabels !== "never") {
        const label = new SpriteText(node.label);
        label.color = central ? activeColor : "#ffffff";
        label.textHeight = central ? 5.2 : neighbor ? 3.5 : 2.4;
        label.backgroundColor = central ? "rgba(7,10,18,0.86)" : neighbor ? "rgba(7,10,18,0.68)" : "rgba(7,10,18,0.42)";
        label.padding = central ? 2.2 : 1.2;
        label.borderRadius = 3;
        label.position.y = central ? 15 : neighbor ? 11 : 8;
        group.add(label);
      }
      return group;
      }).linkColor((link: any) => isIncident(link) ? activeColor : activeId ? "#303746" : (link.color || "#78839a")).linkWidth((link: any) => isIncident(link) ? Math.max(2.2, Number(link.weight || 1) * 1.4) : Math.max(0.35, Math.min(2, Number(link.weight || 1) * visual.linkWidth))).linkDirectionalParticles((link: any) => visual.showDirectionalParticles && link.directed ? isIncident(link) ? 5 : activeId ? 0 : 1 : 0).linkDirectionalParticleColor(() => activeColor).linkLabel((link: any) => `<div class="graph-tooltip"><b>${escapeHtml(String(link.type || "related"))}</b><span>${escapeHtml(endpointId(link.source))} → ${escapeHtml(endpointId(link.target))}</span></div>`).graphData(renderGraph).d3Force("cluster", clusterForce(renderGraph.nodes, clusters, layout.clusterStrength, viewMode)).d3Force("semanticAxes", createSemanticAxesForce(renderGraph.nodes, renderGraph.links, clusters, axes));
    const charge = instance.d3Force("charge");
    charge?.strength?.(layout.chargeStrength);
    const linkForce = instance.d3Force("link");
    linkForce?.distance?.(layout.linkDistance);
    if (layout.mode === "baked") instance.cooldownTicks(0); else instance.cooldownTicks(layout.cooldownTicks).warmupTicks(layout.warmupTicks).d3ReheatSimulation();
    // Configuration objects are intentionally collapsed to their public inputs.
  }, [renderGraph, clusters, selectedId, hoveredId, draggedId, layoutInput, visualInput, ready, viewMode]);

  return <div ref={hostRef} className={`graph-canvas ${viewMode === "2d" ? "is-2d" : "is-3d"}`} role="img" aria-label={viewMode === "2d" ? "Mapa bidimensional em vista superior. A posição Z permanece semântica e pode ser consultada no inspector." : "Visualização tridimensional interativa do grafo. Use a busca e o painel textual para navegação acessível."} />;
});

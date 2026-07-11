"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { clusterColor, escapeHtml } from "../core/colors";
import { DEFAULT_LAYOUT, DEFAULT_VISUAL, type ClusterDefinition, type LayoutConfig, type RuntimeGraph, type RuntimeNode, type VisualConfig } from "../core/types";

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

function clusterForce(nodes: RuntimeNode[], clusters: ClusterDefinition[], strength: number) {
  const centers = fibonacciCenters(clusters.map((cluster) => cluster.id));
  const force = (alpha: number) => {
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

function axisForce(nodes: RuntimeNode[], config: LayoutConfig["axis"]) {
  const values = nodes.map((node) => Number(config?.field.startsWith("metadata.") ? config.field.slice(9).split(".").reduce<unknown>((value, key) => typeof value === "object" && value ? (value as Record<string, unknown>)[key] : undefined, node.metadata) : (node as unknown as Record<string, unknown>)[config?.field || "level"])).filter(Number.isFinite);
  const min = config?.min ?? Math.min(...values, 0);
  const max = config?.max ?? Math.max(...values, 1);
  const dimension = config?.dimension || "y";
  const force = (alpha: number) => {
    if (!config?.enabled) return;
    nodes.forEach((node) => {
      if (node.pinned) return;
      const raw = Number(config.field.startsWith("metadata.") ? config.field.slice(9).split(".").reduce<unknown>((value, key) => typeof value === "object" && value ? (value as Record<string, unknown>)[key] : undefined, node.metadata) : (node as unknown as Record<string, unknown>)[config.field]);
      if (!Number.isFinite(raw)) return;
      let ratio = max === min ? 0.5 : (raw - min) / (max - min);
      if (config.invert) ratio = 1 - ratio;
      const target = (ratio - 0.5) * 260;
      const velocity = `v${dimension}` as "vx" | "vy" | "vz";
      node[velocity] = (node[velocity] || 0) + (target - (node[dimension] || 0)) * (config.strength ?? 0.18) * alpha;
    });
  };
  force.initialize = () => undefined;
  return force;
}

export const GraphCanvas = forwardRef<GraphCanvasApi, Props>(function GraphCanvas({ graph, clusters, layout: layoutInput, visual: visualInput, selectedId, onSelect, onSimulation }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const dataRef = useRef(graph);
  const clusterMap = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const layout = { ...DEFAULT_LAYOUT, ...layoutInput, axis: { ...DEFAULT_LAYOUT.axis!, ...(layoutInput?.axis || {}) } };
  const visual = { ...DEFAULT_VISUAL, ...visualInput };

  useImperativeHandle(ref, () => ({
    fit: () => graphRef.current?.zoomToFit(650, 44),
    pause: () => { graphRef.current?.pauseAnimation(); onSimulation("paused"); },
    resume: () => { graphRef.current?.resumeAnimation(); onSimulation("running"); },
    reheat: () => { graphRef.current?.d3ReheatSimulation(); onSimulation("running"); },
    focus: (nodeId) => {
      const node = dataRef.current.nodes.find((item) => item.id === nodeId);
      if (!node || node.x === undefined) return;
      const distance = 85;
      const ratio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
      graphRef.current?.cameraPosition({ x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio }, node, 700);
    },
    getPositions: () => Object.fromEntries(dataRef.current.nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)).map((node) => [node.id, { x: Number(node.x!.toFixed(3)), y: Number(node.y!.toFixed(3)), z: Number(node.z!.toFixed(3)) }])),
  }), [onSimulation]);

  useEffect(() => {
    let disposed = false;
    const hostElement = hostRef.current;
    if (!hostElement) return;
    import("3d-force-graph").then(({ default: ForceGraph3D }) => {
      if (disposed || !hostRef.current) return;
      const instance = new (ForceGraph3D as any)()(hostRef.current, { controlType: "orbit" });
      graphRef.current = instance;
      setReady(true);
      instance.backgroundColor(visual.background).showNavInfo(false).nodeResolution(12).nodeRelSize(4).linkOpacity(visual.linkOpacity).linkWidth((link: any) => Math.max(0.5, Math.min(3, Number(link.weight || 1) * visual.linkWidth))).linkDirectionalParticles((link: any) => visual.showDirectionalParticles && link.directed ? 2 : 0).linkDirectionalParticleWidth(1.4).linkDirectionalParticleSpeed(0.006).onNodeClick((node: RuntimeNode) => onSelect(node.id)).onBackgroundClick(() => onSelect(null)).onEngineTick(() => onSimulation("running")).onEngineStop(() => onSimulation("settled"));
      const resize = () => { if (hostRef.current) instance.width(hostRef.current.clientWidth).height(hostRef.current.clientHeight); };
      const observer = new ResizeObserver(resize);
      observer.observe(hostRef.current);
      resize();
      (hostRef.current as HTMLDivElement & { _observer?: ResizeObserver })._observer = observer;
    });
    return () => {
      disposed = true;
      const host = hostElement as HTMLDivElement & { _observer?: ResizeObserver };
      host?._observer?.disconnect();
      graphRef.current?._destructor?.();
      graphRef.current = null;
    };
    // The renderer is mounted exactly once; changing callbacks are consumed by graph-data refreshes.
  }, []);

  useEffect(() => {
    const instance = graphRef.current;
    if (!instance) return;
    dataRef.current = graph;
    const selectedNeighbors = new Set<string>();
    if (selectedId) graph.links.forEach((link) => { if (endpointId(link.source) === selectedId) selectedNeighbors.add(endpointId(link.target)); if (endpointId(link.target) === selectedId) selectedNeighbors.add(endpointId(link.source)); });
    instance.nodeColor((node: RuntimeNode) => {
      if (selectedId && visual.dimUnrelatedOnSelection && node.id !== selectedId && !selectedNeighbors.has(node.id)) return "#2c3340";
      return node.color || clusterColor(node.cluster, clusterMap.get(node.cluster)?.color);
    }).nodeVal((node: RuntimeNode) => node.id === selectedId ? Math.min(visual.nodeSizeMax + 5, (node.value || 4) + 7) : Math.max(visual.nodeSizeMin, Math.min(visual.nodeSizeMax, node.value || 4))).nodeLabel((node: RuntimeNode) => `<div class="graph-tooltip"><b>${escapeHtml(node.label)}</b><span>${escapeHtml(clusterMap.get(node.cluster)?.label || node.cluster)}</span></div>`).linkColor((link: any) => selectedId && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId) ? "#d9deff" : (link.color || "#78839a")).graphData(graph).d3Force("cluster", clusterForce(graph.nodes, clusters, layout.clusterStrength)).d3Force("axis", axisForce(graph.nodes, layout.axis));
    const charge = instance.d3Force("charge");
    charge?.strength?.(layout.chargeStrength);
    const linkForce = instance.d3Force("link");
    linkForce?.distance?.(layout.linkDistance);
    if (layout.mode === "baked") instance.cooldownTicks(0); else instance.cooldownTicks(layout.cooldownTicks).warmupTicks(layout.warmupTicks).d3ReheatSimulation();
    // Configuration objects are intentionally collapsed to their public inputs.
  }, [graph, clusters, selectedId, layoutInput, visualInput, ready]);

  return <div ref={hostRef} className="graph-canvas" role="img" aria-label="Visualização tridimensional interativa do grafo. Use a busca e o painel textual para navegação acessível." />;
});

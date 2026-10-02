import { validateDataset } from "../data/validate";
import { generateLinkId } from "../data/ids";
import type { GraphDataset, GraphLink, GraphNode } from "../core/types";
import { headingAnchor, stableKey } from "./markdown";
import type { GraphDeltaOperation, GraphDeltaProposal, ProposalEvidence, SourceManifest, SourceRecord } from "./types";

const VAGUE_RELATIONS = new Set(["related", "associated_with", "linked_to", "about", "misc"]);
const ENTITY_FIELDS = {
  node: new Set(["id", "label", "cluster", "value", "level", "color", "visible", "pinned", "position", "tags", "metadata"]),
  link: new Set(["id", "source", "target", "type", "weight", "directed", "visible", "color", "metadata"]),
  cluster: new Set(["id", "label", "color", "description", "visible", "metadata"]),
};

export function buildSourceMapDataset(manifest: SourceManifest): GraphDataset {
  const folders = [...new Set(manifest.sources.map((source) => source.path.includes("/") ? source.path.split("/")[0] : ""))];
  const clusterIds = new Map<string, string>();
  const clusters = folders.map((folder) => {
    const id = `folder-${stableKey(folder || "root")}`;
    clusterIds.set(folder, id);
    return { id, label: folder || "Raiz", description: "Pasta documental do vault, exibida porque o modo mapa de fontes foi escolhido.", metadata: { secondMind: { kind: "document-folder" } } };
  });
  const nodeIds = new Map(manifest.sources.map((source) => [source.sourceId, `source-${stableKey(source.sourceId)}`]));
  const nodes: GraphNode[] = manifest.sources.map((source) => {
    const folder = source.path.includes("/") ? source.path.split("/")[0] : "";
    return {
      id: nodeIds.get(source.sourceId)!,
      label: source.title,
      cluster: clusterIds.get(folder)!,
      value: Math.max(3, Math.min(12, 3 + source.links.length)),
      tags: source.tags,
      metadata: { secondMind: { kind: "source-note", sourceId: source.sourceId, path: source.path, fingerprint: source.fingerprint, headings: source.headings.map((heading) => heading.anchor) } },
    };
  });
  const linkUses = new Set<string>();
  const links: Array<GraphLink & { id: string }> = [];
  for (const source of manifest.sources) for (const link of source.links) {
    if (link.resolution !== "resolved" || !link.resolvedSourceId) continue;
    const signature = `${source.sourceId}\0${link.resolvedSourceId}\0${link.kind}\0${link.anchor || ""}`;
    if (linkUses.has(signature)) continue;
    linkUses.add(signature);
    const candidate: GraphLink = {
      source: nodeIds.get(source.sourceId)!,
      target: nodeIds.get(link.resolvedSourceId)!,
      type: link.kind === "wikilink" ? "wikilink" : "markdown-link",
      directed: true,
      metadata: { secondMind: { explicitSourceLink: true, sourceId: source.sourceId, sourcePath: source.path, targetSourceId: link.resolvedSourceId, target: link.target, anchor: link.anchor } },
    };
    links.push({ ...candidate, id: generateLinkId(candidate, links.map((item) => item.id)) });
  }
  return {
    schemaVersion: "1.1",
    meta: { id: `vault-map-${manifest.vaultId}`, title: "Mapa de fontes locais", description: "Vista documental gerada localmente a partir de um vault Markdown selecionado por Moon.", version: "1.0.0", source: "markdown-vault" },
    clusters,
    nodes,
    links,
    extensions: { secondMind: { mode: "source-map", sourceManifestFingerprint: manifest.fingerprint, generatedAt: manifest.createdAt } },
  };
}

function excerptFor(source: SourceRecord, anchor?: string): string {
  const lines = source.content.split(/\r?\n/);
  if (anchor) {
    const start = lines.findIndex((line) => /^\s{0,3}#{1,6}\s+/.test(line) && headingAnchor(line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s*#+\s*$/, "").trim()) === anchor);
    if (start >= 0) {
      const section: string[] = [lines[start]];
      for (let index = start + 1; index < lines.length && !/^\s{0,3}#{1,6}\s+/.test(lines[index]); index += 1) if (lines[index].trim()) section.push(lines[index]);
      return section.join(" ").slice(0, 320);
    }
  }
  return (source.content.replace(/^---[\s\S]*?---\s*/m, "").trim().split(/\r?\n/).find((line) => line.trim()) || source.title).slice(0, 320);
}

function evidenceFor(source: SourceRecord, anchor: string | undefined, derivation: ProposalEvidence["derivation"] = "derived"): ProposalEvidence {
  return { sourceId: source.sourceId, path: source.path, fingerprint: source.fingerprint, anchor, quote: excerptFor(source, anchor), derivation };
}

function candidateCluster(source: SourceRecord) {
  const folder = source.path.includes("/") ? source.path.split("/")[0] : "Raiz";
  return { id: `candidate-${stableKey(folder)}`, label: `Candidatos · ${folder}`, description: "Agrupamento provisório gerado pelo compilador Markdown; requer revisão semântica." };
}

export function compileMarkdownDeterministically(dataset: GraphDataset, manifest: SourceManifest, sourceIds?: string[]): GraphDeltaProposal {
  const selected = new Set(sourceIds || manifest.sources.map((source) => source.sourceId));
  const sources = manifest.sources.filter((source) => selected.has(source.sourceId));
  const operations: GraphDeltaOperation[] = [];
  const pendingClusters = new Set<string>();
  const nodeBySourceAndAnchor = new Map<string, string>();
  const usedNodeIds = new Set(dataset.nodes.map((node) => node.id));
  const usedLinkIds = new Set(dataset.links.map((link) => link.id));
  const clustersPresent = new Set(dataset.clusters.map((cluster) => cluster.id));

  for (const source of sources) {
    const headings = source.headings.filter((heading) => heading.depth <= 3).slice(0, 40);
    if (!headings.length) continue;
    const cluster = candidateCluster(source);
    if (!clustersPresent.has(cluster.id) && !pendingClusters.has(cluster.id)) {
      pendingClusters.add(cluster.id);
      operations.push({ operationId: `cluster-${stableKey(cluster.id)}`, kind: "add-cluster", cluster, confidence: 0.55, epistemicStatus: "derived", rationale: "Cria um agrupamento provisório pela pasta de origem, para manter candidatos separados do vocabulário existente.", evidence: [evidenceFor(source, headings[0].anchor)] });
    }
    for (const heading of headings) {
      const nodeId = `sm-${stableKey(`${source.sourceId}#${heading.anchor}`)}`;
      nodeBySourceAndAnchor.set(`${source.sourceId}#${heading.anchor}`, nodeId);
      if (usedNodeIds.has(nodeId)) continue;
      usedNodeIds.add(nodeId);
      const node: GraphNode = {
        id: nodeId,
        label: heading.text,
        cluster: cluster.id,
        value: Math.max(3, 7 - heading.depth),
        level: heading.depth,
        tags: source.tags,
        metadata: { secondMind: { kind: "heading-candidate", epistemicStatus: "derived", sourceRefs: [{ sourceId: source.sourceId, path: source.path, fingerprint: source.fingerprint, anchor: heading.anchor }] } },
      };
      operations.push({ operationId: `node-${nodeId}`, kind: "add-node", node, confidence: 0.58, epistemicStatus: "derived", rationale: "Uma seção marcada como título vira candidata inspecionável; a estrutura do documento não é tratada como verdade semântica aprovada.", evidence: [evidenceFor(source, heading.anchor)] });
    }
  }

  for (const source of sources) for (const link of source.links) {
    if (link.resolution !== "resolved" || !link.resolvedSourceId || !link.anchor || !link.fromAnchor) continue;
    const sourceNodeId = nodeBySourceAndAnchor.get(`${source.sourceId}#${link.fromAnchor}`);
    const targetNodeId = nodeBySourceAndAnchor.get(`${link.resolvedSourceId}#${link.anchor}`);
    if (!sourceNodeId || !targetNodeId) continue;
    const existing = dataset.links.some((item) => item.source === sourceNodeId && item.target === targetNodeId && item.type === "references");
    if (existing) continue;
    const candidate: GraphLink = { source: sourceNodeId, target: targetNodeId, type: "references", directed: true, metadata: { secondMind: { sourceId: source.sourceId, anchor: link.fromAnchor, targetAnchor: link.anchor, explicit: true } } };
    const id = generateLinkId(candidate, [...usedLinkIds]);
    usedLinkIds.add(id);
    operations.push({ operationId: `link-${stableKey(id)}`, kind: "add-link", link: { ...candidate, id }, confidence: 0.95, epistemicStatus: "explicit", rationale: "Relação documental explícita em wikilink ou link Markdown com âncora resolvida.", evidence: [evidenceFor(source, link.fromAnchor, "explicit")] });
  }

  return { proposalVersion: "1.0", proposalId: `proposal-${stableKey(`${manifest.fingerprint}:${Date.now()}`)}`, datasetId: dataset.meta.id, createdAt: new Date().toISOString(), compiler: "deterministic-markdown", summary: `${operations.length} operação(ões) candidata(s) em ${sources.length} nota(s); títulos e relações explícitas continuam sujeitos à revisão.`, operations };
}

export function validateProposal(proposal: GraphDeltaProposal, dataset: GraphDataset, manifest?: SourceManifest): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!proposal || typeof proposal !== "object") return { valid: false, errors: ["A proposta precisa ser um objeto JSON."], warnings };
  if (proposal.proposalVersion !== "1.0") errors.push("Versão de proposta não suportada.");
  if (typeof proposal.proposalId !== "string" || !proposal.proposalId.trim() || proposal.datasetId !== dataset.meta.id) errors.push("A proposta não pertence ao dataset atual.");
  if (typeof proposal.proposalId === "string" && proposal.proposalId.length > 200) errors.push("ID de proposta excede 200 caracteres.");
  if (typeof proposal.createdAt !== "string" || !Number.isFinite(Date.parse(proposal.createdAt))) errors.push("Data de criação da proposta inválida.");
  if (typeof proposal.summary !== "string" || proposal.summary.length > 3000) errors.push("Resumo da proposta ausente ou longo demais.");
  if (!["deterministic-markdown", "ai-bridge", "external-import"].includes(proposal.compiler)) errors.push("Compilador de proposta não suportado.");
  if (!Array.isArray(proposal.operations)) return { valid: false, errors: [...errors, "A proposta precisa conter uma lista de operações."], warnings };
  if (proposal.operations.length > 1000) errors.push("A proposta excede o limite de 1000 operações.");
  if (proposal.operations.length && !manifest) errors.push("Importe o manifesto de fontes para validar proveniência antes de revisar operações.");
  const operationIds = new Set<string>();
  const nodes = new Set(dataset.nodes.map((node) => node.id));
  const links = new Set(dataset.links.map((link) => link.id));
  const clusters = new Set(dataset.clusters.map((cluster) => cluster.id));
  const allowedKinds = new Set(["add-node", "update-node", "retire-node", "delete-node", "add-link", "update-link", "retire-link", "delete-link", "add-cluster", "update-cluster", "delete-cluster"]);
  for (const operation of proposal.operations) {
    if (!operation || typeof operation !== "object" || typeof operation.kind !== "string") { errors.push("A proposta contém uma operação malformada."); continue; }
    if (!allowedKinds.has(operation.kind)) { errors.push(`${operation.operationId || "Operação"}: tipo de operação desconhecido.`); continue; }
    const fields = new Set(["operationId", "kind", "confidence", "epistemicStatus", "evidence", "rationale"]);
    if (["add-node", "add-link", "add-cluster"].includes(operation.kind)) fields.add(operation.kind.slice(4));
    else if (["update-node", "retire-node", "delete-node"].includes(operation.kind)) { fields.add("nodeId"); if (operation.kind === "update-node") fields.add("patch"); }
    else if (["update-link", "retire-link", "delete-link"].includes(operation.kind)) { fields.add("linkId"); if (operation.kind === "update-link") fields.add("patch"); }
    else { fields.add("clusterId"); if (operation.kind === "update-cluster") fields.add("patch"); if (operation.kind === "delete-cluster") fields.add("reassignTo"); }
    Object.keys(operation).filter((field) => !fields.has(field)).forEach((field) => errors.push(`${operation.operationId}: campo de operação não suportado: ${field}.`));
    if (!operation.operationId || operationIds.has(operation.operationId)) errors.push(`ID de operação ausente ou duplicado: ${operation.operationId || "(vazio)"}.`);
    operationIds.add(operation.operationId);
    if (!Number.isFinite(operation.confidence) || operation.confidence < 0 || operation.confidence > 1) errors.push(`${operation.operationId}: confiança fora do intervalo 0–1.`);
    if (!["explicit", "derived", "inferred"].includes(operation.epistemicStatus)) errors.push(`${operation.operationId}: estado epistêmico inválido.`);
    if (typeof operation.rationale !== "string" || !operation.rationale.trim() || operation.rationale.length > 2000) errors.push(`${operation.operationId}: justificativa ausente ou longa demais.`);
    if (!Array.isArray(operation.evidence) || !operation.evidence.length) errors.push(`${operation.operationId}: evidência de origem obrigatória.`);
    for (const evidence of Array.isArray(operation.evidence) ? operation.evidence : []) {
      if (!evidence || typeof evidence !== "object") { errors.push(`${operation.operationId}: evidência malformada.`); continue; }
      if (["sourceId", "path", "fingerprint", "quote", "derivation"].some((field) => typeof (evidence as unknown as Record<string, unknown>)[field] !== "string")) { errors.push(`${operation.operationId}: referência de evidência incompleta.`); continue; }
      if (!["explicit", "derived", "inferred"].includes(evidence.derivation)) errors.push(`${operation.operationId}: tipo de derivação inválido.`);
      const source = manifest?.sources.find((item) => item.sourceId === evidence.sourceId);
      if (!source || source.fingerprint !== evidence.fingerprint || source.path !== evidence.path) errors.push(`${operation.operationId}: evidência ausente ou desatualizada em ${evidence.path}.`);
      const quote = typeof evidence.quote === "string" ? evidence.quote : "";
      if (quote.length > 1000) errors.push(`${operation.operationId}: trecho de evidência excede 1000 caracteres.`);
      if (!quote.trim() || (source && !source.content.replace(/\s+/g, " ").includes(quote.replace(/\s+/g, " ").trim()))) errors.push(`${operation.operationId}: o trecho de evidência não foi encontrado na fonte vinculada.`);
      if (source && evidence.anchor && !source.headings.some((heading) => heading.anchor === evidence.anchor)) errors.push(`${operation.operationId}: âncora inexistente em ${evidence.path}#${evidence.anchor}.`);
    }
    if (operation.kind === "add-cluster") {
      if (!operation.cluster || typeof operation.cluster !== "object" || typeof operation.cluster.id !== "string" || typeof operation.cluster.label !== "string") { errors.push(`${operation.operationId}: dados do cluster malformados.`); continue; }
      Object.keys(operation.cluster).filter((field) => !ENTITY_FIELDS.cluster.has(field)).forEach((field) => errors.push(`${operation.operationId}: campo de cluster não suportado: ${field}.`));
      if (!operation.cluster.id || clusters.has(operation.cluster.id)) errors.push(`${operation.operationId}: cluster já existe ou tem ID vazio.`);
      else clusters.add(operation.cluster.id);
    } else if (operation.kind === "update-cluster") {
      if (!operation.patch || typeof operation.patch !== "object" || Array.isArray(operation.patch)) errors.push(`${operation.operationId}: patch de cluster malformado.`);
      else Object.keys(operation.patch).filter((field) => !ENTITY_FIELDS.cluster.has(field) || field === "id").forEach((field) => errors.push(`${operation.operationId}: campo de patch de cluster não suportado: ${field}.`));
      if (!clusters.has(operation.clusterId)) errors.push(`${operation.operationId}: cluster inexistente ${operation.clusterId}.`);
    } else if (operation.kind === "delete-cluster") {
      if (!clusters.has(operation.clusterId)) errors.push(`${operation.operationId}: cluster inexistente ${operation.clusterId}.`);
      if (operation.reassignTo && !clusters.has(operation.reassignTo)) errors.push(`${operation.operationId}: cluster de destino inexistente.`);
      clusters.delete(operation.clusterId);
    } else if (operation.kind === "add-node") {
      if (!operation.node || typeof operation.node !== "object" || typeof operation.node.id !== "string" || typeof operation.node.label !== "string" || typeof operation.node.cluster !== "string") { errors.push(`${operation.operationId}: dados do nó malformados.`); continue; }
      Object.keys(operation.node).filter((field) => !ENTITY_FIELDS.node.has(field)).forEach((field) => errors.push(`${operation.operationId}: campo de nó não suportado: ${field}.`));
      if (!operation.node.id || nodes.has(operation.node.id)) errors.push(`${operation.operationId}: nó já existe ou tem ID vazio.`);
      if (!clusters.has(operation.node.cluster)) errors.push(`${operation.operationId}: cluster inexistente ${operation.node.cluster}.`);
      nodes.add(operation.node.id);
    } else if (["update-node", "retire-node", "delete-node"].includes(operation.kind)) {
      const nodeId = "nodeId" in operation ? operation.nodeId : "";
      if (operation.kind === "update-node") {
        if (!operation.patch || typeof operation.patch !== "object" || Array.isArray(operation.patch)) errors.push(`${operation.operationId}: patch de nó malformado.`);
        else Object.keys(operation.patch).filter((field) => !ENTITY_FIELDS.node.has(field) || field === "id").forEach((field) => errors.push(`${operation.operationId}: campo de patch de nó não suportado: ${field}.`));
      }
      if (!nodes.has(nodeId)) errors.push(`${operation.operationId}: nó inexistente ${nodeId}.`);
      if (operation.kind === "delete-node") nodes.delete(nodeId);
    } else if (operation.kind === "add-link") {
      if (!operation.link || typeof operation.link !== "object" || typeof operation.link.id !== "string" || typeof operation.link.source !== "string" || typeof operation.link.target !== "string") { errors.push(`${operation.operationId}: dados da relação malformados.`); continue; }
      Object.keys(operation.link).filter((field) => !ENTITY_FIELDS.link.has(field)).forEach((field) => errors.push(`${operation.operationId}: campo de relação não suportado: ${field}.`));
      if (!operation.link.id || links.has(operation.link.id)) errors.push(`${operation.operationId}: link já existe ou não tem ID estável.`);
      if (!nodes.has(operation.link.source) || !nodes.has(operation.link.target)) errors.push(`${operation.operationId}: link aponta para nó inexistente.`);
      links.add(operation.link.id || "");
      if (VAGUE_RELATIONS.has((operation.link.type || "related").toLocaleLowerCase())) warnings.push(`${operation.operationId}: relação vaga “${operation.link.type || "related"}”; revise antes de aceitar.`);
    } else if (["update-link", "retire-link", "delete-link"].includes(operation.kind)) {
      const linkId = "linkId" in operation ? operation.linkId : "";
      if (operation.kind === "update-link") {
        if (!operation.patch || typeof operation.patch !== "object" || Array.isArray(operation.patch)) errors.push(`${operation.operationId}: patch de relação malformado.`);
        else Object.keys(operation.patch).filter((field) => !ENTITY_FIELDS.link.has(field) || field === "id").forEach((field) => errors.push(`${operation.operationId}: campo de patch de relação não suportado: ${field}.`));
      }
      if (!links.has(linkId)) errors.push(`${operation.operationId}: link inexistente ${linkId}.`);
      if (operation.kind === "delete-link") links.delete(linkId);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function applyGraphDelta(dataset: GraphDataset, proposal: GraphDeltaProposal, acceptedOperationIds: string[], manifest?: SourceManifest): GraphDataset {
  const validation = validateProposal(proposal, dataset, manifest);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  if (!Array.isArray(acceptedOperationIds) || !acceptedOperationIds.length) throw new Error("Selecione ao menos uma operação para aceitar.");
  const knownOperationIds = new Set(proposal.operations.map((operation) => operation.operationId));
  if (acceptedOperationIds.some((id) => !knownOperationIds.has(id))) throw new Error("A seleção inclui uma operação que não pertence à proposta.");
  const selected = new Set(acceptedOperationIds);
  const next = structuredClone(dataset);
  for (const operation of proposal.operations) {
    if (!selected.has(operation.operationId)) continue;
    if (operation.kind === "add-cluster") next.clusters.push(structuredClone(operation.cluster));
    else if (operation.kind === "update-cluster") next.clusters = next.clusters.map((cluster) => cluster.id === operation.clusterId ? { ...cluster, ...operation.patch, id: cluster.id } : cluster);
    else if (operation.kind === "delete-cluster") {
      if (next.nodes.some((node) => node.cluster === operation.clusterId) && !operation.reassignTo) throw new Error(`Cluster ${operation.clusterId} ainda contém nós; forneça um destino antes de excluí-lo.`);
      if (operation.reassignTo) next.nodes = next.nodes.map((node) => node.cluster === operation.clusterId ? { ...node, cluster: operation.reassignTo! } : node);
      next.clusters = next.clusters.filter((cluster) => cluster.id !== operation.clusterId);
    } else if (operation.kind === "add-node") next.nodes.push(structuredClone(operation.node));
    else if (operation.kind === "update-node") next.nodes = next.nodes.map((node) => node.id === operation.nodeId ? { ...node, ...operation.patch, id: node.id } : node);
    else if (operation.kind === "retire-node") next.nodes = next.nodes.map((node) => node.id === operation.nodeId ? { ...node, visible: false, metadata: { ...node.metadata, secondMind: { ...(node.metadata?.secondMind as Record<string, unknown> || {}), retired: true } } } : node);
    else if (operation.kind === "delete-node") { next.nodes = next.nodes.filter((node) => node.id !== operation.nodeId); next.links = next.links.filter((link) => link.source !== operation.nodeId && link.target !== operation.nodeId); }
    else if (operation.kind === "add-link") next.links.push(structuredClone(operation.link) as GraphLink & { id: string });
    else if (operation.kind === "update-link") next.links = next.links.map((link) => link.id === operation.linkId ? { ...link, ...operation.patch, id: link.id } : link);
    else if (operation.kind === "retire-link") next.links = next.links.map((link) => link.id === operation.linkId ? { ...link, visible: false } : link);
    else if (operation.kind === "delete-link") next.links = next.links.filter((link) => link.id !== operation.linkId);
  }
  const result = validateDataset(next);
  if (!result.valid) throw new Error(result.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; "));
  return next;
}

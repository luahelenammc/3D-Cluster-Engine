import Ajv2020 from "ajv/dist/2020";
import type { AxisDimension, GraphDataset, ValidationIssue } from "../core/types";
import { PERFORMANCE_ENVELOPE } from "./contract";
import { graphDatasetSchema } from "./schema";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const structural = ajv.compile(graphDatasetSchema);
const axisDimensions: AxisDimension[] = ["x", "y", "z"];

function readNumericField(node: GraphDataset["nodes"][number], path: string): number | undefined {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = node;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  const value = Number(current);
  return Number.isFinite(value) ? value : undefined;
}

function duplicated(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateDataset(input: unknown): { valid: boolean; issues: ValidationIssue[]; dataset?: GraphDataset } {
  const issues: ValidationIssue[] = [];
  if (!structural(input)) {
    for (const error of structural.errors || []) {
      issues.push({
        severity: "error",
        path: error.instancePath || "/",
        message: error.message || "Estrutura inválida",
        suggestion: "Converta a entrada para o contrato canônico 1.1 antes de carregá-la na store.",
      });
    }
    return { valid: false, issues };
  }

  const dataset = input as GraphDataset;
  const clusterIds = new Set(dataset.clusters.map((cluster) => cluster.id));
  const nodeIds = new Set(dataset.nodes.map((node) => node.id));

  duplicated(dataset.clusters.map((cluster) => cluster.id)).forEach((id) => {
    issues.push({ severity: "error", path: "/clusters", message: `ID de cluster duplicado: ${id}` });
  });
  duplicated(dataset.nodes.map((node) => node.id)).forEach((id) => {
    issues.push({ severity: "error", path: "/nodes", message: `ID de nó duplicado: ${id}` });
  });
  duplicated(dataset.links.map((link) => link.id)).forEach((id) => {
    issues.push({ severity: "error", path: "/links", message: `ID de link duplicado: ${id}` });
  });

  const linkSignatures = new Set<string>();
  const incidentCounts = new Map(dataset.nodes.map((node) => [node.id, 0]));

  dataset.nodes.forEach((node, index) => {
    if (!clusterIds.has(node.cluster)) {
      issues.push({
        severity: "error",
        path: `/nodes/${index}/cluster`,
        message: `Cluster inexistente: ${node.cluster}`,
        suggestion: "Crie o cluster ou mova o nó para um cluster existente.",
      });
    }
    if (node.tags && new Set(node.tags).size !== node.tags.length) {
      issues.push({ severity: "warning", path: `/nodes/${index}/tags`, message: "Tags duplicadas serão semanticamente redundantes." });
    }
  });

  dataset.links.forEach((link, index) => {
    if (!nodeIds.has(link.source)) issues.push({ severity: "error", path: `/links/${index}/source`, message: `Nó de origem inexistente: ${link.source}` });
    if (!nodeIds.has(link.target)) issues.push({ severity: "error", path: `/links/${index}/target`, message: `Nó de destino inexistente: ${link.target}` });
    if (link.source === link.target) issues.push({ severity: "warning", path: `/links/${index}`, message: "Self-link detectado." });
    if (nodeIds.has(link.source)) incidentCounts.set(link.source, (incidentCounts.get(link.source) || 0) + 1);
    if (nodeIds.has(link.target)) incidentCounts.set(link.target, (incidentCounts.get(link.target) || 0) + 1);
    const signature = `${link.source}→${link.target}:${link.type || "related"}`;
    if (linkSignatures.has(signature)) {
      issues.push({ severity: "warning", path: `/links/${index}`, message: "Relação paralela com mesma origem, destino e tipo. Confirme se é intencional." });
    }
    linkSignatures.add(signature);
  });

  const axes = dataset.layout?.axes;
  if (axes?.enabled) {
    axisDimensions.forEach((dimension) => {
      const axis = axes[dimension];
      if (axis.min !== undefined && axis.max !== undefined && axis.min > axis.max) {
        issues.push({ severity: "error", path: `/layout/axes/${dimension}`, message: `O mínimo do eixo ${dimension.toUpperCase()} é maior que o máximo.` });
      }
      if (axis.source === "field" && axis.field) {
        const coverage = dataset.nodes.filter((node) => readNumericField(node, axis.field!) !== undefined).length;
        if (coverage === 0) {
          issues.push({ severity: "warning", path: `/layout/axes/${dimension}/field`, message: `Nenhum nó possui valor numérico em ${axis.field}.`, suggestion: `O fallback ${axis.missing || "center"} será usado.` });
        } else if (coverage < dataset.nodes.length) {
          issues.push({ severity: "warning", path: `/layout/axes/${dimension}/field`, message: `${dataset.nodes.length - coverage} nó(s) não possuem valor numérico em ${axis.field}.`, suggestion: `Declare um fallback consciente; hoje será usado ${axis.missing || "center"}.` });
        }
      }
    });
  }

  const isolated = [...incidentCounts.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  if (isolated.length) {
    issues.push({ severity: "warning", path: "/nodes", message: `${isolated.length} nó(s) isolado(s), sem qualquer link.`, suggestion: "Mantenha-os apenas se isolamento for informação real do corpus." });
  }

  const averageDegree = dataset.nodes.length ? (dataset.links.length * 2) / dataset.nodes.length : 0;
  if (averageDegree > PERFORMANCE_ENVELOPE.averageDegreeWarning) {
    issues.push({ severity: "warning", path: "/links", message: `Densidade alta: grau médio ${averageDegree.toFixed(1)}.`, suggestion: "Considere filtros, agregação ou level of detail para preservar legibilidade." });
  }
  if (dataset.nodes.length > PERFORMANCE_ENVELOPE.desktopRecommended.nodes || dataset.links.length > PERFORMANCE_ENVELOPE.desktopRecommended.links) {
    issues.push({ severity: "warning", path: "/", message: `Dataset acima do envelope desktop recomendado (${PERFORMANCE_ENVELOPE.desktopRecommended.nodes} nós / ${PERFORMANCE_ENVELOPE.desktopRecommended.links} links).`, suggestion: "Ajuste labels, partículas e física, e valide em hardware real." });
  }
  if (dataset.nodes.length > PERFORMANCE_ENVELOPE.stressBoundary.nodes || dataset.links.length > PERFORMANCE_ENVELOPE.stressBoundary.links) {
    issues.push({ severity: "warning", path: "/", message: "Dataset acima da fronteira de stress atualmente declarada; responsividade não é garantida." });
  }
  const serializedBytes = new TextEncoder().encode(JSON.stringify(dataset)).byteLength;
  if (serializedBytes > PERFORMANCE_ENVELOPE.serializedSizeWarningBytes) {
    issues.push({ severity: "warning", path: "/", message: `Dataset serializado ocupa ${(serializedBytes / 1024 / 1024).toFixed(1)} MB.`, suggestion: "Mova blobs e textos extensos para referências externas quando possível." });
  }

  return { valid: !issues.some((issue) => issue.severity === "error"), issues, dataset };
}

export function assertValidDataset(input: unknown): GraphDataset {
  const result = validateDataset(input);
  if (!result.valid || !result.dataset) {
    throw new Error(result.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  return result.dataset;
}

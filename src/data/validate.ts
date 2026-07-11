import Ajv from "ajv";
import type { AxisDimension, GraphDataset, ValidationIssue } from "../core/types";
import { graphDatasetSchema } from "./schema";

const ajv = new Ajv({ allErrors: true, strict: false });
const structural = ajv.compile(graphDatasetSchema);
const axisDimensions: AxisDimension[] = ["x", "y", "z"];
const axisSources = new Set(["field", "cluster", "degree", "inDegree", "outDegree", "graphDepth", "stableIndex"]);

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

export function validateDataset(input: unknown): { valid: boolean; issues: ValidationIssue[]; dataset?: GraphDataset } {
  const issues: ValidationIssue[] = [];
  if (!structural(input)) {
    for (const error of structural.errors || []) {
      issues.push({ severity: "error", path: error.instancePath || "/", message: error.message || "Estrutura inválida", suggestion: "Corrija o campo indicado e tente importar novamente." });
    }
    return { valid: false, issues };
  }
  const dataset = input as GraphDataset;
  const nodeIds = new Set<string>();
  const clusterIds = new Set((dataset.clusters || []).map((cluster) => cluster.id));
  const linkKeys = new Set<string>();
  dataset.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) issues.push({ severity: "error", path: `/nodes/${index}/id`, message: `ID de nó duplicado: ${node.id}` });
    nodeIds.add(node.id);
    if (!clusterIds.has(node.cluster)) issues.push({ severity: "error", path: `/nodes/${index}/cluster`, message: `Cluster inexistente: ${node.cluster}`, suggestion: "Crie o cluster ou mova o nó para um cluster existente." });
  });
  dataset.links.forEach((link, index) => {
    if (!nodeIds.has(link.source)) issues.push({ severity: "error", path: `/links/${index}/source`, message: `Nó de origem inexistente: ${link.source}` });
    if (!nodeIds.has(link.target)) issues.push({ severity: "error", path: `/links/${index}/target`, message: `Nó de destino inexistente: ${link.target}` });
    if (link.source === link.target) issues.push({ severity: "warning", path: `/links/${index}`, message: "Self-link detectado." });
    const key = `${link.source}→${link.target}:${link.type || "related"}`;
    if (linkKeys.has(key)) issues.push({ severity: "warning", path: `/links/${index}`, message: "Link possivelmente duplicado." });
    linkKeys.add(key);
  });

  const axes = dataset.layout?.axes;
  if (axes?.enabled) {
    axisDimensions.forEach((dimension) => {
      const axis = axes[dimension];
      if (!axis) {
        issues.push({ severity: "error", path: `/layout/axes/${dimension}`, message: `Configuração ausente para o eixo ${dimension.toUpperCase()}.` });
        return;
      }
      if (!axisSources.has(axis.source)) {
        issues.push({ severity: "error", path: `/layout/axes/${dimension}/source`, message: `Fonte de eixo desconhecida: ${String(axis.source)}` });
      }
      if (axis.source === "field") {
        if (!axis.field?.trim()) {
          issues.push({ severity: "error", path: `/layout/axes/${dimension}/field`, message: `O eixo ${dimension.toUpperCase()} usa campo numérico, mas nenhum campo foi informado.` });
        } else if (!dataset.nodes.some((node) => readNumericField(node, axis.field!) !== undefined)) {
          issues.push({ severity: "warning", path: `/layout/axes/${dimension}/field`, message: `Nenhum nó possui valor numérico em ${axis.field}.`, suggestion: `O fallback ${axis.missing || "center"} será usado.` });
        }
      }
    });
  }

  if (dataset.nodes.length > 2000) issues.push({ severity: "warning", path: "/nodes", message: "Dataset grande: a qualidade visual poderá ser reduzida automaticamente." });
  return { valid: !issues.some((issue) => issue.severity === "error"), issues, dataset };
}

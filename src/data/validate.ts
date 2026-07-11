import Ajv from "ajv";
import type { GraphDataset, ValidationIssue } from "../core/types";
import { graphDatasetSchema } from "./schema";

const ajv = new Ajv({ allErrors: true, strict: false });
const structural = ajv.compile(graphDatasetSchema);

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
  if (dataset.nodes.length > 2000) issues.push({ severity: "warning", path: "/nodes", message: "Dataset grande: a qualidade visual poderá ser reduzida automaticamente." });
  return { valid: !issues.some((issue) => issue.severity === "error"), issues, dataset };
}

import Ajv2020 from "ajv/dist/2020";
import type { GraphDataset } from "../core/types";
import registrySchema from "../../schema/dataset-registry.schema.json";
import { validateDataset } from "./validate";

export interface DatasetRegistryEntry {
  id: string;
  title: string;
  description?: string;
  path: string;
  tags?: string[];
  featured?: boolean;
}

export interface DatasetRegistry {
  registryVersion: "1.0";
  defaultDataset?: string;
  datasets: DatasetRegistryEntry[];
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const structural = ajv.compile(registrySchema);

function duplicated(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function baseWithSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function parseDatasetRegistry(input: unknown): DatasetRegistry {
  if (!structural(input)) {
    const details = (structural.errors || [])
      .map((error) => `${error.instancePath || "/"}: ${error.message || "estrutura inválida"}`)
      .join("; ");
    throw new Error(`Registry inválido. ${details}`);
  }

  const registry = input as DatasetRegistry;
  const duplicateIds = duplicated(registry.datasets.map((entry) => entry.id));
  if (duplicateIds.length) {
    throw new Error(`Registry inválido. IDs de dataset duplicados: ${duplicateIds.join(", ")}.`);
  }

  if (registry.defaultDataset && !registry.datasets.some((entry) => entry.id === registry.defaultDataset)) {
    throw new Error(`Registry inválido. Dataset padrão inexistente: ${registry.defaultDataset}.`);
  }

  return registry;
}

export function resolveRegistryEntry(registry: DatasetRegistry, requestedId?: string | null): DatasetRegistryEntry {
  const requested = requestedId ? registry.datasets.find((entry) => entry.id === requestedId) : undefined;
  if (requested) return requested;

  const fallback = registry.defaultDataset
    ? registry.datasets.find((entry) => entry.id === registry.defaultDataset)
    : undefined;
  return fallback || registry.datasets[0];
}

export function registryUrl(baseUrl: string): string {
  return `${baseWithSlash(baseUrl)}datasets/registry.json`;
}

export function registeredDatasetUrl(baseUrl: string, path: string): string {
  return `${baseWithSlash(baseUrl)}datasets/${path}`;
}

export async function fetchDatasetRegistry(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<DatasetRegistry> {
  const response = await fetcher(registryUrl(baseUrl));
  if (!response.ok) throw new Error(`Registry indisponível (${response.status}).`);
  return parseDatasetRegistry(await response.json());
}

export async function fetchRegisteredDataset(
  entry: DatasetRegistryEntry,
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<GraphDataset> {
  const response = await fetcher(registeredDatasetUrl(baseUrl, entry.path));
  if (!response.ok) throw new Error(`Dataset ${entry.id} indisponível (${response.status}).`);

  const result = validateDataset(await response.json());
  if (!result.valid || !result.dataset) {
    const details = result.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Dataset publicado inválido: ${entry.id}. ${details}`);
  }
  return result.dataset;
}

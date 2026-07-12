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

interface ContentManifest {
  version: string;
  title: string;
  description: string;
  clusters: GraphDataset["clusters"];
  nodeFiles: string[];
  linkFiles: string[];
  protocols?: string[];
  ontology?: string;
  relationContract?: Record<string, unknown>;
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

function relationOverlayUrl(baseUrl: string, entry: DatasetRegistryEntry): string | null {
  if (entry.id !== "acl") return null;
  return `${baseWithSlash(baseUrl)}datasets/acl/relations.v1.1.json`;
}

async function fetchJson<T>(url: string, label: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${label} indisponível (${response.status}).`);
  return await response.json() as T;
}

async function applyPoliticaContentV2(
  rawDataset: GraphDataset,
  baseUrl: string,
  fetcher: typeof fetch,
): Promise<void> {
  const root = `${baseWithSlash(baseUrl)}datasets/politica/`;
  const manifest = await fetchJson<ContentManifest>(
    `${root}content-v2-manifest.json`,
    "Manifesto substantivo politica",
    fetcher,
  );

  const nodeBatches = await Promise.all(
    manifest.nodeFiles.map((file) => fetchJson<GraphDataset["nodes"]>(`${root}${file}`, `Nós politica/${file}`, fetcher)),
  );
  const linkBatches = await Promise.all(
    manifest.linkFiles.map((file) => fetchJson<GraphDataset["links"]>(`${root}${file}`, `Relações politica/${file}`, fetcher)),
  );

  rawDataset.meta.title = manifest.title;
  rawDataset.meta.description = manifest.description;
  rawDataset.meta.version = manifest.version;
  rawDataset.meta.source = "Projeto Política — arquivos-fonte 00–04, Ecos do Abismo e metabolização relacional até 2026-07-12";
  rawDataset.meta.tags = [
    "politica", "brasil", "limeira", "psol", "democracia", "fisiologismo",
    "bolsonarismo", "justica-social", "relation-metabolism-1.0", "msl-4.1",
  ];
  rawDataset.clusters = manifest.clusters;
  rawDataset.nodes = nodeBatches.flat();
  rawDataset.links = linkBatches.flat();
  rawDataset.layout.seed = "politica-content-v2-2026-07-12";
  rawDataset.layout.axes.x.label = "Bacia substantiva";
  rawDataset.layout.axes.x.span = 520;
  rawDataset.layout.axes.y.label = "Da estrutura histórica à ação pública";
  rawDataset.layout.axes.y.span = 380;
  rawDataset.layout.axes.z.span = 320;
  rawDataset.extensions = {
    ...(rawDataset.extensions || {}),
    politica: {
      protocols: manifest.protocols,
      ontology: manifest.ontology,
      relationContract: manifest.relationContract,
      lineage: [
        "00. Política — Kernel, Modos e Governança",
        "01. Política — Estratégia Local, Candidatura, Partido e Alcance",
        "02. Política — Comunicação Pública, Instagram, Comentários e Arena",
        "03. Política — Ideologia, Newsroom, Ensaio e Mapa 8D",
        "04. Política – História do Brasil",
        "0.3 Ecos do Abismo - Ensaio sobre a Política Brasileira",
      ],
      sanitization: "public-sanitized",
    },
  };
}

export function parseDatasetRegistry(input: unknown): DatasetRegistry {
  if (!structural(input)) {
    const details = (structural.errors || [])
      .map((error) => `${error.instancePath || "/"}: ${error.message || "estrutura inválida"}`)
      .join("; ");
    throw new Error(`Registry inválido. ${details}`);
  }

  const registry = input as unknown as DatasetRegistry;
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

  const rawDataset = await response.json() as GraphDataset;
  if (entry.id === "politica") {
    await applyPoliticaContentV2(rawDataset, baseUrl, fetcher);
  }

  const overlayUrl = relationOverlayUrl(baseUrl, entry);
  if (overlayUrl) {
    const overlayLinks = await fetchJson<GraphDataset["links"]>(overlayUrl, `Overlay relacional ${entry.id}`, fetcher);
    rawDataset.links = [...rawDataset.links, ...overlayLinks];
  }

  const result = validateDataset(rawDataset);
  if (!result.valid || !result.dataset) {
    const details = result.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Dataset publicado inválido: ${entry.id}. ${details}`);
  }
  return result.dataset;
}

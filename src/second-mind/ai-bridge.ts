import type { GraphDataset } from "../core/types";
import type { GraphDeltaProposal, QueryAnswer, QueryEvidencePacket, SourceManifest } from "./types";

export interface BridgeHealth {
  ok: boolean;
  service: string;
  providerConfigured: boolean;
  capabilities: { compile: boolean; query: boolean; directGraphWrite: false };
}

export function normalizeBridgeUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Informe uma URL válida para a ponte."); }
  if (url.username || url.password || url.search || url.hash) throw new Error("Informe somente a URL base da ponte, sem credenciais, parâmetros ou fragmentos.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("A ponte remota precisa usar HTTPS; HTTP é permitido somente em localhost.");
  return url.toString().replace(/\/$/, "");
}

async function bridgeRequest<T>(endpoint: string, path: string, body?: unknown, accessToken?: string): Promise<T> {
  const base = normalizeBridgeUrl(endpoint);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error("A resposta da ponte excede o limite de 1 MiB.");
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error("A ponte retornou conteúdo que não é JSON válido."); }
    if (!response.ok) throw new Error((value as { error?: string })?.error || `A ponte respondeu HTTP ${response.status}.`);
    return value as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("A ponte excedeu o limite de 45 segundos.");
    throw error;
  } finally { window.clearTimeout(timeout); }
}

export function getBridgeHealth(endpoint: string, accessToken?: string): Promise<BridgeHealth> {
  return bridgeRequest<BridgeHealth>(endpoint, "/health", undefined, accessToken);
}

export function requestQueryAnswer(endpoint: string, packet: QueryEvidencePacket, accessToken?: string): Promise<QueryAnswer> {
  return bridgeRequest<QueryAnswer>(endpoint, "/v1/query", { packet }, accessToken);
}

export function requestGraphProposal(endpoint: string, input: { dataset: GraphDataset; manifest: SourceManifest; changedSourceIds: string[] }, accessToken?: string): Promise<GraphDeltaProposal> {
  return bridgeRequest<GraphDeltaProposal>(endpoint, "/v1/compile", input, accessToken);
}

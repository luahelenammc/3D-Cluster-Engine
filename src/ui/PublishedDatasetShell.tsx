import { useEffect, useRef, useState } from "react";
import { fetchDatasetRegistry, fetchRegisteredDataset, resolveRegistryEntry, type DatasetRegistry } from "../data/registry";
import ClusterEngine from "./ClusterEngine";

const REGISTRY_FILE_PREFIX = "registry-dataset-";

function syncDatasetQuery(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("dataset", id);
  else url.searchParams.delete("dataset");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function waitForImportInput(timeoutMs = 10_000): Promise<HTMLInputElement> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const input = document.querySelector<HTMLInputElement>('input.sr-only[type="file"]');
      if (input) return resolve(input);
      if (Date.now() - started >= timeoutMs) return reject(new Error("A porta de importação da engine não ficou disponível a tempo."));
      window.setTimeout(check, 50);
    };
    check();
  });
}

export default function PublishedDatasetShell() {
  const [registry, setRegistry] = useState<DatasetRegistry | null>(null);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const started = useRef(false);
  const importInput = useRef<HTMLInputElement | null>(null);

  async function getImportInput() {
    if (importInput.current?.isConnected) return importInput.current;
    const input = await waitForImportInput();
    input.addEventListener("change", () => {
      const filename = input.files?.[0]?.name || "";
      if (filename && !filename.startsWith(REGISTRY_FILE_PREFIX)) {
        setActiveId("__local__");
        syncDatasetQuery(null);
      }
    });
    importInput.current = input;
    return input;
  }

  async function openPublishedDataset(nextRegistry: DatasetRegistry, id: string, askBeforeDiscard = false) {
    const entry = nextRegistry.datasets.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Dataset não registrado: ${id}.`);
    if (askBeforeDiscard && !window.confirm("Trocar o projeto visualizado? Alterações locais ainda não exportadas poderão ser descartadas.")) return;

    setLoading(true);
    setError("");
    try {
      const dataset = await fetchRegisteredDataset(entry, import.meta.env.BASE_URL);
      const input = await getImportInput();
      if (typeof DataTransfer === "undefined") throw new Error("Este navegador não oferece a ponte de importação necessária para o registry.");
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(dataset)], `${REGISTRY_FILE_PREFIX}${entry.id}.json`, { type: "application/json" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      setActiveId(entry.id);
      syncDatasetQuery(entry.id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function boot() {
      try {
        const nextRegistry = await fetchDatasetRegistry(import.meta.env.BASE_URL);
        setRegistry(nextRegistry);
        const requestedId = new URLSearchParams(window.location.search).get("dataset");
        const entry = resolveRegistryEntry(nextRegistry, requestedId);
        await openPublishedDataset(nextRegistry, entry.id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Falha ao abrir a biblioteca de projetos.");
        setLoading(false);
      }
    }

    void boot();
  }, []);

  return <div className="published-dataset-shell">
    <ClusterEngine />
    {registry && <label className="published-dataset-switcher" htmlFor="published-dataset-select">
      <span>Projeto publicado</span>
      <select id="published-dataset-select" value={activeId} disabled={loading} onChange={(event) => { void openPublishedDataset(registry, event.target.value, true).catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao trocar dataset.")); }}>
        {!activeId && <option value="">Carregando…</option>}
        {activeId === "__local__" && <option value="__local__" disabled>Importado localmente</option>}
        {registry.datasets.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
      </select>
      <small>{loading ? "Abrindo constelação…" : registry.datasets.find((entry) => entry.id === activeId)?.description || "Dataset local não publicado."}</small>
    </label>}
    {error && <div className="published-dataset-error" role="status">{error}</div>}
  </div>;
}

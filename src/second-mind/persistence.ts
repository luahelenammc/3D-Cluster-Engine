import type { HistorySnapshot, SourceManifest } from "./types";
import type { VaultDirectoryHandle } from "./file-system";

const DATABASE = "lms3d-second-mind-v1";
const VAULT_STORE = "vaults";
const HISTORY_STORE = "history";
let databasePromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) db.createObjectStore(VAULT_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: "snapshotId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

async function readRecord<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDatabase();
  if (!db) {
    if (typeof localStorage === "undefined") return undefined;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : undefined;
  }
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result?.value as T | undefined);
    request.onerror = () => reject(request.error || new Error("Falha ao ler armazenamento local."));
  });
}

async function writeRecord(storeName: string, key: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    if (typeof localStorage === "undefined") throw new Error("Armazenamento local indisponível neste navegador.");
    const storageKey = storeName === HISTORY_STORE
      ? historyStorageKey(value as HistorySnapshot)
      : key;
    localStorage.setItem(storageKey, JSON.stringify(value));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(storeName === HISTORY_STORE ? value : { key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Falha ao gravar armazenamento local."));
  });
}

export async function saveVaultManifest(manifest: SourceManifest): Promise<void> {
  await writeRecord(VAULT_STORE, "current-vault", manifest);
}

export async function loadVaultManifest(): Promise<SourceManifest | undefined> {
  return readRecord<SourceManifest>(VAULT_STORE, "current-vault");
}

export async function saveVaultAccessHandle(handle: VaultDirectoryHandle | null): Promise<boolean> {
  const db = await openDatabase();
  if (!db) return false;
  const transaction = db.transaction(VAULT_STORE, "readwrite");
  transaction.objectStore(VAULT_STORE).put(handle ? { key: "vault-access-handle", value: handle } : { key: "vault-access-handle", value: null });
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
}

export async function loadVaultAccessHandle(): Promise<VaultDirectoryHandle | undefined> {
  const db = await openDatabase();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const request = db.transaction(VAULT_STORE, "readonly").objectStore(VAULT_STORE).get("vault-access-handle");
    request.onsuccess = () => resolve(request.result?.value as VaultDirectoryHandle | undefined);
    request.onerror = () => resolve(undefined);
  });
}

export async function saveHistorySnapshot(snapshot: HistorySnapshot, maxSnapshots = 50): Promise<void> {
  await writeRecord(HISTORY_STORE, snapshot.snapshotId, snapshot);
  const entries = await listHistorySnapshots(snapshot.datasetId);
  for (const old of entries.slice(maxSnapshots)) await deleteHistorySnapshot(old);
}

export function historyStorageKey(snapshot: Pick<HistorySnapshot, "datasetId" | "snapshotId">): string {
  return `lms3d.history.${encodeURIComponent(snapshot.datasetId)}.${encodeURIComponent(snapshot.snapshotId)}`;
}

export async function listHistorySnapshots(datasetId: string): Promise<HistorySnapshot[]> {
  const db = await openDatabase();
  if (!db) {
    if (typeof localStorage === "undefined") return [];
    const prefix = `lms3d.history.${encodeURIComponent(datasetId)}.`;
    const entries: HistorySnapshot[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) {
        const raw = localStorage.getItem(key);
        if (raw) entries.push(JSON.parse(raw) as HistorySnapshot);
      }
    }
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const all = await new Promise<HistorySnapshot[]>((resolve, reject) => {
    const request = db.transaction(HISTORY_STORE, "readonly").objectStore(HISTORY_STORE).getAll();
    request.onsuccess = () => resolve((request.result as HistorySnapshot[]).filter((item) => item.datasetId === datasetId));
    request.onerror = () => reject(request.error || new Error("Falha ao listar histórico local."));
  });
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function deleteHistorySnapshot(snapshot: HistorySnapshot): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    if (typeof localStorage !== "undefined") localStorage.removeItem(historyStorageKey(snapshot));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(HISTORY_STORE, "readwrite").objectStore(HISTORY_STORE).delete(snapshot.snapshotId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Falha ao limitar histórico local."));
  });
}

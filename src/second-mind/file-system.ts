import type { MarkdownFileInput } from "./markdown";
import { normalizeVaultPath } from "./markdown";
import type { WritebackAdapter } from "./writeback";

export type FileAccessPermission = "granted" | "denied" | "prompt";
export interface VaultFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  queryPermission(descriptor: { mode: "read" | "readwrite" }): Promise<FileAccessPermission>;
  requestPermission(descriptor: { mode: "read" | "readwrite" }): Promise<FileAccessPermission>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
}
export interface VaultDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  entries(): AsyncIterable<[string, VaultFileHandle | VaultDirectoryHandle]>;
  getDirectoryHandle(name: string): Promise<VaultDirectoryHandle>;
  getFileHandle(name: string): Promise<VaultFileHandle>;
  queryPermission(descriptor: { mode: "read" | "readwrite" }): Promise<FileAccessPermission>;
  requestPermission(descriptor: { mode: "read" | "readwrite" }): Promise<FileAccessPermission>;
}

export function directoryPickerAvailable(): boolean {
  return typeof window !== "undefined" && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export async function pickVaultDirectory(): Promise<VaultDirectoryHandle> {
  const picker = (window as Window & { showDirectoryPicker?: (options: { mode: "read" }) => Promise<VaultDirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error("Este navegador não oferece seleção direta de pasta. Use a importação de arquivos.");
  return picker({ mode: "read" });
}

export async function readMarkdownDirectory(root: VaultDirectoryHandle, handles: Map<string, VaultFileHandle>): Promise<MarkdownFileInput[]> {
  const files: MarkdownFileInput[] = [];
  async function visit(directory: VaultDirectoryHandle, parent = "") {
    for await (const [name, entry] of directory.entries()) {
      const path = parent ? `${parent}/${name}` : name;
      if (entry.kind === "directory") {
        await visit(entry as VaultDirectoryHandle, path);
      } else if (/\.md$/i.test(name)) {
        if (files.length >= 2000) throw new Error("O limite local é 2.000 arquivos Markdown por importação.");
        const fileHandle = entry as VaultFileHandle;
        const file = await fileHandle.getFile();
        handles.set(normalizeVaultPath(path), fileHandle);
        files.push({ name: file.name, size: file.size, lastModified: file.lastModified, webkitRelativePath: path, text: () => file.text() });
      }
    }
  }
  await visit(root);
  return files;
}

export async function getVaultFileHandle(root: VaultDirectoryHandle, pathInput: string): Promise<VaultFileHandle> {
  const path = normalizeVaultPath(pathInput);
  const parts = path.split("/");
  let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  return directory.getFileHandle(parts.at(-1)!);
}

export function createFileSystemWritebackAdapter(fileHandle: VaultFileHandle, onPermissionGranted?: () => void): WritebackAdapter {
  return {
    async requestWritePermission() {
      const granted = await fileHandle.requestPermission({ mode: "readwrite" }) === "granted";
      if (granted) onPermissionGranted?.();
      return granted;
    },
    async readCurrent() {
      return (await fileHandle.getFile()).text();
    },
    async write(content) {
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(content);
        await writable.close();
      } catch (error) {
        await writable.abort?.();
        throw error;
      }
    },
  };
}

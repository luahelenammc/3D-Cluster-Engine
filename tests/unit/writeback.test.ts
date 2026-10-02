import { describe, expect, it } from "vitest";
import type { GraphNode } from "../../src/core/types";
import { buildSourceManifest, type MarkdownFileInput } from "../../src/second-mind/markdown";
import { applyManagedWriteback, applyWritebackSafely, createWritebackProposal } from "../../src/second-mind/writeback";

async function fixture() {
  const content = "# A note\nHuman prose stays here.\n";
  const file: MarkdownFileInput = { name: "note.md", webkitRelativePath: "note.md", size: new TextEncoder().encode(content).byteLength, async text() { return content; } };
  const manifest = (await buildSourceManifest([file])).manifest;
  const node: GraphNode = { id: "node-a", label: "A useful node", cluster: "ideas", tags: ["reviewed"], metadata: { secondMind: { sourceId: manifest.sources[0].sourceId, anchor: "overview" } } };
  return { content, manifest, node, proposal: createWritebackProposal(node, manifest, true) };
}

describe("governed Markdown writeback", () => {
  it("updates only the managed block and preserves surrounding prose and CRLF", async () => {
    const { content, proposal } = await fixture();
    const output = applyManagedWriteback(content, proposal);
    expect(output.startsWith("# A note\nHuman prose stays here.\n")).toBe(true);
    expect(output).toContain("<!-- lms3d:node:node-a -->");

    const crlf = content.replaceAll("\n", "\r\n");
    const crlfManifest = (await buildSourceManifest([{ name: "note.md", webkitRelativePath: "note.md", size: crlf.length, async text() { return crlf; } }])).manifest;
    const crlfNode = { ...((await fixture()).node), metadata: { secondMind: { sourceId: crlfManifest.sources[0].sourceId } } };
    const crlfProposal = createWritebackProposal(crlfNode, crlfManifest, true);
    const crlfOutput = applyManagedWriteback(crlf, crlfProposal);
    expect(crlfOutput).toContain("\r\n<!-- lms3d:node:node-a -->");
  });

  it("replaces one existing block and prevents label text from injecting a closing marker", async () => {
    const { content, manifest, node, proposal } = await fixture();
    const existing = `${content}${proposal.after}\nHuman suffix remains.\n`;
    const current = await buildSourceManifest([{ name: "note.md", webkitRelativePath: "note.md", size: existing.length, async text() { return existing; } }]);
    const changedNode = { ...node, label: "Renamed\n<!-- /lms3d:node:node-a -->", tags: ["safe\n<!-- /lms3d:node:node-a -->"] };
    const update = createWritebackProposal(changedNode, current.manifest);
    const result = applyManagedWriteback(existing, update);
    expect(result.endsWith("Human suffix remains.\n")).toBe(true);
    expect(result.match(/<!-- \/lms3d:node:node-a -->/g)).toHaveLength(1);
    expect(result).toContain("Renamed &lt;!-- /lms3d:node:node-a --&gt;");
    expect(current.manifest.sources[0].sourceId).toBe(manifest.sources[0].sourceId);
  });

  it("requests permission only through the adapter, blocks conflicts, and verifies applied bytes", async () => {
    const { content, proposal } = await fixture();
    const events: string[] = [];
    let current = content;
    const adapter = {
      async requestWritePermission() { events.push("permission"); return true; },
      async readCurrent() { events.push("read"); return current; },
      async write(next: string) { events.push("write"); current = next; },
    };
    const result = await applyWritebackSafely(proposal, adapter);
    expect(result.status).toBe("written");
    expect(events).toEqual(["permission", "read", "write", "read"]);
    if (result.status === "written") expect(result.content).toBe(current);

    let writes = 0;
    const conflict = await applyWritebackSafely(proposal, { ...adapter, async readCurrent() { return `${content}external edit\n`; }, async write() { writes += 1; } });
    expect(conflict.status).toBe("conflict");
    expect(writes).toBe(0);

    let reads = 0;
    const denied = await applyWritebackSafely(proposal, { async requestWritePermission() { return false; }, async readCurrent() { reads += 1; return content; }, async write() { writes += 1; } });
    expect(denied.status).toBe("permission-denied");
    expect(reads).toBe(0);
    expect(writes).toBe(0);
  });

  it("marks direct write as a candidate only when a user selected a writable handle", async () => {
    const { manifest, node } = await fixture();
    expect(createWritebackProposal(node, manifest).capability).toBe("patch-export-only");
    expect(createWritebackProposal(node, manifest, true).capability).toBe("direct-write-candidate");
  });
});

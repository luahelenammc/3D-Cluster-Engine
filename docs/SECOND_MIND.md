# Second Mind — local sources, evidence and temporal graph

## Purpose and boundary

Second Mind adds a source-aware workflow around the existing `GraphDataset` 1.1 and `GraphStore`. It does not introduce a new canonical graph schema. A selected vault stays a local source collection; the graph remains a representation that can be rebuilt or reviewed against those sources.

| Layer | Authority and capability |
|---|---|
| Markdown source files | User-selected source authority; read-only on intake, with a bounded direct-write path after explicit permission where supported |
| `SourceManifest` | Local inventory, path IDs, fingerprints, extracted structure and diff |
| `GraphDeltaProposal` | Candidate changes with source evidence; inert until reviewed |
| `GraphStore` | Canonical graph state; accepted deltas become validated, undoable transactions |
| AI bridge | Optional proposal/query service; it cannot write a graph or vault |
| `WritebackProposal` | Before/after proposal for a managed source block; direct apply is permission-gated and fingerprint-checked, with patch export everywhere |

The canonical data contract remains 1.1. Sidecar schemas are under `schema/` and each carries its own version.

## Markdown intake

The user selects `.md` files or opens a folder with the File System Access API in read mode. Nothing is uploaded during intake and write permission is not requested. The folder handle is kept in IndexedDB when the browser supports structured cloning; a file-picker import without a handle remains read-only. The parser enforces these caps before storing the manifest:

- 2,000 files per import;
- 5 MiB per file;
- 25 MiB total content.

Supported extraction is intentionally small: a simple YAML frontmatter subset (key/scalar and list values), Markdown headings and anchors, tags, Obsidian wikilinks, and relative Markdown links to `.md` files. External links are skipped. The parser does not execute Markdown or YAML, resolve embeds, or interpret arbitrary plugins.

The manifest has a stable local vault ID across reimports; source IDs follow `source:<normalized-path>`. SHA-256 fingerprints use Web Crypto; if Web Crypto is unavailable, the code falls back to deterministic FNV-64, which is a stable change key rather than a cryptographic guarantee. Unique same-content moves can be reported as renames; duplicate-content matches are marked ambiguous. Absolute paths and traversal are rejected.

Source content and history are kept in IndexedDB, with localStorage fallback. These browser stores are not encrypted; use the app only with material appropriate for the current device and browser profile. Clearing site data removes this local continuity.

## Two graph workflows

### Source map

The source map creates a separate `GraphDataset` whose nodes are files and whose links are resolved internal Markdown links. It is a document map, not a semantic ontology. Loading it replaces the open graph in one undoable `GraphStore` transaction.

### Semantic candidates

The deterministic compiler turns headings up to depth three into provisional nodes. It may add provisional folder clusters and only creates a reference link when a Markdown link or wikilink resolves to a specific source and heading anchor. Every operation carries path, fingerprint, anchor, quote, epistemic status, rationale and confidence. Headings and folder names remain candidates; this compiler does not infer meaning from prose.

`GraphDeltaProposal` 1.0 can also represent updates, retirement and deletion. Before display or acceptance, the local validator checks the dataset binding, IDs, references, confidence, current source fingerprint/path, quote presence and anchor. Accepted operations pass the canonical dataset validator and enter GraphStore's undo stack. Rejected candidates stay out of the canonical graph.

## Evidence-first queries and optional AI

The local query builder ranks graph labels/metadata and selected graph neighbors, then adds matching source excerpts. It caps results at eight nodes and eight sources. The evidence packet states that excerpts are untrusted data, the vault was not sent, and absence from a bounded packet is not absence from the full corpus. Imported answers are checked against the packet's node IDs and source paths.

No remote call is made by default. A user may export the packet and consult a provider separately, or explicitly configure the optional Node bridge and authorize each query/compile action after reviewing the exact displayed payload. AI compilation is limited to up to eight changed notes, at most 3,000 Unicode characters each and 24,000 UTF-8 bytes total, plus a graph slice of up to 50 nodes and 100 links. Query sends the bounded evidence packet only. A provider response returns as a proposal or structured answer and is validated again in the browser.

The bridge keeps the provider key in its server environment. It binds to `127.0.0.1:8088` by default. If `BRIDGE_HOST` is set to a non-loopback interface, `BRIDGE_CLIENT_TOKEN` is required. Configure `BRIDGE_ALLOWED_ORIGINS` narrowly. Remote deployment requires HTTPS and a trusted private access path; CORS is not authentication. Do not expose an unauthenticated provider bridge to the public internet.

Local mock mode supports contract tests without a provider:

```bash
cp companion/.env.example companion/.env
# Set AI_BRIDGE_MODE=mock in companion/.env for a no-provider smoke test
node --env-file=companion/.env companion/server.mjs
```

The example environment contains placeholders, not a real secret. Keep real API keys out of the browser, repository, screenshots and logs.

## Two-dimensional projection

The 2D/3D control changes only the renderer projection. In 2D, the renderer receives cloned runtime nodes with rendered `z = 0`; semantic Z remains available to the tooltip and inspector. The canonical node positions and axis configuration are unchanged. Baking layout is disabled while in 2D to prevent accidental loss of Z. The selected view preference is stored locally.

## Temporal graph history

Snapshots are local and capped at 50 per dataset. They retain a copy of canonical `GraphDataset` 1.1 and a semantic state hash. Runtime node positions are excluded from semantic hashing and node diffs; axis mapping is included because it declares spatial meaning. The History tab previews node/link/cluster additions, removals and changes plus dataset metadata, axes and extensions before restoring. A restore first records the current graph, then commits the selected snapshot through the undoable store.

History is checkpoint-based, not a continuous event log. Checkpoints are created after accepted proposal operations, source-map creation, restore, or an explicit user action.

## Governed writeback

Writeback creates a proposal for one Markdown-derived node and an explicit `lms3d:node:<id>` managed block. The review shows the target, before/after and diff. In browsers with a selected directory handle, the user can choose **Aplicar à fonte**; only that user action calls `requestPermission({mode: "readwrite"})` on the target file handle. The engine reads the current file, compares its fingerprint with the proposal, writes the updated content only when they match, then re-reads and verifies the resulting text. An external change blocks the write and requires a fresh proposal. After success, the manifest is re-ingested and a semantic history checkpoint stores its new source fingerprint.

The managed block is the only changed region; human prose around it is preserved. Browsers without a writable handle keep the JSON patch export. Export packages always state that no direct write was performed.

## Interaction and labels

A single click or tap selects a node and illuminates its neighborhood without opening details. Desktop double click and the compact **Detalhes** action deliberately open the inspector; on mobile it appears as a bottom sheet. Closing details preserves selection. Dragged nodes outrank inspected, selected, and hovered nodes. A deterministic label budget favors that active context and adapts to camera distance; the one control offers **Essenciais**, **Contexto**, and **Mais**. The active node name is retained in every mode, while 2D uses a larger map-like label budget.

## Verification

```bash
npm run lint
npm test
```

`npm test` runs Vitest regressions, companion bridge HTTP tests and a production TypeScript/Vite build. Unit coverage includes source limits/path traversal, frontmatter/headings/link resolution, rename ambiguity, evidence binding, proposal apply/undo, answer citation bounds, semantic history, 2D projection, interaction-state transitions, managed-block writeback, permission denial, fingerprint conflict, and reread verification.

## Known limits

- No production AI provider, provider secret, hosted bridge or authentication service is configured by this repository.
- YAML, Markdown and Obsidian parsing covers the documented subset only.
- Rename detection is fingerprint-based and conservative; ambiguity is surfaced rather than guessed.
- The local compiler only creates source-derived candidates from headings and explicit anchored links.
- Browser storage is local to the profile and not encrypted or shared across devices.
- The bridge's default loopback deployment is the supported low-setup path; a remotely reachable bridge needs TLS and trusted network/authentication controls.
- Physical mobile WebGL testing is environment-dependent; record it separately from responsive and touch-event verification.

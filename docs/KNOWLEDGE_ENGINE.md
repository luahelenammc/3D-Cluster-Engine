# Knowledge Engine 0.3 · Second Mind e Obsidian/Graphify interoperability

**Owner:** Lua Helena Moon Martins Cardoso  
**Integration:** source-aware local-first analytical layer on `GraphDataset 1.1` and `GraphStore`  
**Status:** implemented under `feature/knowledge-engine-integration`, pending final review and publication

## Why this is different from a folder graph

The declared ontology belongs to the project, not to the filesystem, the LLM or a community detection algorithm. Existing `Second Mind` Markdown parsing, wikilinks, source manifests, fingerprinted deltas, consent gates and human-reviewed graph proposals remain operational.

New `src/knowledge-engine/` modules implement:

| Module | Role | Contract |
|---|---|---|
| `types.ts` | assertion, source evidence, review and extraction interfaces | `schema/knowledge-ledger.schema.json` |
| `ledger.ts` | quote/fingerprint/anchor evidence auditing, proposal/graph assertions and local decisions | no assertion promoted automatically |
| `chunks.ts` | Markdown heading-aware chunks and incremental changed/removed planning | hash index can be stored without source text |
| `extraction.ts` | bounded, consented existing AI companion adapter | no implicit provider call; partial/truncated results never accepted by default |
| `reconcile.ts` | alias suggestions and conservative contradiction candidates | **review-only**, no automated merges |
| `retrieval.ts` | query packet v2 using local lexical/trigram + topological scores | no embeddings or cloud index silently assumed |
| `paths.ts` | direction-aware, bounded path traversal and citation coverage | no invented path, distinguishes structure from evidence |
| `topology.ts` | detected communities, undirected graph bridges and component analysis | algorithmic communities are projections, not ontology |
| `aggregation.ts` | ephemeral cluster-level level of detail (LOD) | reversible, no canonical nodes or links rewritten |
| `interoperability.ts` | GraphML, Obsidian notes/Canvas export and untrusted Graphify JSON preview | no automatic canonical import from unverifiable sources |
| `zip.ts` | browser-local deterministic stored ZIP output | no third-party CDN or upload |

## UI

Second Mind now has a **Knowledge Engine** tab. Features include:

1. semantic/evidence/inferred/contested/path layer controls, linked to both 2D and 3D renderer;
2. audited accepted/proposed relation status, quote and source references, alias/contradiction suggestions;
3. pathfinder with explicit citation-coverage report and no-path abstention;
4. bounded locally assembled query packet 2.0 and export;
5. chunk index and incremental-source impact analysis;
6. AI companion extraction only after a specific payload-visibility and consent action, returning ordinary `GraphDeltaProposal` for the preexisting human approval flow;
7. Obsidian notes + Canvas ZIP and GraphML downloads, Graphify JSON read-only preview;
8. separate reversible cluster LOD with drilldown by selecting a supernode; no 3D layout rewrite.

The node inspector also shows **why a relation exists**, using source references persisted on accepted links. No source quote is invented for pre-existing links that lacked provenance.

## Security and sovereignty

- Vault files remain local during import, deterministic parsing, graph traversal and export.
- No Graphify code was copied and Graphify is not a runtime dependency.
- No source content is uploaded to GitHub Actions. QA uses synthetic fixtures only.
- Companion can be configured locally, or may point to a user-selected authorized provider; **it never transmits automatically**. The companion's current 1 MiB request / 24 KiB source subset limits and 45s client timeout remain in force.
- Source content and AI outputs are untrusted data; source text cannot provide operational instructions.
- An AI suggestion needs a valid source, quote, fingerprint, reference binding and human review before changing `GraphStore`.
- The knowledge-ledger sidecar is stored in existing browser IndexedDB (localStorage fallback); local browser stores are **not encrypted**.
- Export is an explicit local action; files may contain private node labels and evidence, so publishing exported ZIPs requires separate sanitization.
- Obsidian export intentionally does **not** include verbatim Markdown vault documents, only canonical graph nodes, derived relations and citations.
- Graphify input is a non-authoritative preview; source binding and mapping require further human work before integration.
- No writeback to a source is enabled by the Knowledge Engine; the existing permission/fingerprint gate still governs writes.

## QA and observed limitations

Tests include citation mismatch, stale fingerprints, path direction, false no-path, source/graph identity, typed schema, synthetic Obsidian ZIP and GraphML, reversible LOD, evidence-preserving accept and explicit provider consent. Browser QA runs separately on desktop and mobile.

Known/intentional limits:

- Community discovery uses deterministic bounded label propagation, not Leiden; bridges operate on an undirected diagnostic projection.
- Retrieval v2 combines lexical/trigram and structure; **it does not compute embeddings**. A separately consented local embeddings provider is a later optional optimization, not a hidden feature.
- Local companion extraction covers up to four chunks in the UI per explicit call and is limited by model responsiveness; it cannot guarantee an accurate semantic ontology with a weak 0.5B model.
- Obsidian output is a fresh export; **non-destructive two-way merge of edited vaults has not been ratified**. Existing vault import supports Markdown notes but exported canvas positions are not silently written back.
- Graphify import is preview-only unless and until external claims can be bound to verifiable sources.
- The browser UI alone does not demonstrate semantic accuracy on the user's private autobiographical corpus. Never infer quality from synthetic fixtures.
- Large graphs require hardware-specific FPS/latency QA; LOD is a mitigation, not a benchmark guarantee.
- The project's code redistribution/commercial license is still awaiting the owner decision in `LICENSE_PENDING.md`.

## Architecture invariants

```text
SourceManifest (source authority)
  -> chunks / optional explicit companion extraction
  -> candidate knowledge assertions & audit
  -> GraphDeltaProposal (reviewed)
  -> GraphStore (GraphDataset 1.1 canonical)
  -> RuntimeGraph clone -> semantic 2D / spatial 3D / reversible LOD
                        -> local query/paths/communities
                        -> Obsidian / GraphML export
```

`GraphDataset 1.1` stays sovereign. `metadata.secondMind.evidence` stores accepted link provenance, with `confidence` and `epistemicStatus`; no new mandatory fields were added to existing published datasets.

## Intellectual and licensing provenance

The design learns from **Graphify-Labs/graphify** extraction/export and query concepts, plus the Obsidian + Claude pattern of context-limited vault browsing and explicit writes. This is an independent implementation on the existing LMS 3D codebase. No Graphify source, private test corpus or protected assets are transplanted. Future direct reuse requires a fresh license audit, notice and version pin.

**Approval gate:** preserve CI, review semantic QA on an explicitly authorized local corpus and decide code licensing before commercial distribution.

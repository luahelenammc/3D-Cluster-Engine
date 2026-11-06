# RFC-001 — Knowledge Engine: Graphify lessons × Obsidian + Claude × LMS 3D Cluster Engine

**Status:** proposed, no implementation authorized by this RFC  
**Date:** 2026-11-06  
**Target:** `luahelenammc/3D-Cluster-Engine` (`main` v0.2.1, canonical dataset 1.1)  
**Authorship / architecture:** Lua Helena Moon Martins Cardoso and AI-assisted analysis; actual code contributions remain attributable through Git history  
**Safety:** no private corpus, no model credentials and no user data may be committed to this repository

## 0. Decision in one paragraph

Keep the LMS 3D Cluster Engine as the spatial, investigative interface and the canonical `GraphDataset 1.1` as the graph authority. Evolve `Second Mind` into a **source-aware, evidence-first, incrementally maintainable Knowledge Engine** that can extract semantic relationships, resolve entities, construct multi-hop answers, audit changes and export to other ecosystems. This is **not** a Graphify clone, a forced Graphify dependency, an Obsidian skin or a new canonical schema. The intended novelty is the combination of *content-first semantic ontology, typed and sourced relations, sovereign write gates and intelligible 3D interaction*.

## 1. Grounded inventory: do not rebuild existing capabilities

Already implemented on `main`:
- Three-axis configurable 3D layout and force renderer; 2D mode, Neighborhood Illumination, contextual labeling, inspector, search and filters.
- Strict `GraphDataset 1.1`, `GraphStore` authority outside renderer, explicit adapters, IDs, undo/redo, migration and public registry.
- `Second Mind`: local Markdown manifests, headings, anchors, tags, wikilinks, relative links, fingerprints, diffs, conservative rename handling, deterministic *provisional* semantic candidates, evidence-bearing `GraphDeltaProposal`, explicit review and permission-gated managed-block writeback.
- Bounded lexical `QueryEvidencePacket`, answer validation, optional AI companion bound to loopback, temporal snapshots and source-map view.
- Public dataset publishing protocol, *Relation Metabolism Protocol* and *Content-First Ingestion Protocol*, already conceived in the Local Moon Source conceptual authority.

**Actual gaps to address**, not invented deficiencies:
- No robust semantic *prose* entity/relation extraction in the browser's deterministic compiler; it indexes headings and explicit links by default.
- Search packet ranks lexically and caps 8 nodes/8 sources; no persisted hybrid lexical+semantic index or n-hop path planning.
- No explicit reconciliation service for aliases, same-entity mentions and incompatible assertions across multiple files.
- No dedicated graph-evidence audit ledger with source-version provenance and contradiction lifecycle.
- Obsidian export of semantic graph/Canvas is not part of the published import/export set.
- Scale beyond the declared mobile/desktop/stress envelope needs aggregate/LOD interfaces and tests.

## 2. External learning, not copying

**Graphify, official repository** `Graphify-Labs/graphify`: AST extraction, semantic LLM pass for documents, graph JSON/HTML export, Obsidian vault/Canvas export, community analysis, graph traversal/query surfaces and provenance/confidence flags. Its official v0.9.102 code and the verified synthetic pilot demonstrate capabilities, **not semantic accuracy on the private autobiographical corpus**. That local Graphify experiment did not yield an acceptable private semantic graph on the available 0.5B model, so no quality claim transfers here.

**Obsidian + Claude workflow pattern**: vault-local notes/backlinks, selection-context expansion, embeddings/wikilinks resolution, bounded neighbor retrieval, note-to-agent queries and permission-gated edits. This is an interaction pattern, not one fixed product or native Claude capability. The distinguishing experience is *a researcher following evidence and links while an assistant helps reason about the subgraph*.

**Ethical absorption rules:** reimplement concepts through original designs and tests; do not copy upstream source, UI assets or datasets without license assessment. If actual third-party code is incorporated, pin a reviewed version, audit license/transitives/security, carry NOTICE/attribution and track changes. Citation of an idea is not a code license. Keep the engine's `LICENSE_PENDING.md` gate unresolved until owner decision. Never send private vaults to a hosted service or GitHub Actions without express project-specific authorization.

## 3. Target architecture: add depth, not a second renderer

```text
Source vaults / Markdown / explicit user adapters
        |
        v
SourceManifest + fingerprints + authority + visibility gates    [existing + additions]
        |
        +-- deterministic parse (headings, links, anchors)       [existing]
        +-- optional semantic extractor provider interface       [new]
        |      local-first / user-authorized remote only
        v
Candidate assertion ledger (entities, relations, source spans)   [new]
        |
        +-- normalization + alias/entity resolution              [new]
        +-- semantic/epistemic validation + reviewer decisions   [new]
        +-- contradiction, staleness and source authority gates  [new]
        v
GraphDeltaProposal -> explicit review -> GraphStore             [existing, extended]
        |                             |
        |                             +--> GraphDataset 1.1      [unchanged]
        |
        +-- hybrid retrieval + paths + grounded answer packets  [new]
        +-- communities / bridges / topology health              [new]
        +-- Obsidian + GraphML interoperable export               [new]
                                      |
                                      v
             RuntimeGraph clones -> 2D / 3D renderer             [unchanged]
```

The **semantic plane** (entities, processes, concepts and real relations) remains primary. The **documentary evidence plane** (files, sections, spans, claims and versions) is inspectable as overlays and provenance; it must not flood or dictate the main spatial graph.

## 4. Structural increments and contracts

### K-01. `KnowledgeAssertion` provenance ledger (P0)

Define sidecar schemas, **not a competing canonical dataset**:
- `assertionId`, `subjectId`, `predicate`, `objectId`, `relationFamily`, `directed`.
- `evidence[]`: `sourceId`, `sourceFingerprint`, `anchor`, optional `lineStart/lineEnd`, exact `quote`, `sourceAsOf`, `authorityTier`.
- `epistemicStatus`: `declared | derived | inferred | contested | superseded`; separately `reviewStatus`: `proposed | accepted | rejected | needs_review`.
- `confidence` is a calibrated model/heuristic score, not truth or canonical authority.
- `extractor`: id, version, model identifier (if AI), run timestamp, privacy mode, chunk ID, prompt/schema version.
- `relations` retain source-verb specificity in `metadata.relation`; `type` remains a stable family. No relation is accepted solely on vector similarity.

Compatibility: source references in `node.metadata`, `link.metadata` and `extensions.secondMind` may point to sidecar assertion IDs. Roundtrips through canonical 1.1 must preserve them. Do not mutate existing properties of published datasets.

### K-02. Chunking & semantic extraction adapters (P1)

Support `SemanticExtractor` interface: `extract(chunks, context, policy) -> CandidateAssertions`. Providers: `deterministic` (safe baseline), `local-ollama` through companion, and `authorized-remote` behind explicit disclosure/approval. Model output is **untrusted proposals**; validate JSON, source spans, IDs and quote containment. Chunk by heading/semantic boundaries with overlap and content hashes; isolate extracted content from instructions embedded inside vault files. Batch, retry, timeout, token ceilings, partial-run checkpoint and `truncated` detection are mandatory. `Graphify` can become an optional **import adapter** (graph JSON with translated relations/provenance), never a hard runtime dependency.

### K-03. Entity identity, aliases & contradiction reconciliation (P1)

Build `EntityResolver`: normalize aliases deterministically first, propose uncertain merges for manual review, protect distinct same-name entities and stable IDs. Merge references without losing evidence. Opposing statements may coexist as separate assertions with timestamps/authority and a `contradicts` link; never silently overwrite the more recent authoritative source or resolve disagreement by majority. Source authority is project-local and should follow the relevant source's sovereignty.

### K-04. Incremental dependency graph and recomputation (P1)

Reuse `SourceManifest` fingerprints and diffs. Track `source -> chunks -> assertions -> entity IDs -> graph operations -> analysis/index`. Reprocess only changed chunks and their dependents. Reconcile renamed files conservatively; do not delete accepted relations just because an extractor temporarily fails or returns empty. Changes to canonical nodes/edges require separate accepted `GraphDeltaProposal`; old assertions can become `stale` pending review. Make rebuild idempotent.

### K-05. Graph retrieval, pathfinder and grounded answers (P1)

Extend existing `query.ts` with a pluggable `GraphRetriever`: lexical FTS / trigram index first, optional local embeddings for reranking, graph-neighborhood expansion with fanout and depth limits, shortest/trust-aware directed paths, bridge questions ('what connects A and B?') and negative evidence constraints. Emit `QueryEvidencePacket 2` **as new version alongside 1.0**, with traversal steps, node and assertion IDs, source spans, exclusions and explicit citation coverage. Answer generation should distinguish 'explicitly asserted', 'derived from sources' and 'inferred', with no-source/no-path abstention.

### K-06. Community and bridge intelligence (P2)

Detect topological communities as analysis projections, not ontological authority. Show high-betweenness bridges, bridge redundancy, weakly connected components, orphaned clusters, functional-link ratios and duplicate generic verbs. Warn about *graph-catalog failure* per existing Relation Metabolism Protocol. Let users compare **declared clusters** and **detected communities**, never replace one automatically with the other. Name communities by evidence-grounded summaries with opt-in local AI; model-created labels are proposals.

### K-07. Interactive evidence & epistemic layers (P2)

Overlay visualization modes on current `GraphCanvas` and `SecondMindPanel`: semantic map / evidence provenance / contested claims / time delta / query path. In the inspector, 'Why does this edge exist?' shows precise verb, supporting quotes, source, fingerprint, source authority and reviewer status; a one-click citation opens the selected local note/section where permissions allow. Use subtle strokes for inferred/contested/stale, not colors as sole indicator. Keep accessible textual equivalent, keyboard navigation and 2D parity. Avoid rendering every source as a graph node.

### K-08. Obsidian roundtrip and interoperable export (P2)

Export stable-ID semantic node notes with YAML metadata, relationship wikilinks and a `.canvas` graph layout, plus GraphML and portable `graph.json`. Build a mapping manifest from canonical IDs to safe filenames; collision/Unicode/Windows-path rules; preserve manual notes and never overwrite user content by default. Imports resolve Obsidian links/embeds with bounded context and maintain provenance; file deletion/rename is diffed, not silently rewritten. One-way export first; roundtrip with merge previews later.

### K-09. Knowledge review UX and evaluation harness (P0/P1)

A review queue sorted by *impact × uncertainty × freshness*: accept/reject/modify individual assertions, with source excerpts and counterevidence; undoable transactions. Define a synthetic gold corpus for link precision/recall, correct direction, entity merge, semantic verbs, citations, contradictions, staleness and privacy leakage. A corpus of 12 verified relations from the private Graphify pilot **may inform internal testing but must never be committed or published**. Synthetic CI alone may be public.

### K-10. Security / data-handling hard gates (all phases)

Local-only by default. Treat vault content as **data**, never tool instructions. No silent outbound calls, telemetry or cloud embeddings. Consent per provider and payload scope; prevent prompt injection; strip secret-bearing metadata and local absolute paths from exports; respect `DO_NOT_PATCH` or closed-legacy flags where a source project defines them. Browser storage is not encrypted, as existing docs note; provide clear privacy labeling. A source read grant is not a write grant. No automatic writeback from extracted graph to a user vault.

## 5. Integration map (code review targets)

| Seam on `main` | Increment |
|---|---|
| `src/second-mind/markdown.ts` | chunk spans, source refs and incremental boundaries |
| `src/second-mind/types.ts`, `schema/source-manifest.schema.json` | versioned assertion/evidence sidecars, keep 1.0 compatible |
| `src/second-mind/proposals.ts`, `schema/graph-delta-proposal.schema.json` | source-aware acceptance and reconciliation |
| `src/second-mind/query.ts`, `schema/query-packet.schema.json` | path-aware, hybrid `QueryEvidencePacket 2` |
| `src/second-mind/ai-bridge.ts`, `companion/server.mjs` | opt-in local extraction provider, timeouts, partial-result guards |
| `src/second-mind/history.ts` | accepted assertion lineage / temporal diff |
| `src/second-mind/writeback.ts` | preserve existing permission and fingerprint gates |
| `src/core/spatial.ts` | optional topology metrics; axis meanings remain dataset-defined |
| `src/renderer/GraphCanvas.tsx` | overlay projection only, no raw dataset mutation |
| `src/ui/SecondMindPanel.tsx` | review queue, sources and path explanations |
| `src/data/adapters.ts` | optional Graphify/Obsidian import; no schema guessing in store |
| `tests/unit`, `docs/` | synthetic gold corpus and acceptance proofs |

## 6. Prioritized execution phases and exit criteria

**Phase 0 — Assert evidence (P0, non-visual):** introduce sidecar `KnowledgeAssertion`, source span verification, provenance validator, synthetic cases for false quotes, reversed direction, ambiguous aliases, conflict and stale fingerprints. Must not change canonical 1.1 or user-visible layouts. Exit: all tests + build pass, no trusted assertion without auditable citation; no private docs in CI.

**Phase 1 — Extract & reconcile (P1):** provider interface, local-first semantic extraction, chunk cache, explicit review queue, aliases/contradictions and idempotent incremental refresh. Exit: accepted proposals are undoable, no empty/truncated AI output is promoted, and a changed source does not erase previously accepted assertions without a review decision.

**Phase 2 — Investigate (P1/P2):** path queries and evidence-grounded answer packets, typed relation analysis, detected vs declared communities, source overlay. Exit: each returned path has directed edge sequence + evidence, a deliberately disconnected query abstains, accessible 2D/text view presents the same result.

**Phase 3 — Interoperate (P2):** Obsidian .canvas + notes export, GraphML, Graphify optional adapter, filename collision and roundtrip safety. Exit: canonical -> export -> parse -> canonical identity/evidence survives or discrepancies are explicitly reported; existing vault files remain untouched without approval.

**Phase 4 — Scale & commercial readiness (P3):** graph aggregation/LOD, performance budgets, anonymized datasets, licensing and third-party notices. Exit: mobile/desktop envelopes benchmarked and externally sourced code licenses reviewed before redistribution.

## 7. Suggested metrics (gates, not empty vanity targets)

- `evidence_coverage`: accepted links with >=1 current verifiable source / all accepted links.
- `citation_precision`: cited spans that actually support the displayed predicate.
- `direction_accuracy`: edge orientation vs gold relationships.
- `functional_link_share`: semantically functional edges vs mere contains/associated-with; report composition, not a fixed universal quota.
- `entity_resolution_precision`: approved merges that truly refer to the same entity.
- `stale_assertions`: accepted statements depending on missing/changed source hashes.
- `contradiction_detection_recall`: known conflicts surfaced for review.
- `query_path_validity`: every returned path valid in a single graph snapshot.
- `change_amplification`: unchanged chunks unnecessarily re-extracted.
- `privacy_egress_events`: **zero** without explicit authorization.
- `render_fps / input_latency`: compare 2D and 3D on representative hardware, within documented envelopes.

## 8. Anti-goals

No new renderer. No package named `graphify` as a default runtime. No implicit cloud model. No assumption that embeddings mean factual relations. No conversion of every source file, folder or heading into semantic nodes. No magical auto-merge of persons/institutions/versions. No replacing owner-authored ontology with algorithmic communities. No publication of private corpora, and no inference that attractive visualizations certify truth. No 'Graphify passed' claim from a synthetic AST smoke test.

## 9. Provenance and references

Internal project authority: Local Moon Source `11. 3D Cluster Engine e Spatial Knowledge Graphs` (conceptual source, separate from executable GitHub state); repo `README.md`, `DECISIONS.md`, `docs/SECOND_MIND.md`, `docs/DATA_CONTRACT.md`, `docs/DATASET_PUBLISHING_PROTOCOL.md`, `src/second-mind/*`, `schema/*` at `main` review 2026-11-06.

External inspiration (ideas only): Graphify-Labs/graphify official repository, v0.9.102 pilot evidence; Obsidian ecosystem patterns such as Graph Context for Claude Code, Semantic Notes Vault MCP and link/backlink traversal integrations. Implementation requires original designs or a separate recorded license review.

**Decision gate:** approve RFC architecture before code implementation; phase each module in reviewed PRs and protect published `main`.

# Data Compatibility Matrix

| Input dialect | Read | Canonical output | Fidelity | Notes |
|---|---|---|---|---|
| Canonical JSON 1.1 | Yes | 1.1 | Full | Strict. Missing clusters, link IDs or unknown structural fields are errors. |
| Canonical JSON 1.0 | Yes | 1.1 | High | Clusters may be inferred, link IDs generated and `layout.axis` migrated. Migration report is returned. |
| Split JSON | Yes | 1.1 | Full with sidecars | Requires `nodes.json` + `links.json`; accepts `clusters.json`, `meta.json`, `layout.json`, `visual.json`, `extensions.json`. Defaults/inference apply when sidecars are absent. |
| CSV bundle | Yes | 1.1 | Mapped | Requires `nodes.csv` + `links.csv`; optional `clusters.csv` and JSON sidecars. Supports typed and nested `meta.*`, tags and baked positions. |
| Marble topics/dependencies | Yes | 1.1 | Mapped | Preserves prerequisite direction, levels and known metadata. Source-specific fields without mapping cannot be reconstructed. |
| Canonical JSON >1.1 | No | — | — | Fails explicitly until a migration exists. |
| Arbitrary graph JSON | No | — | — | Requires a named adapter; shape guessing is deliberately rejected. |

## Second Mind sidecars

These are independent versioned contracts. They do not change the canonical dataset schema or its `1.1` version.

| Surface | Read/write | Contract | Guarantees and limits |
|---|---|---|---|
| User-selected Markdown files/folders | Read locally | `SourceManifest` 1.0 | Stable local vault ID, path-derived source IDs, SHA-256 where Web Crypto is available, headings, lightweight frontmatter, tags, internal links and bounded source diffs. Rename is inferred only when content fingerprints are unique; duplicates stay ambiguous. |
| Graph delta | Import/review/apply | `GraphDeltaProposal` 1.0 | Operations require a current source fingerprint, path, anchor when supplied, and quote found in that source. Import itself never mutates the graph. |
| Query packet/answer | Export/import or optional bridge | `QueryEvidencePacket` / `QueryAnswer` 1.0 | Capped local excerpts and node/source references; imported and provider answers may cite only packet members. |
| Semantic graph history | Local save/restore | `HistorySnapshot` 1.0 | Local browser storage, bounded to 50 snapshots per dataset; runtime positions are excluded from semantic diffs, semantic axis mapping is included. |
| Markdown writeback | Export only | `WritebackProposal` 1.0 | Human-applied patch package. Direct vault writes are not supported. |

The Markdown adapter is a lightweight parser rather than a full YAML/Obsidian interpreter. It reads only files explicitly selected in the browser and accepts `.md` files within the declared size limits.

## CSV columns

### `nodes.csv`

Recognized structural columns:

`id`, `label`, `cluster`, `value`, `level`, `color`, `visible`, `pinned`, `tags`, `position.x`, `position.y`, `position.z`.

Any `meta.*` column becomes nested metadata. Example: `meta.flags.reviewed`.

### `links.csv`

Recognized structural columns:

`id`, `source`, `target`, `type`, `weight`, `directed`, `visible`, `color`.

Missing IDs are generated during dialect normalization. Any `meta.*` column becomes nested metadata.

### `clusters.csv`

Recognized structural columns:

`id`, `label`, `color`, `description`, `visible`, plus `meta.*`.

## Type conversion

CSV values are converted when unambiguous:

- `true` / `false` → boolean;
- numeric literals → number;
- `null` → null;
- JSON object or array literals → parsed JSON;
- other values → string.

Tags accept a JSON array or `|` / `;` delimiters.

## Compatibility discipline

An adapter is a declared translation, not a license to guess. Every new dialect requires fixtures, migration behavior, failure cases and roundtrip tests before being called supported.

# LMS 3D Cluster Engine — Data Contract 1.1

## Status

- **canonical schema:** `schema/graph-dataset.schema.json`
- **schema version:** `1.1`
- **runtime authority:** `GraphStore`
- **migration entrypoint:** `normalizeDataset()`
- **public import entrypoint:** `importFiles()`

## Pipeline

```text
external dialect
  → adapter
  → permissive v1.0-shaped draft
  → normalization + migration report
  → strict canonical GraphDataset 1.1
  → GraphStore
  → cloned RuntimeGraph
  → renderer
```

An input being readable does not make it canonical. Only a dataset that passes the public JSON Schema and semantic validation may enter `GraphStore`.

## Canonical root

A canonical dataset requires:

- `schemaVersion: "1.1"`;
- `meta`;
- `clusters` — always present, even when empty;
- `nodes`;
- `links` — every link has a stable `id`.

Optional roots are `layout`, `visual` and `extensions`. Unknown top-level fields are rejected. Project-specific payload belongs in namespaced `extensions` or entity `metadata`, not beside the canonical roots.

## Identity laws

- Cluster IDs are unique and stable.
- Node IDs are unique and stable.
- Link IDs are unique and stable.
- Array order is presentation order, not identity.
- Adapters may generate missing link IDs while migrating legacy or foreign formats, but canonical 1.1 files are never silently repaired.
- Generated legacy IDs are deterministic from relation content; exact duplicate relations receive stable suffixes within their source ordering.

## Referential laws

- Every node references an existing cluster.
- Every link references two existing node IDs.
- Self-links are accepted with a warning.
- Parallel links are accepted with a warning when origin, target and type repeat.
- Isolated nodes are accepted with a warning because isolation may be meaningful.

## Entity surfaces

### Cluster

Required: `id`, `label`.

Optional: `color`, `description`, `visible`, `metadata`.

### Node

Required: `id`, `label`, `cluster`.

Optional: `value`, `level`, `color`, `visible`, `pinned`, `position`, `tags`, `metadata`.

`position` is a canonical baked coordinate only when explicitly persisted. Simulation coordinates and velocities never belong in the source dataset.

### Link

Required: `id`, `source`, `target`.

Optional: `type`, `weight`, `directed`, `visible`, `color`, `metadata`.

`weight` is non-negative. Its domain meaning belongs to the dataset documentation; the engine only uses it as a numeric relation strength.

## Three-axis contract

`layout.axes` defines X, Y and Z independently. Each axis declares:

- whether it is enabled;
- its source;
- its human-readable label;
- optional field path, range, inversion, strength, span and missing-value policy.

Supported sources: `field`, `cluster`, `degree`, `inDegree`, `outDegree`, `graphDepth`, `stableIndex`.

The engine calculates semantic targets from the complete canonical dataset. Filters do not silently redefine coordinates.

## Metadata and extensions

`metadata` is preserved as arbitrary JSON object content on clusters, nodes and links. `extensions` preserves namespaced top-level payload not interpreted by the core.

Rules:

- do not duplicate canonical fields inside metadata;
- avoid binary blobs and long documents;
- use JSON-native values;
- use namespaced extension keys, such as `acl.mapping` or `citadel.runtime`;
- adapters must preserve unknown metadata during canonical roundtrip.

## Structural versus semantic validation

The JSON Schema validates shape, allowed properties and primitive constraints. Semantic validation checks:

- identity uniqueness;
- cluster and endpoint references;
- repeated relations;
- axis range and field coverage;
- isolated nodes;
- graph density;
- declared performance envelope;
- serialized size.

Warnings do not block loading. Errors do.

## Performance envelope

These are declared engineering targets, not metaphysical limits:

| Surface | Nodes | Links | Meaning |
|---|---:|---:|---|
| Mobile recommended | 750 | 2,500 | Expected to remain comfortably interactive on current mobile hardware with ordinary labels and particles. |
| Desktop recommended | 2,000 | 8,000 | Default quality target. Above this, validation warns and QA on target hardware is required. |
| Stress boundary | 5,000 | 20,000 | Experimental territory. Responsiveness is not guaranteed without level of detail, aggregation and visual degradation. |

Additional warnings occur above average degree 20 or serialized size 10 MB. A formally valid dataset can still be visually unreadable or computationally excessive.

## Version policy

- Patch changes clarify docs or validation without changing accepted canonical shape.
- Minor schema changes add compatible fields or formalize migrations.
- Major schema changes break canonical compatibility.
- Current canonical output is always 1.1.
- Version 1.0 remains readable through migration, not writable as canonical output.
- Unsupported versions fail explicitly; they are not guessed.

## Migration 1.0 → 1.1

The migration layer:

- changes `schemaVersion` to `1.1`;
- infers missing clusters from `nodes[].cluster`;
- generates deterministic IDs for links without IDs;
- converts singular `layout.axis` into `layout.axes`;
- removes the legacy singular axis from canonical output;
- validates the result against the strict 1.1 contract;
- returns migrations and warnings separately from the dataset.

## Roundtrip guarantees

Strong guarantee:

```text
canonical 1.1 JSON → import → edit/store → serialize → canonical 1.1 JSON
```

The structural and semantic content must survive, including unknown metadata and extensions.

Adapter guarantee:

```text
foreign dialect → adapter → canonical 1.1 → serialize → canonical 1.1 reimport
```

The adapter promises preservation of every field it knows how to map. It cannot restore information absent from the source dialect.

## Runtime firewall

`GraphStore` accepts only valid canonical 1.1 data. It clones nodes and links before handing them to the renderer. Runtime mutation may add coordinates, velocity, fixed points, endpoint objects and semantic targets, but none of those mutations alter the canonical source.

# Migration Guide — Dataset 1.0 to 1.1

## Breaking canonical changes

1. `schemaVersion` becomes `1.1`.
2. `clusters` is required.
3. Every link requires a stable `id`.
4. `layout.axis` is legacy; canonical output uses `layout.axes` with X, Y and Z.
5. Structural objects reject unknown fields; use `metadata` or `extensions` for project-specific content.
6. The public JSON Schema is now the single structural source imported by runtime validation.

## Automatic migration

Importing a 1.0 file through the engine runs `normalizeDataset()` automatically. The migration result includes:

- the canonical 1.1 dataset;
- source version;
- migrations performed;
- non-blocking warnings.

Canonical 1.1 files are validated strictly and are not silently repaired.

## Manual conversion checklist

- Add `clusters`, even when empty.
- Ensure every node references a declared cluster.
- Add stable IDs to every link.
- Replace singular `layout.axis` with all three `layout.axes` entries.
- Move unknown top-level properties into `extensions`.
- Move unknown entity properties into `metadata`.
- Validate against `schema/graph-dataset.schema.json`.
